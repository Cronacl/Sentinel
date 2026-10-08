import type {
  SDKControlGetUsageResponse,
  SDKRateLimitInfo,
} from "@anthropic-ai/claude-agent-sdk";

import {
  clampUsagePercent,
  makeEngineUsageLimits,
  makeUnavailableEngineUsageLimits,
  type EngineUsageLimits,
  type EngineUsageWindow,
} from "../contract";

// Claude Code subscription usage. Both sources produce windows with the same
// ids, so a turn-driven `rate_limit_event` lands on the row the SDK's usage
// read drew:
// - the usage control request (on demand, from the usage store) reports
//   every window at once as 0–100 percentages with ISO reset times;
// - `rate_limit_event` (streamed during a turn) names one window at a time
//   with a 0–1 utilization fraction and an epoch-seconds reset.
// Ported from t3code apps/server/src/provider/claudeUsageLimits.ts (MIT).

const SESSION_MINS = 5 * 60;
const WEEK_MINS = 7 * 24 * 60;

/** Account-wide windows, keyed by the SDK's `rateLimitType`. */
const WINDOWS = {
  five_hour: {
    kind: "session",
    label: "Session",
    windowDurationMins: SESSION_MINS,
  },
  seven_day: { kind: "weekly", label: "Weekly", windowDurationMins: WEEK_MINS },
  seven_day_opus: {
    kind: "weekly",
    label: "Weekly · Opus",
    windowDurationMins: WEEK_MINS,
  },
  seven_day_sonnet: {
    kind: "weekly",
    label: "Weekly · Sonnet",
    windowDurationMins: WEEK_MINS,
  },
} as const satisfies Record<
  string,
  Pick<EngineUsageWindow, "kind" | "label" | "windowDurationMins">
>;

type ClaudeWindowId = keyof typeof WINDOWS;

/**
 * The streamed event names the overage-included bucket by type, while the
 * usage read names it by the model's display name. The read records the
 * name it saw so a mid-turn event lands on the row the read drew.
 */
const OVERAGE_INCLUDED_EVENT_TYPE = "seven_day_overage_included";

export type ClaudeScopedLimitNames = { overageIncluded: string | null };

declare global {
  // eslint-disable-next-line no-var
  var __sentinelClaudeScopedLimitNames:
    Map<string, ClaudeScopedLimitNames> | undefined;
}

// Per instance (each has its own account), on globalThis so the usage read
// and the run that streams events share it across module copies.
const scopedNamesByInstance =
  globalThis.__sentinelClaudeScopedLimitNames ??
  (globalThis.__sentinelClaudeScopedLimitNames = new Map());

export function getClaudeScopedLimitNames(
  instanceId: string,
): ClaudeScopedLimitNames {
  return scopedNamesByInstance.get(instanceId) ?? { overageIncluded: null };
}

export function setClaudeScopedLimitNames(
  instanceId: string,
  names: ClaudeScopedLimitNames,
) {
  scopedNamesByInstance.set(instanceId, names);
}

function isClaudeWindowId(value: string): value is ClaudeWindowId {
  return Object.hasOwn(WINDOWS, value);
}

function isoFromEpochSeconds(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isoFromString(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function makeWindow(
  id: ClaudeWindowId,
  usedPercent: number,
  resetsAt: string | undefined,
): EngineUsageWindow {
  return {
    id,
    ...WINDOWS[id],
    usedPercent: clampUsagePercent(usedPercent),
    ...(resetsAt ? { resetsAt } : {}),
  };
}

function scopedWindowId(displayName: string) {
  return `seven_day_${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function scopedWindow(
  displayName: string,
  usedPercent: number,
  resetsAt: string | undefined,
): EngineUsageWindow {
  return {
    id: scopedWindowId(displayName),
    kind: "weekly",
    label: `Weekly · ${displayName}`,
    usedPercent: clampUsagePercent(usedPercent),
    windowDurationMins: WEEK_MINS,
    ...(resetsAt ? { resetsAt } : {}),
  };
}

type ModelScopedWindow = {
  display_name: string;
  resets_at: string | null;
  utilization: number | null;
};

/** `model_scoped` is read structurally: it is newer than some CLIs. */
function readModelScoped(rateLimits: object): ModelScopedWindow[] {
  const raw = (rateLimits as { model_scoped?: unknown }).model_scoped;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (entry): entry is ModelScopedWindow =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as ModelScopedWindow).display_name === "string",
  );
}

/**
 * One streamed `rate_limit_event` as a sparse update, or null when it names
 * nothing a read could draw (an overage-included bucket no read has named
 * yet, plain overage).
 */
export function claudeRateLimitEventToWindows(
  info: Pick<SDKRateLimitInfo, "rateLimitType" | "resetsAt" | "utilization">,
  names: ClaudeScopedLimitNames,
): EngineUsageWindow[] | null {
  const type: string | undefined = info.rateLimitType;
  if (!type || typeof info.utilization !== "number") {
    return null;
  }

  const usedPercent = info.utilization * 100;
  const resetsAt = isoFromEpochSeconds(info.resetsAt);
  if (isClaudeWindowId(type)) {
    return [makeWindow(type, usedPercent, resetsAt)];
  }
  if (type === OVERAGE_INCLUDED_EVENT_TYPE && names.overageIncluded) {
    return [scopedWindow(names.overageIncluded, usedPercent, resetsAt)];
  }
  return null;
}

/**
 * A usage read as limits, with the scoped bucket names it carried for the
 * event mapper. API-key, Bedrock and Vertex sessions have no plan limits;
 * neither can a subscription token without the profile scope be read on
 * demand, though its runs still stream rate-limit events (the store lets
 * those replace an unsupported read). Plan limits that apply but did not
 * come back (the usage endpoint failed) are a failed read, not unsupported.
 */
export function claudeUsageResponseToLimits(input: {
  checkedAt: string;
  response: Pick<
    SDKControlGetUsageResponse,
    "rate_limits" | "rate_limits_available"
  > &
    Partial<Pick<SDKControlGetUsageResponse, "subscription_type">>;
}): { limits: EngineUsageLimits; names: ClaudeScopedLimitNames } {
  const { checkedAt, response } = input;
  const noNames = { overageIncluded: null };
  if (!response.rate_limits_available) {
    return {
      limits: makeUnavailableEngineUsageLimits({
        checkedAt,
        message: response.subscription_type
          ? "Claude Code cannot read plan usage for this login on demand; it shows during runs."
          : "Plan usage is only reported for Claude subscription logins.",
        reason: "unsupported",
      }),
      names: noNames,
    };
  }
  if (!response.rate_limits) {
    return {
      limits: makeUnavailableEngineUsageLimits({
        checkedAt,
        message: "Claude Code did not report usage.",
        reason: "probeFailed",
      }),
      names: noNames,
    };
  }

  const windows: EngineUsageWindow[] = [];
  const rateLimits = response.rate_limits as Partial<
    Record<
      ClaudeWindowId,
      { resets_at: string | null; utilization: number | null } | null
    >
  >;
  for (const id of Object.keys(WINDOWS) as ClaudeWindowId[]) {
    const window = rateLimits[id];
    if (!window || typeof window.utilization !== "number") {
      continue;
    }
    windows.push(
      makeWindow(id, window.utilization, isoFromString(window.resets_at)),
    );
  }

  // The CLI filters `model_scoped` to the overage-included allowlist; the
  // first entry that drew a row is the one the event refers to.
  let overageIncluded: string | null = null;
  for (const entry of readModelScoped(response.rate_limits)) {
    if (typeof entry.utilization !== "number") {
      continue;
    }
    const window = scopedWindow(
      entry.display_name,
      entry.utilization,
      isoFromString(entry.resets_at),
    );
    if (!windows.some((existing) => existing.id === window.id)) {
      windows.push(window);
    }
    overageIncluded ??= entry.display_name;
  }

  return {
    limits: makeEngineUsageLimits({ checkedAt, windows }),
    names: { overageIncluded },
  };
}
