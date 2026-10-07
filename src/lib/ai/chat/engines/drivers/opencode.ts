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
import { defineEngineDriver, legacyThreadHandlers } from "../platform/driver";
import { buildFallbackOpenCodeModels } from "./fallback-models";
import {
  carryForwardLegacyProbe,
  fromLegacyStatus,
  NO_LEGACY_ACCOUNT,
} from "./legacy-status";

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
    // Cheap: `--version` only (cached by the engine), the last full probe
    // carried forward while the binary is unchanged.
    if (options.depth === "cheap") {
      const runtime = await resolveOpenCodeRuntime({ instance });
      const carried = carryForwardLegacyProbe(options.previous, {
        installed: runtime.cliDetected,
        path: runtime.cliPath,
        source: runtime.cliDetected ? runtime.source : null,
        version: runtime.cliVersion,
      });
      if (carried) {
        return carried;
      }
    }

    // OpenCode answers within its 4 s window and kills the `opencode serve`
    // it started by its 20 s deadline; the platform's timeout is a backstop.
    const status = await getOpenCodeEngineStatus({
      forceRefresh: options.forceRefresh,
      instance,
    });
    const runtime = status.cliDetected
      ? await resolveOpenCodeRuntime({ instance })
      : null;
    return fromOpenCodeStatus(status, runtime?.source ?? null);
  },
  // A full probe starts an `opencode serve`: trust one for 10 minutes and
  // probe cheaply in between.
  fullProbeTtlMs: 10 * 60 * 1_000,
  // Above the 4 s status window plus binary resolution.
  probeTimeoutMs: 15_000,
  thread: legacyThreadHandlers(async () => {
    const runtime = await import("@/lib/ai/chat/runtime/opencode");
    return {
      run: runtime.runOpenCodeThreadChat,
      stop: runtime.stopOpenCodeThreadRun,
    };
  }),
});
