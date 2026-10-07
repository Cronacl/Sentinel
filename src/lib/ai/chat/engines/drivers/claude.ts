import "server-only";

import type { AccountInfo } from "@anthropic-ai/claude-agent-sdk";

import {
  buildClaudeFallbackModels,
  getClaudeEngineStatus,
  resetClaudeCodeRuntimeCache,
  resetClaudeEngineStatusCache,
  resolveClaudeCodeRuntime,
  type ClaudeEngineStatus,
} from "@/lib/ai/chat/engines/claude-sdk";

import { DRIVER_CATALOG } from "../catalog";
import type { EngineInstallSource, EngineProbeResult } from "../contract";
import { defineEngineDriver } from "../platform/driver";
import { fromLegacyStatus, NO_LEGACY_ACCOUNT } from "./legacy-status";

function toClaudeAccount(account: AccountInfo | null) {
  if (!account) {
    return NO_LEGACY_ACCOUNT;
  }

  return {
    email: account.email ?? null,
    label: account.organization ?? null,
    method: account.tokenSource ?? account.apiKeySource ?? null,
    plan: account.subscriptionType ?? null,
  };
}

export function fromClaudeStatus(
  status: ClaudeEngineStatus,
  source: EngineInstallSource | null,
): EngineProbeResult {
  return fromLegacyStatus(
    {
      account: toClaudeAccount(status.account),
      authReady: status.authReady,
      error: status.error,
      installed: status.binaryDetected,
      models: status.availableModels,
      path: status.binaryPath,
      source,
      state: status.state,
      version: status.binaryVersion,
    },
    { fallbackModels: buildClaudeFallbackModels },
  );
}

/** Claude Code through the Agent SDK. */
export const claudeDriver = defineEngineDriver({
  capabilities: DRIVER_CATALOG.claude.capabilities,
  invalidate() {
    resetClaudeCodeRuntimeCache();
    resetClaudeEngineStatusCache();
  },
  kind: "claude",
  meta: DRIVER_CATALOG.claude,
  async probe(instance, options) {
    const status = await getClaudeEngineStatus({
      forceRefresh: options.forceRefresh,
      instance,
    });
    const runtime = status.binaryDetected
      ? await resolveClaudeCodeRuntime({ instance })
      : null;
    return fromClaudeStatus(status, runtime?.source ?? null);
  },
  // Above the SDK initialize timeout plus binary verification.
  probeTimeoutMs: 15_000,
});
