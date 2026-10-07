import "server-only";

import {
  getCopilotEngineStatus,
  resetCopilotEngineStatusCache,
  resetCopilotRuntimeCache,
  resolveCopilotRuntime,
  type CopilotAccountInfo,
  type CopilotEngineStatus,
} from "@/lib/ai/chat/engines/copilot-sdk";

import { DRIVER_CATALOG } from "../catalog";
import type { EngineInstallSource, EngineProbeResult } from "../contract";
import { defineEngineDriver } from "../platform/driver";
import { buildFallbackCopilotModels } from "./fallback-models";
import { fromLegacyStatus, NO_LEGACY_ACCOUNT } from "./legacy-status";

function toCopilotAccount(account: CopilotAccountInfo | null) {
  if (!account) {
    return NO_LEGACY_ACCOUNT;
  }

  return {
    email: null,
    label: account.login,
    method: account.authType,
    plan: null,
  };
}

export function fromCopilotStatus(
  status: CopilotEngineStatus,
  source: EngineInstallSource | null,
): EngineProbeResult {
  return fromLegacyStatus(
    {
      account: toCopilotAccount(status.account),
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
      // Copilot only offers its fallback model once signed in.
      fallbackModels: (legacy) =>
        legacy.authReady ? buildFallbackCopilotModels() : null,
    },
  );
}

/** GitHub Copilot through its SDK, one client and runtime per instance. */
export const copilotDriver = defineEngineDriver({
  capabilities: DRIVER_CATALOG.copilot.capabilities,
  invalidate() {
    resetCopilotRuntimeCache();
    resetCopilotEngineStatusCache();
  },
  kind: "copilot",
  meta: DRIVER_CATALOG.copilot,
  async probe(instance, options) {
    const status = await getCopilotEngineStatus({
      forceRefresh: options.forceRefresh,
      instance,
    });
    const runtime = status.cliDetected
      ? await resolveCopilotRuntime({ instance })
      : null;
    return fromCopilotStatus(status, runtime?.installSource ?? null);
  },
  // Above the client start (10 s) and status/model queries.
  probeTimeoutMs: 20_000,
});
