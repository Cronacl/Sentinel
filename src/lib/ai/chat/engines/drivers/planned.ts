import "server-only";

import { DRIVER_CATALOG, type BuiltinDriverKind } from "../catalog";
import {
  defaultInstanceIdForDriver,
  type EngineProbeResult,
} from "../contract";
import {
  defineEngineDriver,
  LEGACY_EXTERNAL_THREAD_TRIGGERS,
  type EngineDriver,
} from "../platform/driver";
import { EngineInstanceUnavailableError } from "../platform/errors";

// The registration slot of a kind the catalog declares but this build does
// not implement yet (status "planned"). platform/drivers.ts lists one per
// planned kind, so the lane that implements it replaces only its own
// drivers/<kind>.ts and flips its catalog entry to "available". Until then
// getEngineDriver never serves the stub: instances of the kind stay
// unavailable ("driver-planned") and nothing dispatches to it. The probe
// and thread handlers below only answer callers that reach the stub
// directly.

/** Kinds whose catalog entry is still "planned". */
export type PlannedDriverKind = {
  [
    K in BuiltinDriverKind
  ]: (typeof DRIVER_CATALOG)[K]["status"] extends "planned" ? K : never;
}[BuiltinDriverKind];

export function getPlannedDriverMessage(label: string) {
  return `${label} is not available in this build yet.`;
}

/**
 * A stub driver for a planned kind. Typed to planned kinds only: once the
 * catalog entry flips to "available", the slot no longer compiles until the
 * real driver replaces it.
 */
export function definePlannedEngineDriver(
  kind: PlannedDriverKind,
): EngineDriver {
  const meta = DRIVER_CATALOG[kind];
  const message = getPlannedDriverMessage(meta.label);
  const unavailable = (instanceId: string) =>
    new EngineInstanceUnavailableError(
      instanceId,
      kind,
      "driver-planned",
      message,
    );

  return defineEngineDriver({
    capabilities: meta.capabilities,
    kind,
    meta,
    async probe(): Promise<EngineProbeResult> {
      return {
        auth: {
          canLogin: false,
          canLogout: false,
          email: null,
          label: null,
          method: null,
          plan: null,
          status: "unknown",
        },
        install: { installed: false, path: null, source: null, version: null },
        message,
        models: [],
        status: "error",
      };
    },
    probeTimeoutMs: 1_000,
    // Nothing to re-check until the driver lands.
    snapshotTtlMs: 60 * 60 * 1_000,
    thread: {
      async run({ instance }) {
        throw unavailable(instance.id);
      },
      async stop({ instance }) {
        throw unavailable(instance?.id ?? defaultInstanceIdForDriver(kind));
      },
      triggers: LEGACY_EXTERNAL_THREAD_TRIGGERS,
    },
  });
}
