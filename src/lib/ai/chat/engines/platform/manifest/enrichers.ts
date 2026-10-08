import "server-only";

import type { EngineSnapshot } from "../../contract";
import type { EngineSnapshotEnricher } from "../snapshot-service";
import {
  combineCompatibilityAdvisories,
  resolveEngineCompatibility,
} from "./compatibility";
import {
  applyCustomModels,
  applyManifestModels,
  getRuntimeOptionIds,
} from "./models";
import type { EngineManifest } from "./schema";
import {
  getEngineManifestService,
  type EngineManifestService,
} from "./service";

// The manifest's snapshot enrichers (snapshot-service.ts runs them after
// every probe, in order): models, then the instance's custom models, then
// the compatibility advisory. None waits on the network: they read the
// manifest in effect and let a refresh run in the background.

export type ManifestEnricherDeps = {
  manifest?: () => Pick<
    EngineManifestService,
    "current" | "refreshInBackground"
  >;
  sentinelVersion?: string;
};

function manifestOf(deps: ManifestEnricherDeps) {
  return (deps.manifest ?? getEngineManifestService)();
}

export function createManifestEnricher(
  deps: ManifestEnricherDeps = {},
): EngineSnapshotEnricher {
  return {
    async enrich({ driver, snapshot }) {
      const service = manifestOf(deps);
      const manifest = await service.current();
      service.refreshInBackground();
      return applyManifestModels(snapshot, manifest, {
        optionIds: getRuntimeOptionIds(driver.kind),
      });
    },
    id: "manifest",
  };
}

export function createCustomModelsEnricher(
  deps: ManifestEnricherDeps = {},
): EngineSnapshotEnricher {
  return {
    async enrich({ driver, instance, snapshot }) {
      if (!snapshot.capabilities.supportsCustomModels) {
        return snapshot;
      }
      return applyCustomModels(snapshot, instance.customModels, {
        manifest: await manifestOf(deps).current(),
        optionIds: getRuntimeOptionIds(driver.kind),
      });
    },
    id: "custom-models",
  };
}

/**
 * The compatibility advisory for an installed, enabled runtime: the
 * manifest's policy combined with what the runtime itself reported (its
 * protocol floor). Anything else keeps the advisory the probe gave.
 */
export function applyCompatibility(
  snapshot: EngineSnapshot,
  manifest: Pick<EngineManifest, "compatibility">,
  options: {
    runtimeAdvisory: EngineSnapshot["compatibilityAdvisory"] | undefined;
    sentinelVersion?: string;
  },
): EngineSnapshot {
  if (!snapshot.enabled || !snapshot.install.installed) {
    return snapshot;
  }

  const fromManifest = resolveEngineCompatibility({
    driver: snapshot.driver,
    policies: manifest.compatibility,
    sentinelVersion: options.sentinelVersion,
    version: snapshot.install.version,
  });
  return {
    ...snapshot,
    compatibilityAdvisory: combineCompatibilityAdvisories(
      options.runtimeAdvisory ?? null,
      fromManifest,
    ),
  };
}

export function createCompatibilityEnricher(
  deps: ManifestEnricherDeps = {},
): EngineSnapshotEnricher {
  return {
    async enrich({ probe, snapshot }) {
      // The probe's own advisory when there was one; a stale snapshot (the
      // probe timed out) is re-evaluated from the advisory it carries.
      const runtimeAdvisory = probe
        ? (probe.compatibilityAdvisory ?? null)
        : snapshot.compatibilityAdvisory;
      return applyCompatibility(snapshot, await manifestOf(deps).current(), {
        runtimeAdvisory,
        sentinelVersion: deps.sentinelVersion,
      });
    },
    id: "compatibility",
  };
}
