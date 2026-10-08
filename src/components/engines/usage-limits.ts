import { getDriverMeta } from "@/lib/ai/chat/engines/catalog";
import {
  engineUsageLimitsEqual,
  type EngineEvent,
  type EngineSnapshot,
  type EngineUsageLimits,
  type EngineUsageWindow,
} from "@/lib/ai/chat/engines/contract";

// Client-side presentation of usage limits (composer chip, Settings →
// Engines): which instances show them, how full a window reads, and how a
// reset is phrased. Pure, so the chip and the settings section agree.

export type UsageTone = "accent" | "danger" | "warning";

const MINUTE_MS = 60_000;

/** Above 70 % a window is worth a glance, above 90 % a warning. */
export function getUsageTone(usedPercent: number): UsageTone {
  if (usedPercent >= 90) return "danger";
  if (usedPercent >= 70) return "warning";
  return "accent";
}

export function formatUsagePercent(usedPercent: number) {
  return `${Math.round(Math.max(0, Math.min(100, usedPercent)))}%`;
}

/**
 * Time until a reset, coarse like the usage rows of the engines
 * themselves: `5d 5h`, `3h 20m`, `12m`, `now`. Null without a usable time.
 */
export function formatUsageResetIn(
  resetsAt: string | undefined,
  now: number,
): string | null {
  if (!resetsAt) return null;
  const at = Date.parse(resetsAt);
  if (!Number.isFinite(at)) return null;
  const remainingMs = at - now;
  if (remainingMs <= 0) return "now";

  const totalMinutes = Math.ceil(remainingMs / MINUTE_MS);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
  if (hours === 0) return `${totalMinutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function describeUsageReset(
  window: Pick<EngineUsageWindow, "resetsAt">,
  now: number,
) {
  const resetIn = formatUsageResetIn(window.resetsAt, now);
  return resetIn === null
    ? null
    : resetIn === "now"
      ? "Resets now"
      : `Resets in ${resetIn}`;
}

/** Windows older than this may no longer match the account's usage. */
export const USAGE_LIMITS_STALE_AFTER_MS = 15 * MINUTE_MS;

/**
 * When the limits were read: `Read at 14:32` today, `Read Oct 5, 14:32`
 * before (carried-over limits can be days old). Absolute, so the label
 * stays true however long the page stays open. Null without a usable time.
 */
export function describeUsageCheckedAt(
  checkedAt: string | undefined,
  now: number,
): string | null {
  if (!checkedAt) return null;
  const at = Date.parse(checkedAt);
  if (!Number.isFinite(at)) return null;
  const date = new Date(at);
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (new Date(now).toDateString() === date.toDateString()) {
    return `Read at ${time}`;
  }
  const day = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return `Read ${day}, ${time}`;
}

/**
 * Whether drawn windows may be out of date: the instance cannot read
 * usage now (they were carried over from an earlier run), or the last
 * read is older than USAGE_LIMITS_STALE_AFTER_MS.
 */
export function isUsageLimitsStale(
  snapshot: Pick<EngineSnapshot, "usable" | "usageLimits">,
  now: number,
) {
  const limits = snapshot.usageLimits;
  if (!limits || getUsageWindows(limits).length === 0) return false;
  if (!snapshot.usable) return true;
  const at = Date.parse(limits.checkedAt);
  return !Number.isFinite(at) || now - at > USAGE_LIMITS_STALE_AFTER_MS;
}

/** Windows worth drawing (an unavailable read has none). */
export function getUsageWindows(
  limits: EngineUsageLimits | null | undefined,
): EngineUsageWindow[] {
  return limits && !limits.unavailable ? limits.windows : [];
}

/**
 * The window the composer chip shows: the fullest one (the limit the next
 * turn is likeliest to hit). Null when there is nothing to show.
 */
export function getMostConstrainedUsageWindow(
  limits: EngineUsageLimits | null | undefined,
): EngineUsageWindow | null {
  let fullest: EngineUsageWindow | null = null;
  for (const window of getUsageWindows(limits)) {
    if (!fullest || window.usedPercent > fullest.usedPercent) {
      fullest = window;
    }
  }
  return fullest;
}

/** Whether the driver can report usage limits at all. */
export function driverReportsUsageLimits(driver: string) {
  return getDriverMeta(driver)?.capabilities.reportsUsageLimits === true;
}

/**
 * Instances listed in Settings → Engines → Usage limits: enabled, installed
 * instances of drivers that report usage, unless their account can never
 * report it without anything the user could do (an API key).
 */
export function isUsageLimitsSnapshot(snapshot: EngineSnapshot) {
  if (
    !snapshot.enabled ||
    !snapshot.install.installed ||
    !(
      snapshot.capabilities.reportsUsageLimits ||
      driverReportsUsageLimits(snapshot.driver)
    )
  ) {
    return false;
  }
  const unavailable = snapshot.usageLimits?.unavailable;
  return !(
    unavailable?.reason === "unsupported" &&
    !unavailable.action &&
    !unavailable.message
  );
}

/** What to say instead of bars, or null when there are bars. */
export function getUsageLimitsNotice(
  snapshot: Pick<EngineSnapshot, "label" | "usable" | "usageLimits">,
): string | null {
  const limits = snapshot.usageLimits;
  if (!snapshot.usable && getUsageWindows(limits).length === 0) {
    return `${snapshot.label} needs to be ready before it can report usage.`;
  }
  if (!limits) {
    return "Usage has not been read yet.";
  }
  if (limits.unavailable) {
    return (
      limits.unavailable.message ??
      (limits.unavailable.reason === "unsupported"
        ? "This account does not report usage limits."
        : "Usage could not be read.")
    );
  }
  return limits.windows.length === 0 ? "No usage limits reported." : null;
}

/** The slice of api.engines.usage.get's query utils the sync needs. */
export type UsageLimitsQueryCache = {
  getData(input: { instanceId: string }): EngineUsageLimits | null | undefined;
  setData(
    input: { instanceId: string },
    data: EngineUsageLimits | null,
  ): unknown;
};

/**
 * Folds a snapshot event's usage limits into the instance's cached usage
 * query, when something is showing it and the limits changed.
 */
export function syncUsageLimitsFromEvent(
  cache: UsageLimitsQueryCache,
  event: EngineEvent,
) {
  if (event.type !== "snapshot") {
    return;
  }
  const input = { instanceId: event.snapshot.instanceId };
  const current = cache.getData(input);
  const next = event.snapshot.usageLimits;
  if (
    current === undefined ||
    (engineUsageLimitsEqual(current, next) &&
      current?.checkedAt === next?.checkedAt)
  ) {
    return;
  }
  cache.setData(input, next);
}
