// Test builders for engine contract values. Test-only: app code never
// imports this module.
import { DRIVER_CATALOG, getDriverMeta } from "../catalog";
import type { EngineCapabilities } from "./capabilities";
import { defaultInstanceIdForDriver, type DriverKind } from "./ids";
import type { BaseInstanceConfig, ResolvedEngineInstance } from "./instance";
import type { EngineModel } from "./models";
import { computeEngineSnapshotUsable, type EngineSnapshot } from "./snapshot";

function capabilitiesFor(driver: DriverKind): EngineCapabilities {
  return (getDriverMeta(driver) ?? DRIVER_CATALOG.codex).capabilities;
}

export function makeFakeModel(
  overrides: Partial<EngineModel> = {},
): EngineModel {
  return {
    id: "model-1",
    inputModalities: ["text"],
    isCustom: false,
    name: "Model 1",
    options: [],
    source: "live",
    ...overrides,
  };
}

export function makeFakeSnapshot(
  overrides: Partial<EngineSnapshot> = {},
): EngineSnapshot {
  const driver = overrides.driver ?? "codex";
  const instanceId = overrides.instanceId ?? defaultInstanceIdForDriver(driver);
  const meta = getDriverMeta(driver);
  const snapshot: EngineSnapshot = {
    accentColor: null,
    auth: {
      canLogin: false,
      canLogout: false,
      email: null,
      label: null,
      method: null,
      plan: null,
      status: "authenticated",
    },
    availability: "available",
    badgeLabel: null,
    capabilities: capabilitiesFor(driver),
    checkedAt: "2026-10-07T00:00:00.000Z",
    compatibilityAdvisory: null,
    defaultModelId: null,
    description: meta?.description ?? "",
    driver,
    enabled: true,
    iconUrl: null,
    install: {
      installed: true,
      path: `/usr/local/bin/${driver}`,
      source: "managed-path",
      version: "1.0.0",
    },
    installState: null,
    instanceId,
    isDefaultInstance: instanceId === defaultInstanceIdForDriver(driver),
    label: meta?.label ?? driver,
    lastSuccessfulProbeAt: "2026-10-07T00:00:00.000Z",
    message: null,
    models: [makeFakeModel()],
    runtimePaths: null,
    setup: {
      canAuthenticate: false,
      canInstall: false,
      canUpdate: false,
      docsUrl: meta?.docsUrl ?? null,
      installHint: null,
    },
    skills: [],
    slashCommands: [],
    stale: false,
    status: "ready",
    unavailableReason: null,
    updateState: null,
    usable: true,
    usageLimits: null,
    versionAdvisory: null,
    ...overrides,
  };

  return overrides.usable === undefined
    ? { ...snapshot, usable: computeEngineSnapshotUsable(snapshot) }
    : snapshot;
}

export function makeFakeInstance<
  C extends BaseInstanceConfig = BaseInstanceConfig,
>(
  overrides: Partial<ResolvedEngineInstance<C>> = {},
): ResolvedEngineInstance<C> {
  const driver = overrides.driver ?? "codex";
  const id = overrides.id ?? defaultInstanceIdForDriver(driver);

  return {
    accentColor: null,
    config: {} as C,
    continuationKey: `${driver}:instance:${id}`,
    customModels: [],
    driver,
    enabled: true,
    env: {},
    envOverrides: {},
    envUnset: [],
    id,
    isDefault: id === defaultInstanceIdForDriver(driver),
    label: getDriverMeta(driver)?.label ?? driver,
    sortOrder: 0,
    stateDir: `/tmp/sentinel-test/engines/${id}`,
    ...overrides,
  };
}
