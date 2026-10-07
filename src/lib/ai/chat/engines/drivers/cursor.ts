import "server-only";

import {
  getCursorEngineStatus,
  isCursorEngineAvailable,
  resetCursorEngineStatusCache,
  resetCursorRuntimeCache,
  resolveCursorRuntime,
  type CursorEngineStatus,
} from "@/lib/ai/chat/engines/cursor-acp";

import { DRIVER_CATALOG } from "../catalog";
import type { EngineInstallSource, EngineProbeResult } from "../contract";
import { defineEngineDriver, legacyThreadHandlers } from "../platform/driver";
import { buildFallbackCursorModels } from "./fallback-models";
import {
  carryForwardLegacyProbe,
  fromLegacyStatus,
  NO_LEGACY_ACCOUNT,
} from "./legacy-status";

export function fromCursorStatus(
  status: CursorEngineStatus,
  source: EngineInstallSource | null,
): EngineProbeResult {
  return fromLegacyStatus(
    {
      account: NO_LEGACY_ACCOUNT,
      authReady: status.authReady,
      error: status.error,
      installed: status.cliDetected,
      models: status.availableModels,
      path: status.cliPath,
      source,
      state: status.state,
      version: status.cliVersion,
    },
    {
      available: isCursorEngineAvailable(status),
      fallbackModels: buildFallbackCursorModels,
    },
  );
}

/** Cursor Agent over ACP (`agent acp`). */
export const cursorDriver = defineEngineDriver({
  capabilities: DRIVER_CATALOG.cursor.capabilities,
  invalidate() {
    resetCursorRuntimeCache();
    resetCursorEngineStatusCache();
  },
  kind: "cursor",
  meta: DRIVER_CATALOG.cursor,
  async probe(instance, options) {
    // Cheap: `--version` only (cached by the engine), the last full probe
    // carried forward while the binary is unchanged.
    if (options.depth === "cheap") {
      const runtime = await resolveCursorRuntime({ instance });
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

    // Cursor's 3 s status timeout kills the `agent acp` it started; the
    // platform's longer timeout is only a backstop.
    const status = await getCursorEngineStatus({
      forceRefresh: options.forceRefresh,
      instance,
    });
    const runtime = status.cliDetected
      ? await resolveCursorRuntime({ instance })
      : null;
    return fromCursorStatus(status, runtime?.source ?? null);
  },
  // A full probe spawns `agent acp` and creates a session: trust one for
  // 10 minutes and probe cheaply in between.
  fullProbeTtlMs: 10 * 60 * 1_000,
  // Above the 3 s ACP query timeout plus binary resolution.
  probeTimeoutMs: 15_000,
  thread: legacyThreadHandlers(async () => {
    const runtime = await import("@/lib/ai/chat/runtime/cursor");
    return {
      run: runtime.runCursorThreadChat,
      stop: runtime.stopCursorThreadRun,
    };
  }),
});
