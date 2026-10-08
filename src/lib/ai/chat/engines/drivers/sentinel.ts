import "server-only";

import { DRIVER_CATALOG } from "../catalog";
import { defineEngineDriver } from "../platform/driver";

/**
 * The built-in engine: always installed and ready. Its models come from the
 * provider catalog and the user's model preferences at query time, so the
 * snapshot carries none. Runs go through the orchestrator, not a driver.
 */
export const sentinelDriver = defineEngineDriver({
  capabilities: DRIVER_CATALOG.sentinel.capabilities,
  kind: "sentinel",
  meta: DRIVER_CATALOG.sentinel,
  async probe() {
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
      defaultModelId: null,
      install: { installed: true, path: null, source: null, version: null },
      models: [],
      status: "ready",
    };
  },
  probeTimeoutMs: 1_000,
  // Nothing to re-check.
  snapshotTtlMs: 60 * 60 * 1_000,
});
