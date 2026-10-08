import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { makeFakeInstance, makeFakeModel, makeFakeSnapshot } =
  await import("../../contract/testing");
const { DRIVER_CATALOG } = await import("../../catalog");
const { BUNDLED_ENGINE_MANIFEST } = await import("./bundled");
const {
  applyCompatibility,
  createCompatibilityEnricher,
  createCustomModelsEnricher,
  createManifestEnricher,
} = await import("./enrichers");
const { DEFAULT_ENGINE_SNAPSHOT_ENRICHERS, ENGINE_SNAPSHOT_ENRICHER_IDS } =
  await import("../snapshot-service");

import type { EngineProbeResult } from "../../contract";
import type { EngineDriver } from "../driver";

const signal = new AbortController().signal;

function manifestService() {
  const refreshInBackground = mock(() => {});
  return {
    refreshInBackground,
    service: {
      current: async () => BUNDLED_ENGINE_MANIFEST,
      refreshInBackground,
    },
  };
}

function driverFor(kind: "claude" | "codex" | "opencode") {
  return { kind, meta: DRIVER_CATALOG[kind] } as unknown as EngineDriver;
}

const NO_PROBE = null as EngineProbeResult | null;

describe("platform enrichers", () => {
  it("are wired in the snapshot service in their documented order", () => {
    expect(
      DEFAULT_ENGINE_SNAPSHOT_ENRICHERS.map((enricher) => enricher.id),
    ).toEqual([...ENGINE_SNAPSHOT_ENRICHER_IDS]);
  });

  it("applies the manifest and refreshes it in the background", async () => {
    const { refreshInBackground, service } = manifestService();
    const enricher = createManifestEnricher({ manifest: () => service });
    const snapshot = makeFakeSnapshot({
      driver: "claude",
      models: [makeFakeModel({ id: "claude-opus-4-7" })],
    });

    const result = await enricher.enrich(
      {
        driver: driverFor("claude"),
        instance: makeFakeInstance({ driver: "claude" }),
        probe: NO_PROBE,
        snapshot,
        userId: "user-1",
      },
      { signal },
    );

    expect(result.models[0]).toEqual(
      expect.objectContaining({ contextWindow: 1_000_000, isLegacy: true }),
    );
    expect(refreshInBackground).toHaveBeenCalledTimes(1);
  });

  it("adds the instance's custom models where the driver supports them", async () => {
    const { service } = manifestService();
    const enricher = createCustomModelsEnricher({ manifest: () => service });
    const instance = makeFakeInstance({
      customModels: [{ id: "gpt-6-astra-preview", name: "Astra preview" }],
      driver: "codex",
    });

    const result = await enricher.enrich(
      {
        driver: driverFor("codex"),
        instance,
        probe: NO_PROBE,
        snapshot: makeFakeSnapshot({ driver: "codex" }),
        userId: "user-1",
      },
      { signal },
    );
    expect(result.models.map((model) => model.id)).toEqual([
      "model-1",
      "gpt-6-astra-preview",
    ]);
    expect(result.models[1]!.options.map((option) => option.id)).toEqual([
      "effort",
    ]);

    const builtin = makeFakeSnapshot({
      capabilities: DRIVER_CATALOG.sentinel.capabilities,
      driver: "sentinel",
    });
    expect(
      await enricher.enrich(
        {
          driver: driverFor("codex"),
          instance,
          probe: NO_PROBE,
          snapshot: builtin,
          userId: "user-1",
        },
        { signal },
      ),
    ).toBe(builtin);
  });

  it("combines the runtime's advisory with the manifest's", async () => {
    const { service } = manifestService();
    const enricher = createCompatibilityEnricher({ manifest: () => service });
    const snapshot = makeFakeSnapshot({
      driver: "opencode",
      install: {
        installed: true,
        path: "/Users/me/.opencode/bin/opencode",
        source: "managed-path",
        version: "1.3.17",
      },
    });
    const runtimeAdvisory = {
      message: "OpenCode 1.3.17 still works (runtime).",
      recommendedRange: ">=1.14.19 <2.0.0",
      recommendedVersion: "1.14.19",
      status: "graceful" as const,
    };

    const result = await enricher.enrich(
      {
        driver: driverFor("opencode"),
        instance: makeFakeInstance({ driver: "opencode" }),
        probe: {
          auth: snapshot.auth,
          compatibilityAdvisory: runtimeAdvisory,
          install: snapshot.install,
          models: [],
          status: "ready",
        },
        snapshot: { ...snapshot, compatibilityAdvisory: runtimeAdvisory },
        userId: "user-1",
      },
      { signal },
    );

    expect(result.compatibilityAdvisory).toEqual(runtimeAdvisory);
  });

  it("marks a broken runtime from the manifest alone", () => {
    const snapshot = makeFakeSnapshot({
      driver: "grok",
      install: {
        installed: true,
        path: "/Users/me/.local/bin/grok",
        source: "managed-path",
        version: "grok 0.2.39 (55a20b703aa)",
      },
    });
    const result = applyCompatibility(snapshot, BUNDLED_ENGINE_MANIFEST, {
      runtimeAdvisory: null,
    });
    expect(result.compatibilityAdvisory?.status).toBe("broken");

    const missing = makeFakeSnapshot({
      driver: "grok",
      install: { installed: false, path: null, source: null, version: null },
    });
    expect(
      applyCompatibility(missing, BUNDLED_ENGINE_MANIFEST, {
        runtimeAdvisory: null,
      }),
    ).toBe(missing);
  });
});
