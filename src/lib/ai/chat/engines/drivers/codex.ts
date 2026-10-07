import "server-only";

import {
  getCodexAppServerManager,
  resetCodexEngineStatusCache,
  type CodexAccountInfo,
  type CodexEngineStatus,
} from "@/lib/ai/chat/engines/codex-app-server";
import {
  resetCodexCliResolutionCache,
  resolveCodexCli,
} from "@/lib/ai/chat/engines/codex-cli";

import { DRIVER_CATALOG } from "../catalog";
import type { EngineInstallSource, EngineProbeResult } from "../contract";
import { defineEngineDriver } from "../platform/driver";
import { buildFallbackCodexModels } from "./fallback-models";
import { fromLegacyStatus, NO_LEGACY_ACCOUNT } from "./legacy-status";

function toCodexAccount(account: CodexAccountInfo | null) {
  if (!account) {
    return NO_LEGACY_ACCOUNT;
  }

  return account.type === "chatgpt"
    ? {
        email: account.email,
        label: null,
        method: "chatgpt",
        plan: account.planType,
      }
    : { email: null, label: null, method: account.type, plan: null };
}

/**
 * The router's isCodexEngineAvailable (routers/engines.ts), without the
 * timeout that had no CLI to time out (driver-contract.md §2.2).
 */
export function isCodexStatusAvailable(status: CodexEngineStatus) {
  return (
    status.cliDetected &&
    (status.state === "ready" || status.state === "timeout_no_cache")
  );
}

export function fromCodexStatus(
  status: CodexEngineStatus,
  source: EngineInstallSource | null,
): EngineProbeResult {
  return fromLegacyStatus(
    {
      account: toCodexAccount(status.account),
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
      available: isCodexStatusAvailable(status),
      // Codex signs in through its app-server (account/login/start).
      canLogin: true,
      canLogout: status.account !== null,
      fallbackModels: buildFallbackCodexModels,
    },
  );
}

/** Codex through its app-server, one process per instance. */
export const codexDriver = defineEngineDriver({
  capabilities: DRIVER_CATALOG.codex.capabilities,
  invalidate() {
    resetCodexCliResolutionCache();
    resetCodexEngineStatusCache();
  },
  kind: "codex",
  meta: DRIVER_CATALOG.codex,
  async probe(instance, options) {
    const status = await getCodexAppServerManager(instance).getStatus({
      forceRefresh: options.forceRefresh,
    });
    const resolved = status.cliDetected
      ? await resolveCodexCli({ instance })
      : null;
    return fromCodexStatus(status, resolved?.source ?? null);
  },
  // Above the app-server's own resolution, version and query timeouts.
  probeTimeoutMs: 15_000,
});
