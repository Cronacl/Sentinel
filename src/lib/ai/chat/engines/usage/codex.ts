import {
  clampUsagePercent,
  makeEngineUsageLimits,
  makeUnavailableEngineUsageLimits,
  type EngineUsageLimits,
  type EngineUsageWindow,
} from "../contract";

// Codex subscription usage. The `account/rateLimits/read` response and the
// `account/rateLimits/updated` notification carry the same snapshot shape,
// so one mapper serves the usage read and the turn-driven update, and both
// emit windows with the same ids. Ported from t3code
// apps/server/src/provider/codexUsageLimits.ts (MIT).

type CodexRateLimitWindowShape = {
  resetsAt?: number | null;
  usedPercent: number;
  windowDurationMins?: number | null;
};

/** Structural view of Codex's RateLimitSnapshot (read and notification). */
export type CodexRateLimitSnapshotShape = {
  limitId?: string | null;
  planType?: string | null;
  primary?: CodexRateLimitWindowShape | null;
  secondary?: CodexRateLimitWindowShape | null;
};

const SESSION_MINS = 5 * 60;
const WEEK_MINS = 7 * 24 * 60;
const MONTH_MINS = 30 * 24 * 60;

function isoFromEpochSeconds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function kindForDuration(mins: number): EngineUsageWindow["kind"] {
  if (mins >= MONTH_MINS) return "monthly";
  if (mins >= WEEK_MINS) return "weekly";
  return "session";
}

function labelForKind(kind: EngineUsageWindow["kind"]) {
  return kind === "session"
    ? "Session"
    : kind === "weekly"
      ? "Weekly"
      : "Monthly";
}

/**
 * `primary` and `secondary` are positions, not durations. Codex usually
 * sends `windowDurationMins`; when it does not, paid plans have the 5-hour
 * and weekly pair and Free/Go one monthly allowance. Model-specific
 * snapshots (Spark) describe another allowance and are left out.
 */
export function codexRateLimitsToWindows(
  snapshot: CodexRateLimitSnapshotShape | null | undefined,
): EngineUsageWindow[] {
  if (!snapshot || (snapshot.limitId && snapshot.limitId !== "codex")) {
    return [];
  }
  const isMonthlyPlan =
    snapshot.planType === "free" || snapshot.planType === "go";
  const positions = [
    ["primary", snapshot.primary, isMonthlyPlan ? MONTH_MINS : SESSION_MINS],
    ["secondary", snapshot.secondary, WEEK_MINS],
  ] as const;
  const windows: EngineUsageWindow[] = [];
  for (const [id, window, fallbackMins] of positions) {
    if (
      !window ||
      typeof window.usedPercent !== "number" ||
      !Number.isFinite(window.usedPercent)
    ) {
      continue;
    }
    const windowDurationMins =
      typeof window.windowDurationMins === "number" &&
      window.windowDurationMins > 0
        ? window.windowDurationMins
        : fallbackMins;
    const kind = kindForDuration(windowDurationMins);
    const resetsAt = isoFromEpochSeconds(window.resetsAt);
    windows.push({
      id,
      kind,
      label: labelForKind(kind),
      usedPercent: clampUsagePercent(window.usedPercent),
      windowDurationMins,
      ...(resetsAt ? { resetsAt } : {}),
    });
  }
  return windows;
}

/** A full `account/rateLimits/read` answer as limits. */
export function codexRateLimitsToLimits(input: {
  checkedAt: string;
  rateLimits: CodexRateLimitSnapshotShape | null | undefined;
  rateLimitsByLimitId?: Record<string, CodexRateLimitSnapshotShape> | null;
}): EngineUsageLimits {
  // The main bucket explicitly; the legacy field can name another limit.
  return makeEngineUsageLimits({
    checkedAt: input.checkedAt,
    windows: codexRateLimitsToWindows(
      input.rateLimitsByLimitId?.codex ?? input.rateLimits,
    ),
  });
}

/**
 * The windows an `account/rateLimits/updated` notification carries, from
 * its params (`{ rateLimits }`); empty for anything else.
 */
export function codexRateLimitsNotificationToWindows(
  params: unknown,
): EngineUsageWindow[] {
  if (typeof params !== "object" || params === null) {
    return [];
  }
  const rateLimits = (params as { rateLimits?: unknown }).rateLimits;
  return typeof rateLimits === "object" && rateLimits !== null
    ? codexRateLimitsToWindows(rateLimits as CodexRateLimitSnapshotShape)
    : [];
}

/** Accounts whose usage Codex never reports as plan windows. */
export function codexAccountHasNoPlanUsage(method: string | null) {
  return method === "apiKey" || method === "amazonBedrock";
}

export function makeCodexNoPlanUsage(checkedAt: string) {
  return makeUnavailableEngineUsageLimits({
    checkedAt,
    message: "Plan usage is only reported for ChatGPT sign-ins.",
    reason: "unsupported",
  });
}

/** A bounded, client-safe reason for a failed read; the raw error is logged. */
export function makeCodexUsageReadFailure(checkedAt: string) {
  return makeUnavailableEngineUsageLimits({
    checkedAt,
    message: "Codex did not report usage.",
    reason: "probeFailed",
  });
}
