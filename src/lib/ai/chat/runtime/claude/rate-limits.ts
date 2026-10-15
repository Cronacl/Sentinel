import type {
  SDKRateLimitEvent,
  SDKRateLimitInfo,
} from "@anthropic-ai/claude-agent-sdk";

import { reportEngineUsageLimits } from "@/lib/ai/chat/engines/platform/usage/limits-store";
import {
  claudeRateLimitEventToWindows,
  getClaudeScopedLimitNames,
} from "@/lib/ai/chat/engines/usage/claude";

// Latest Claude subscription rate-limit state per window, from the
// `rate_limit_event` messages Claude Code streams during runs (five_hour,
// seven_day, seven_day_opus, ...). Kept in memory for the usage-limit UI.

export type ClaudeRateLimitRecord = {
  info: SDKRateLimitInfo;
  receivedAt: string;
  sessionId: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __sentinelClaudeRateLimits:
    Map<string, ClaudeRateLimitRecord> | undefined;
}

// On globalThis for the same reason as the run controls: Bun test module
// isolation and dev hot reloads must share one store.
const latestClaudeRateLimits =
  globalThis.__sentinelClaudeRateLimits ??
  (globalThis.__sentinelClaudeRateLimits = new Map<
    string,
    ClaudeRateLimitRecord
  >());

export function recordClaudeRateLimitEvent(
  event: Pick<SDKRateLimitEvent, "rate_limit_info" | "session_id">,
  receivedAt: Date = new Date(),
): ClaudeRateLimitRecord {
  const record = {
    info: event.rate_limit_info,
    receivedAt: receivedAt.toISOString(),
    sessionId: event.session_id,
  };
  latestClaudeRateLimits.set(
    event.rate_limit_info.rateLimitType ?? "unknown",
    record,
  );
  return record;
}

export function getLatestClaudeRateLimits() {
  return [...latestClaudeRateLimits.values()];
}

export function resetClaudeRateLimits() {
  latestClaudeRateLimits.clear();
}

/**
 * Hands one `rate_limit_event` to the usage-limit store as a sparse update
 * for the run's instance; events that name no known window are dropped.
 */
export function reportClaudeRateLimitUsage(input: {
  info: SDKRateLimitInfo;
  instanceId: string;
  userId: string;
}) {
  const windows = claudeRateLimitEventToWindows(
    input.info,
    getClaudeScopedLimitNames(input.instanceId),
  );
  if (windows) {
    reportEngineUsageLimits(input.userId, input.instanceId, windows);
  }
}
