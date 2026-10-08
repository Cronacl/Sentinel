import "server-only";

import type { EngineSnapshot } from "../../contract";
import { getEngineManifestService } from "../manifest/service";
import { getEngineNetworkSettingsStore } from "../network-settings";
import type { EngineSnapshotEnricher } from "../snapshot-service";
import {
  inspectMaintenance,
  type MaintenanceInspectDeps,
  type MaintenanceInspection,
} from "./inspect";
import { buildMaintenanceEnv } from "./env";
import { getLatestVersionLookup } from "./latest-version";

// The "update-state" snapshot enricher: the instance's version advisory
// (newest release, whether it is behind, the update command), what can be
// installed when the runtime is missing (setup.canInstall/installHint). It
// never waits long: a cold version lookup gets a short head start, then
// finishes in the background for the next probe. The state of a running or
// finished install or update is not part of the cached snapshot: the
// snapshot service lays the runner's live state over every snapshot it
// returns or emits.

const COLD_LOOKUP_WAIT_MS = 1_500;

export type UpdateStateEnricherDeps = {
  inspect?: Partial<MaintenanceInspectDeps>;
};

const sharedPlanCache: NonNullable<MaintenanceInspectDeps["planCache"]> =
  new Map();
const sharedToolCache: NonNullable<MaintenanceInspectDeps["toolCache"]> =
  new Map();

export function getMaintenanceInspectDeps(
  overrides: Partial<MaintenanceInspectDeps> = {},
): MaintenanceInspectDeps {
  return {
    latest: getLatestVersionLookup(),
    manifest: () => getEngineManifestService().current(),
    planCache: sharedPlanCache,
    toolCache: sharedToolCache,
    updateChecksEnabled: () =>
      getEngineNetworkSettingsStore().isEnabled("updateChecks"),
    ...overrides,
  };
}

/** The snapshot fields a maintenance inspection fills in. */
export function applyMaintenanceInspection(
  snapshot: EngineSnapshot,
  inspection: MaintenanceInspection,
): EngineSnapshot {
  if (!inspection.definition) {
    return snapshot;
  }

  if (!snapshot.install.installed) {
    const available = inspection.installOptions.find(
      (option) => option.available,
    );
    return {
      ...snapshot,
      setup: {
        ...snapshot.setup,
        canInstall: available !== undefined,
        canUpdate: false,
        installHint:
          available?.command ??
          inspection.installHint ??
          snapshot.setup.installHint,
      },
      versionAdvisory: null,
    };
  }

  return {
    ...snapshot,
    setup: {
      ...snapshot.setup,
      canInstall: false,
      canUpdate: inspection.canUpdate,
      installHint: inspection.bundled
        ? "Bundled with Sentinel."
        : snapshot.setup.installHint,
    },
    versionAdvisory: {
      canUpdate: inspection.canUpdate,
      checkedAt:
        inspection.checkedAt === null
          ? null
          : new Date(inspection.checkedAt).toISOString(),
      currentVersion: inspection.currentVersion,
      latestVersion: inspection.latestVersion,
      status: inspection.versionStatus,
      updateCommand:
        inspection.plan?.kind === "command"
          ? inspection.plan.command.display
          : null,
    },
  };
}

export function createUpdateStateEnricher(
  deps: UpdateStateEnricherDeps = {},
): EngineSnapshotEnricher {
  return {
    async enrich({ driver, instance, snapshot }, { signal }) {
      if (!snapshot.enabled || snapshot.availability !== "available") {
        return snapshot;
      }

      const inspection = await inspectMaintenance(
        {
          driver,
          env: buildMaintenanceEnv(instance),
          latestMode: "cache",
          signal,
          snapshot,
          waitMs: COLD_LOOKUP_WAIT_MS,
        },
        getMaintenanceInspectDeps(deps.inspect),
      );
      return applyMaintenanceInspection(snapshot, inspection);
    },
    id: "update-state",
  };
}
