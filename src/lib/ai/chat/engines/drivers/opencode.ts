import "server-only";

import {
  getOpenCodeEngineStatus,
  isOpenCodeEngineAvailable,
  resetOpenCodeEngineStatusCache,
  resetOpenCodeRuntimeCache,
  resolveOpenCodeRuntime,
  type OpenCodeEngineStatus,
} from "@/lib/ai/chat/engines/opencode-sdk";

import { DRIVER_CATALOG } from "../catalog";
import type { EngineInstallSource, EngineProbeResult } from "../contract";
import { defineEngineDriver } from "../platform/driver";
import { buildFallbackOpenCodeModels } from "./fallback-models";
import { fromLegacyStatus, NO_LEGACY_ACCOUNT } from "./legacy-status";

export function fromOpenCodeStatus(
  status: OpenCodeEngineStatus,
  source: EngineInstallSource | null,
): EngineProbeResult {
  return fromLegacyStatus(
    {
      account: NO_LEGACY_ACCOUNT,
      authReady: status.authReady,
      compatibilityAdvisory: status.compatibilityAdvisory,
      error: status.error,
      installed: status.cliDetected,
      models: status.availableModels,
      path: status.cliPath,
      source,
      state: status.state,
      version: status.cliVersion,
    },
    {
      available: isOpenCodeEngineAvailable(status),
      fallbackModels: buildFallbackOpenCodeModels,
    },
  );
}

/** OpenCode through `opencode serve` and its SDK. */
export const openCodeDriver = defineEngineDriver({
  capabilities: DRIVER_CATALOG.opencode.capabilities,
  invalidate() {
    resetOpenCodeRuntimeCache();
    resetOpenCodeEngineStatusCache();
  },
  kind: "opencode",
  meta: DRIVER_CATALOG.opencode,
  async probe(instance, options) {
    const status = await getOpenCodeEngineStatus({
      forceRefresh: options.forceRefresh,
      instance,
    });
    const runtime = status.cliDetected
      ? await resolveOpenCodeRuntime({ instance })
      : null;
    return fromOpenCodeStatus(status, runtime?.source ?? null);
  },
  // The probe starts an `opencode serve`: keep a full probe for 10 minutes.
  fullProbeTtlMs: 10 * 60 * 1_000,
  // Above the 4 s status window plus binary resolution.
  probeTimeoutMs: 15_000,
});
