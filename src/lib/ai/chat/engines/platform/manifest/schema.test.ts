import { describe, expect, it, mock } from "bun:test";

import bundledManifestJson from "../../../../../../../manifests/engine-manifest.v1.json";
import { BUILTIN_DRIVER_KINDS } from "../../catalog";
import { ENGINE_MODEL_ID_PATTERN } from "../../contract";
import { resolveEngineCompatibility } from "./compatibility";
import {
  engineManifestSchema,
  getManifestUpdatedAtMs,
  normalizeVersionRange,
  parseEngineManifest,
} from "./schema";

mock.module("server-only", () => ({}));

const {
  OPENCODE_MINIMUM_VERSION,
  OPENCODE_RECOMMENDED_RANGE,
  OPENCODE_RECOMMENDED_VERSION,
} = await import("../../opencode-sdk");

const bundled = engineManifestSchema.parse(bundledManifestJson);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("bundled engine manifest", () => {
  it("validates and describes every built-in driver but the built-in engine", () => {
    expect(bundled.schemaVersion).toBe(1);
    for (const driver of BUILTIN_DRIVER_KINDS) {
      if (driver === "sentinel") {
        expect(bundled.drivers[driver]).toBeUndefined();
        continue;
      }
      expect(bundled.drivers[driver]).toBeDefined();
    }
  });

  it("has a compatibility policy for every driver with a versioned runtime", () => {
    for (const driver of [
      "claude",
      "codex",
      "copilot",
      "cursor",
      "opencode",
      "grok",
      "antigravity",
      "pi",
    ]) {
      expect(
        bundled.compatibility.some((policy) => policy.driver === driver),
      ).toBe(true);
    }
  });

  it("only carries model ids that are safe on a command line", () => {
    for (const driver of Object.values(bundled.drivers)) {
      for (const model of driver.models) {
        expect(model.id).toMatch(ENGINE_MODEL_ID_PATTERN);
      }
    }
  });

  it("lists the Claude models Sentinel offers, with max effort on the current ones", () => {
    const claude = bundled.drivers.claude!;
    const ids = claude.models
      .filter((model) => model.status === "current")
      .map((model) => model.id);
    for (const id of [
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-fable-5-1",
      "claude-haiku-4-5",
    ]) {
      expect(ids).toContain(id);
    }
    expect(claude.defaults?.chat).toBe("claude-fable-5-1");

    const opus = claude.profiles["opus-5-5"]!;
    const effort = opus.options.find((option) => option.id === "effort");
    expect(
      effort?.type === "select" && effort.choices.map((c) => c.id),
    ).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(opus.options.map((option) => option.id)).toEqual([
      "effort",
      "fastMode",
      "contextWindow",
    ]);
    expect(
      claude.models.find((model) => model.id === "claude-opus-4-8")?.status,
    ).toBe("legacy");
  });

  it("keeps the OpenCode policy in step with the runtime's own floors", () => {
    const advisory = (version: string) =>
      resolveEngineCompatibility({
        driver: "opencode",
        policies: bundled.compatibility,
        version,
      })!;

    expect(advisory(OPENCODE_RECOMMENDED_VERSION).status).toBe("supported");
    expect(advisory(OPENCODE_MINIMUM_VERSION).status).toBe("graceful");
    expect(advisory("1.0.223").status).toBe("broken");
    expect(advisory("2.0.18").status).toBe("unsupported");
    expect(advisory("1.3.17")).toEqual(
      expect.objectContaining({
        recommendedRange: OPENCODE_RECOMMENDED_RANGE,
        recommendedVersion: OPENCODE_RECOMMENDED_VERSION,
        status: "graceful",
      }),
    );
  });
});

describe("parseEngineManifest", () => {
  it("rejects a newer schema version", () => {
    expect(parseEngineManifest({ ...clone(bundled), schemaVersion: 2 })).toBe(
      null,
    );
  });

  it("rejects unsafe model ids, unknown profiles and a missing default", () => {
    const unsafe = clone(bundled);
    unsafe.drivers.codex!.models[0]!.id = "gpt-6; rm -rf /";
    expect(parseEngineManifest(unsafe)).toBe(null);

    const unknownProfile = clone(bundled);
    unknownProfile.drivers.codex!.models[0]!.profile = "nope";
    expect(parseEngineManifest(unknownProfile)).toBe(null);

    const missingDefault = clone(bundled);
    missingDefault.drivers.codex!.defaults = { chat: "gpt-unknown" };
    expect(parseEngineManifest(missingDefault)).toBe(null);
  });

  it("rejects duplicate ids or aliases within a driver", () => {
    const duplicate = clone(bundled);
    duplicate.drivers.claude!.models[1]!.aliases = ["claude-opus-5-5"];
    expect(parseEngineManifest(duplicate)).toBe(null);
  });

  it("rejects a recommended version outside the supported ranges", () => {
    const manifest = clone(bundled);
    const opencode = manifest.compatibility.find(
      (policy) => policy.driver === "opencode",
    )!;
    opencode.recommendedVersion = "1.3.17";
    expect(parseEngineManifest(manifest)).toBe(null);
  });

  it("drops unknown keys and option types a newer manifest may add", () => {
    const manifest = clone(bundled) as unknown as Record<string, unknown> & {
      drivers: Record<
        string,
        { profiles: Record<string, { options: unknown[] }> }
      >;
    };
    manifest.futureField = { anything: true };
    manifest.drivers.claude!.profiles["opus-5-5"]!.options.push({
      id: "budget",
      type: "number",
    });

    const parsed = parseEngineManifest(manifest);
    expect(parsed).not.toBe(null);
    expect(parsed).not.toHaveProperty("futureField");
    expect(
      parsed!.drivers.claude!.profiles["opus-5-5"]!.options.map(
        (option) => option.id,
      ),
    ).toEqual(["effort", "fastMode", "contextWindow"]);
  });

  it("reads updatedAt", () => {
    expect(getManifestUpdatedAtMs(bundled)).toBe(Date.parse(bundled.updatedAt));
  });
});

describe("normalizeVersionRange", () => {
  it("accepts leading zeros and rejects garbage", () => {
    expect(normalizeVersionRange(">=2026.05.09")).toBe(">=2026.5.9");
    expect(normalizeVersionRange(">=1.0.0 <2.0.0")).toBe(">=1.0.0 <2.0.0");
    expect(normalizeVersionRange("not a range")).toBe(null);
  });
});
