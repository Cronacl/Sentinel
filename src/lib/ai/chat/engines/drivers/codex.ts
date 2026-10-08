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

import { withTimeout } from "@/lib/runtime/process/with-timeout";

import { DRIVER_CATALOG } from "../catalog";
import type {
  EngineInstallSource,
  EngineProbeResult,
  EngineSnapshot,
  EngineUsageLimits,
  ResolvedEngineInstance,
} from "../contract";
import { defineEngineDriver, legacyThreadHandlers } from "../platform/driver";
import { codexAuth } from "./auth/codex";
import { CODEX_SLASH_COMMANDS } from "../slash-commands";
import {
  codexAccountHasNoPlanUsage,
  codexRateLimitsToLimits,
  makeCodexNoPlanUsage,
  makeCodexUsageReadFailure,
} from "../usage/codex";
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
  const result = fromLegacyStatus(
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
  // Run by Sentinel through the thread's app-server (api.engines.codex).
  return status.cliDetected
    ? { ...result, slashCommands: [...CODEX_SLASH_COMMANDS] }
    : result;
}

type CodexRateLimitsReader = Pick<
  ReturnType<typeof getCodexAppServerManager>,
  "readRateLimits"
>;

/**
 * Plan usage through the instance's app-server (`account/rateLimits/read`).
 * API-key and Bedrock sign-ins have no plan windows.
 */
export async function readCodexUsageLimits(
  instance: ResolvedEngineInstance,
  options: {
    now?: () => number;
    reader?: CodexRateLimitsReader;
    signal: AbortSignal;
    snapshot?: Pick<EngineSnapshot, "auth"> | null;
  },
): Promise<EngineUsageLimits> {
  const checkedAt = () => new Date((options.now ?? Date.now)()).toISOString();
  if (codexAccountHasNoPlanUsage(options.snapshot?.auth.method ?? null)) {
    return makeCodexNoPlanUsage(checkedAt());
  }

  const reader = options.reader ?? getCodexAppServerManager(instance);
  try {
    const response = await withTimeout(reader.readRateLimits(), 15_000, {
      signal: options.signal,
    });
    if (!response) {
      return makeCodexUsageReadFailure(checkedAt());
    }
    return codexRateLimitsToLimits({
      checkedAt: checkedAt(),
      rateLimits: response.rateLimits,
      rateLimitsByLimitId: response.rateLimitsByLimitId ?? null,
    });
  } catch {
    return makeCodexUsageReadFailure(checkedAt());
  }
}

/** Codex through its app-server, one process per instance. */
export const codexDriver = defineEngineDriver({
  auth: codexAuth,
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
  usageLimits: {
    read: (instance, { signal, snapshot }) =>
      readCodexUsageLimits(instance, { signal, snapshot }),
  },
  thread: legacyThreadHandlers(async () => {
    const runtime = await import("@/lib/ai/chat/runtime/codex");
    return {
      run: runtime.runCodexThreadChat,
      stop: runtime.stopCodexThreadRun,
    };
  }),
});
