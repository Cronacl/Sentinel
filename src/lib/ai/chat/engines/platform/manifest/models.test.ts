import { describe, expect, it } from "bun:test";

import bundledManifestJson from "../../../../../../../manifests/engine-manifest.v1.json";
import { makeFakeModel, makeFakeSnapshot } from "../../contract/testing";
import type { EngineOptionDescriptor } from "../../contract";
import {
  applyCustomModels,
  applyManifestModels,
  findManifestModel,
  getRuntimeOptionIds,
} from "./models";
import { engineManifestSchema } from "./schema";

const manifest = engineManifestSchema.parse(bundledManifestJson);

const effort = (ids: string[], defaultId?: string): EngineOptionDescriptor => ({
  choices: ids.map((id) => ({
    id,
    label: id,
    ...(id === defaultId ? { isDefault: true } : {}),
  })),
  id: "effort",
  label: "Reasoning effort",
  role: "reasoning",
  type: "select",
});

describe("findManifestModel", () => {
  it("matches by id, a [1m] suffix, then aliases", () => {
    const claude = manifest.drivers.claude!;
    expect(findManifestModel(claude, ["claude-opus-5-5"])?.id).toBe(
      "claude-opus-5-5",
    );
    expect(findManifestModel(claude, ["claude-sonnet-5-5[1m]"])?.id).toBe(
      "claude-sonnet-5-5",
    );
    expect(findManifestModel(claude, ["sonnet-5.5"])?.id).toBe(
      "claude-sonnet-5-5",
    );
    expect(findManifestModel(claude, ["default", undefined])).toBe(null);
  });
});

describe("applyManifestModels", () => {
  it("classifies live models and fills only descriptors the runtime reads", () => {
    const snapshot = makeFakeSnapshot({
      driver: "claude",
      models: [
        makeFakeModel({ id: "claude-opus-5-5", name: "Opus 5.5" }),
        makeFakeModel({
          id: "claude-opus-4-8",
          name: "Opus 4.8",
          options: [effort(["low", "high"], "high")],
        }),
        makeFakeModel({ id: "default", name: "Default" }),
      ],
    });

    const result = applyManifestModels(snapshot, manifest);
    const [opus55, opus48, other] = result.models;

    expect(opus55).toEqual(
      expect.objectContaining({
        badge: "new",
        contextWindow: 200_000,
        name: "Opus 5.5",
        source: "live",
      }),
    );
    // The manifest's effort descriptor (with max); fast mode and the
    // context window are not offered until the runtime reads them.
    expect(opus55!.options.map((option) => option.id)).toEqual(["effort"]);
    const opusEffort = opus55!.options[0]!;
    expect(
      opusEffort.type === "select" && opusEffort.choices.map((c) => c.id),
    ).toContain("max");

    // Live descriptors win.
    expect(opus48).toEqual(
      expect.objectContaining({ contextWindow: 1_000_000, isLegacy: true }),
    );
    expect(opus48!.options).toEqual([effort(["low", "high"], "high")]);
    expect(other).toEqual(snapshot.models[2]);
    expect(result.models).toHaveLength(3);
  });

  it("does not replace the runtime's default model", () => {
    const snapshot = makeFakeSnapshot({
      defaultModelId: "gpt-6-luna",
      driver: "codex",
      models: [
        makeFakeModel({ id: "gpt-6-astra" }),
        makeFakeModel({ id: "gpt-6-luna", isDefault: true }),
      ],
    });
    expect(applyManifestModels(snapshot, manifest).defaultModelId).toBe(
      "gpt-6-luna",
    );
  });

  it("names the manifest default when the runtime names none", () => {
    const snapshot = makeFakeSnapshot({
      defaultModelId: null,
      driver: "codex",
      models: [
        makeFakeModel({ id: "gpt-6-luna" }),
        makeFakeModel({ id: "gpt-6-astra" }),
      ],
    });
    const result = applyManifestModels(snapshot, manifest);
    expect(result.defaultModelId).toBe("gpt-6-astra");
    expect(result.models.find((model) => model.isDefault)?.id).toBe(
      "gpt-6-astra",
    );
  });

  it("stands in with current catalog models for a usable runtime that reported none", () => {
    const snapshot = makeFakeSnapshot({
      defaultModelId: null,
      driver: "claude",
      install: {
        installed: true,
        path: "/usr/local/bin/claude",
        source: "managed-path",
        version: "2.1.260 (Claude Code)",
      },
      models: [],
    });

    const result = applyManifestModels(snapshot, manifest);
    const ids = result.models.map((model) => model.id);

    expect(ids).toContain("claude-fable-5-1");
    expect(ids).not.toContain("claude-opus-4-8");
    expect(result.models.every((model) => model.source === "manifest")).toBe(
      true,
    );
    // Opus 5.5 needs Claude Code 2.1.280.
    expect(
      result.models.find((model) => model.id === "claude-opus-5-5")
        ?.disabledReason,
    ).toBe("Needs version 2.1.280 or newer.");
    expect(result.defaultModelId).toBe("claude-fable-5-1");
  });

  it("adds nothing for a runtime that is not usable", () => {
    for (const snapshot of [
      makeFakeSnapshot({
        driver: "claude",
        install: {
          installed: false,
          path: null,
          source: null,
          version: null,
        },
        models: [],
        status: "error",
      }),
      makeFakeSnapshot({
        auth: { ...makeFakeSnapshot().auth, status: "unauthenticated" },
        driver: "claude",
        models: [],
        status: "warning",
      }),
    ]) {
      expect(applyManifestModels(snapshot, manifest).models).toEqual([]);
    }
  });

  it("lists the whole catalog for catalog drivers", () => {
    const snapshot = makeFakeSnapshot({
      defaultModelId: null,
      driver: "antigravity",
      models: [],
    });
    const result = applyManifestModels(snapshot, manifest);
    expect(result.models.map((model) => model.id)).toEqual([
      "gemini-3.8-flash-high",
      "gemini-3.8-flash-medium",
      "gemini-3.8-flash-low",
    ]);
    expect(result.defaultModelId).toBe("gemini-3.8-flash-high");
  });

  it("is idempotent and leaves unknown drivers alone", () => {
    const snapshot = makeFakeSnapshot({
      defaultModelId: null,
      driver: "claude",
      models: [],
    });
    const once = applyManifestModels(snapshot, manifest);
    expect(applyManifestModels(once, manifest)).toEqual(once);

    const unknown = makeFakeSnapshot({ driver: "gemini" });
    expect(applyManifestModels(unknown, manifest)).toBe(unknown);
  });
});

describe("applyCustomModels", () => {
  it("appends custom models with the manifest's descriptors", () => {
    const snapshot = makeFakeSnapshot({
      driver: "claude",
      models: [makeFakeModel({ id: "claude-fable-5-1" })],
    });

    const result = applyCustomModels(
      snapshot,
      [
        { id: "claude-opus-5-5[1m]", name: "Opus 5.5 (1M)" },
        { id: "my-proxy-model" },
      ],
      { manifest },
    );

    expect(result.models.map((model) => model.id)).toEqual([
      "claude-fable-5-1",
      "claude-opus-5-5[1m]",
      "my-proxy-model",
    ]);
    const [, opus, proxy] = result.models;
    expect(opus).toEqual(
      expect.objectContaining({
        isCustom: true,
        name: "Opus 5.5 (1M)",
        source: "custom",
      }),
    );
    expect(opus!.options.map((option) => option.id)).toEqual(["effort"]);
    expect(proxy).toEqual(
      expect.objectContaining({ name: "my-proxy-model", options: [] }),
    );
  });

  it("gives unknown custom models the driver's default profile", () => {
    const snapshot = makeFakeSnapshot({ driver: "copilot", models: [] });
    const [custom] = applyCustomModels(snapshot, [{ id: "gpt-x" }], {
      manifest,
    }).models;
    expect(custom!.options).toEqual([
      expect.objectContaining({ id: "effort", role: "reasoning" }),
    ]);
  });

  it("overrides a listed model's name and descriptors instead of duplicating it", () => {
    const snapshot = makeFakeSnapshot({
      driver: "codex",
      models: [makeFakeModel({ id: "gpt-6-astra", name: "GPT-6 Astra" })],
    });
    const options = [effort(["high"], "high")];
    const result = applyCustomModels(
      snapshot,
      [{ id: "gpt-6-astra", name: "Astra (team)", options }],
      { manifest },
    );
    expect(result.models).toEqual([
      expect.objectContaining({
        id: "gpt-6-astra",
        isCustom: false,
        name: "Astra (team)",
        options,
      }),
    ]);
  });

  it("replaces earlier custom models and adds none to a runtime that is not installed", () => {
    const snapshot = makeFakeSnapshot({ driver: "codex", models: [] });
    const first = applyCustomModels(snapshot, [{ id: "a" }, { id: "b" }]);
    expect(
      applyCustomModels(first, [{ id: "b" }]).models.map((model) => model.id),
    ).toEqual(["b"]);

    const missing = makeFakeSnapshot({
      driver: "codex",
      install: { installed: false, path: null, source: null, version: null },
      models: [],
    });
    expect(applyCustomModels(missing, [{ id: "a" }]).models).toEqual([]);
  });
});

describe("getRuntimeOptionIds", () => {
  it("offers OpenCode its agent and variant and others the effort", () => {
    expect(getRuntimeOptionIds("opencode")).toEqual(["agent", "variant"]);
    expect(getRuntimeOptionIds("claude")).toEqual(["effort"]);
    expect(getRuntimeOptionIds("unknown")).toEqual(["effort"]);
  });
});
