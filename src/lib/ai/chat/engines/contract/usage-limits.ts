import { z } from "zod";

export const ENGINE_USAGE_WINDOW_KINDS = [
  "session",
  "weekly",
  "monthly",
  "other",
] as const;

export const engineUsageWindowSchema = z.object({
  /** Stable per window; sparse updates merge by this id. */
  id: z.string().min(1),
  kind: z.enum(ENGINE_USAGE_WINDOW_KINDS),
  label: z.string(),
  resetsAt: z.string().optional(),
  usedPercent: z.number().min(0),
  windowDurationMins: z.number().positive().optional(),
});

/**
 * What the UI can offer when an account's usage cannot be read yet:
 * "read-keychain" asks the user to let Sentinel read the engine's login
 * from the macOS Keychain (never done without that action).
 */
export const ENGINE_USAGE_UNAVAILABLE_ACTIONS = ["read-keychain"] as const;

export const engineUsageLimitsSchema = z.object({
  checkedAt: z.string(),
  credentialFingerprint: z.string().optional(),
  externalUsage: z.object({ label: z.string(), url: z.string() }).optional(),
  unavailable: z
    .object({
      action: z.enum(ENGINE_USAGE_UNAVAILABLE_ACTIONS).optional(),
      message: z.string().optional(),
      reason: z.enum(["unsupported", "probeFailed"]),
    })
    .optional(),
  windows: z.array(engineUsageWindowSchema),
});

/**
 * A runtime's live report during a turn (Claude rate_limit_event, Codex
 * account/rateLimits/updated). Sparse: windows it omits are unchanged.
 */
export const engineUsageLimitsUpdateSchema = z.object({
  windows: z.array(engineUsageWindowSchema),
});

export type EngineUsageWindow = z.infer<typeof engineUsageWindowSchema>;
export type EngineUsageWindowKind = EngineUsageWindow["kind"];
export type EngineUsageLimits = z.infer<typeof engineUsageLimitsSchema>;
export type EngineUsageLimitsUpdate = z.infer<
  typeof engineUsageLimitsUpdateSchema
>;
export type EngineUsageUnavailableAction =
  (typeof ENGINE_USAGE_UNAVAILABLE_ACTIONS)[number];

// Merge rules below follow t3code's providerUsageLimits.ts (MIT): windows
// keep stable ids so a turn-driven update lands on the row a full read
// drew, `unsupported` is authoritative, and a failed read never wipes bars
// a previous read or a turn established.

const WINDOW_KIND_ORDER: Record<EngineUsageWindowKind, number> = {
  monthly: 2,
  other: 3,
  session: 0,
  weekly: 1,
};

/** A percentage clamped to 0–100 (0 for anything that is not a number). */
export function clampUsagePercent(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

/** Session first, then weekly, monthly and other; ids break ties. */
export function sortEngineUsageWindows(
  windows: Iterable<EngineUsageWindow>,
): EngineUsageWindow[] {
  return [...windows].sort(
    (left, right) =>
      WINDOW_KIND_ORDER[left.kind] - WINDOW_KIND_ORDER[right.kind] ||
      left.id.localeCompare(right.id),
  );
}

export function makeEngineUsageLimits(input: {
  checkedAt: string;
  credentialFingerprint?: string;
  windows: Iterable<EngineUsageWindow>;
}): EngineUsageLimits {
  return {
    checkedAt: input.checkedAt,
    ...(input.credentialFingerprint
      ? { credentialFingerprint: input.credentialFingerprint }
      : {}),
    windows: sortEngineUsageWindows(input.windows),
  };
}

export function makeUnavailableEngineUsageLimits(input: {
  action?: EngineUsageUnavailableAction;
  checkedAt: string;
  message?: string;
  reason: "probeFailed" | "unsupported";
}): EngineUsageLimits {
  return {
    checkedAt: input.checkedAt,
    unavailable: {
      ...(input.action ? { action: input.action } : {}),
      ...(input.message ? { message: input.message } : {}),
      reason: input.reason,
    },
    windows: [],
  };
}

function usageWindowEquals(left: EngineUsageWindow, right: EngineUsageWindow) {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.label === right.label &&
    left.usedPercent === right.usedPercent &&
    left.resetsAt === right.resetsAt &&
    left.windowDurationMins === right.windowDurationMins
  );
}

/**
 * Sparse merge: windows in `update` replace the window with the same id and
 * the rest are kept, so a live `rate_limit_event` for one window does not
 * erase the others read by the last full probe. A window that arrives
 * without a reset time or duration keeps the ones known for it.
 */
export function mergeEngineUsageWindows(
  current: readonly EngineUsageWindow[],
  update: readonly EngineUsageWindow[],
): EngineUsageWindow[] {
  const byId = new Map(current.map((window) => [window.id, window]));
  for (const window of update) {
    const existing = byId.get(window.id);
    byId.set(window.id, {
      ...window,
      usedPercent: clampUsagePercent(window.usedPercent),
      ...(window.resetsAt === undefined && existing?.resetsAt !== undefined
        ? { resetsAt: existing.resetsAt }
        : {}),
      ...(window.windowDurationMins === undefined &&
      existing?.windowDurationMins !== undefined
        ? { windowDurationMins: existing.windowDurationMins }
        : {}),
    });
  }
  return [...byId.values()];
}

/**
 * Folds a runtime's sparse update into the published limits. Returns
 * `previous` itself when nothing changed (Codex repeats unchanged numbers
 * with every token tick), and leaves an `unsupported` account unsupported:
 * an API-key sign-in does not start reporting windows mid-turn.
 */
export function applyEngineUsageLimitsUpdate(input: {
  checkedAt: string;
  previous: EngineUsageLimits | null;
  windows: readonly EngineUsageWindow[];
}): EngineUsageLimits | null {
  const { previous, windows } = input;
  if (windows.length === 0 || previous?.unavailable?.reason === "unsupported") {
    return previous;
  }

  const merged = mergeEngineUsageWindows(previous?.windows ?? [], windows);
  const changed =
    !previous ||
    previous.unavailable !== undefined ||
    merged.length !== previous.windows.length ||
    merged.some((window) => {
      const before = previous.windows.find((item) => item.id === window.id);
      return !before || !usageWindowEquals(before, window);
    });
  if (!changed) {
    return previous;
  }

  return {
    ...(previous?.credentialFingerprint
      ? { credentialFingerprint: previous.credentialFingerprint }
      : {}),
    ...(previous?.externalUsage
      ? { externalUsage: previous.externalUsage }
      : {}),
    ...makeEngineUsageLimits({ checkedAt: input.checkedAt, windows: merged }),
  };
}

/**
 * What to publish after a full read. A read that failed this time keeps
 * the last good windows; `unsupported` (and every successful read) is
 * authoritative and replaces them.
 */
export function resolveEngineUsageLimitsAfterRead(input: {
  published: EngineUsageLimits | null;
  read: EngineUsageLimits;
}): EngineUsageLimits {
  const { published, read } = input;
  if (
    read.unavailable?.reason === "probeFailed" &&
    published &&
    !published.unavailable &&
    published.windows.length > 0
  ) {
    return published;
  }
  return read;
}

/**
 * Two limits that show the same thing (the read time aside): publishing
 * one over the other would only churn events.
 */
export function engineUsageLimitsEqual(
  left: EngineUsageLimits | null,
  right: EngineUsageLimits | null,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.credentialFingerprint === right.credentialFingerprint &&
    left.externalUsage?.label === right.externalUsage?.label &&
    left.externalUsage?.url === right.externalUsage?.url &&
    left.unavailable?.reason === right.unavailable?.reason &&
    left.unavailable?.message === right.unavailable?.message &&
    left.unavailable?.action === right.unavailable?.action &&
    left.windows.length === right.windows.length &&
    left.windows.every((window, index) =>
      usageWindowEquals(window, right.windows[index]!),
    )
  );
}
