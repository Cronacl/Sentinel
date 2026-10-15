// `thread/tokenUsage/updated` → assistant message usage metadata.
//
// Codex reports a thread-wide running `total` and `last`, the usage of the
// newest model response, plus `modelContextWindow`. The per-turn delta logic
// is ported from t3code (MIT), apps/server/src/provider/CodexTurnTokenUsage.ts.

type CodexTokenUsageBreakdown = {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

export type CodexMessageUsage = {
  contextWindow?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

export type CodexTokenUsageTracker = {
  baseline: CodexTokenUsageBreakdown | null;
  turnOutputTokens: number;
  turnReasoningTokens: number;
};

export function createCodexTokenUsageTracker(): CodexTokenUsageTracker {
  return {
    baseline: null,
    turnOutputTokens: 0,
    turnReasoningTokens: 0,
  };
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBreakdown(value: unknown): CodexTokenUsageBreakdown | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const inputTokens = readNumber(record, "inputTokens");
  const outputTokens = readNumber(record, "outputTokens");
  if (inputTokens == null || outputTokens == null) {
    return null;
  }

  return {
    cachedInputTokens: readNumber(record, "cachedInputTokens") ?? 0,
    inputTokens,
    outputTokens,
    reasoningOutputTokens: readNumber(record, "reasoningOutputTokens") ?? 0,
    totalTokens:
      readNumber(record, "totalTokens") ?? inputTokens + outputTokens,
  };
}

/**
 * Within a turn the growth of `total` equals `last`. Without a prior total
 * (first update of a run, after resume or revert), or when Codex reset the
 * running total, `last` is the delta.
 */
function getTurnDelta(
  previous: CodexTokenUsageBreakdown | null,
  current: CodexTokenUsageBreakdown,
  last: CodexTokenUsageBreakdown,
) {
  if (
    previous === null ||
    current.inputTokens < previous.inputTokens ||
    current.cachedInputTokens < previous.cachedInputTokens ||
    current.outputTokens < previous.outputTokens ||
    current.reasoningOutputTokens < previous.reasoningOutputTokens
  ) {
    return last;
  }

  return {
    cachedInputTokens: current.cachedInputTokens - previous.cachedInputTokens,
    inputTokens: current.inputTokens - previous.inputTokens,
    outputTokens: current.outputTokens - previous.outputTokens,
    reasoningOutputTokens:
      current.reasoningOutputTokens - previous.reasoningOutputTokens,
    totalTokens: current.totalTokens - previous.totalTokens,
  };
}

/**
 * Applies one `thread/tokenUsage/updated` payload and returns the message
 * usage, or null when the payload carries no usable counters.
 *
 * - `inputTokens` is the newest request's prompt size (`last.inputTokens`,
 *   cached tokens included), which is how full the context window is; the
 *   composer's context indicator reads it.
 * - `contextWindow` is `modelContextWindow`.
 * - `outputTokens`/`reasoningTokens` accumulate over the run's turn.
 *
 * A flat `{inputTokens, outputTokens, …}` object (the shape Sentinel read
 * before the total/last split) is still accepted as-is.
 */
export function applyCodexTokenUsageUpdate(
  tracker: CodexTokenUsageTracker,
  params: unknown,
): CodexMessageUsage | null {
  if (!params || typeof params !== "object") {
    return null;
  }

  const tokenUsage = (params as { tokenUsage?: unknown }).tokenUsage;
  if (!tokenUsage || typeof tokenUsage !== "object") {
    return null;
  }

  const record = tokenUsage as Record<string, unknown>;
  const total = readBreakdown(record.total);
  const last = readBreakdown(record.last);

  if (!total || !last) {
    const flatInput = readNumber(record, "inputTokens");
    const flatOutput = readNumber(record, "outputTokens");
    if (flatInput == null && flatOutput == null) {
      return null;
    }

    return {
      inputTokens: flatInput ?? undefined,
      outputTokens: flatOutput ?? undefined,
      reasoningTokens: readNumber(record, "reasoningTokens") ?? undefined,
      totalTokens: readNumber(record, "totalTokens") ?? undefined,
    };
  }

  const delta = getTurnDelta(tracker.baseline, total, last);
  tracker.baseline = total;
  tracker.turnOutputTokens += Math.max(0, delta.outputTokens);
  tracker.turnReasoningTokens += Math.max(0, delta.reasoningOutputTokens);

  const contextWindow = readNumber(record, "modelContextWindow");
  const outputTokens = tracker.turnOutputTokens;

  return {
    ...(contextWindow != null && contextWindow > 0 ? { contextWindow } : {}),
    inputTokens: last.inputTokens,
    outputTokens,
    // Reasoning tokens are a subset of output tokens.
    reasoningTokens: Math.min(outputTokens, tracker.turnReasoningTokens),
    totalTokens: last.inputTokens + outputTokens,
  };
}
