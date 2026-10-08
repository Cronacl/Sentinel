import "server-only";

import { withTimeout } from "@/lib/runtime/process/with-timeout";

import {
  applyEngineUsageLimitsUpdate,
  engineUsageLimitsEqual,
  makeUnavailableEngineUsageLimits,
  resolveEngineUsageLimitsAfterRead,
  type EngineSnapshot,
  type EngineUsageLimits,
  type EngineUsageWindow,
  type ResolvedEngineInstance,
} from "../../contract";
import type { EngineDriver } from "../driver";

// The one place usage limits live per (user, instance), so a full read and
// a turn's live updates land on the same windows (driver-contract.md §2.5,
// §6). Full reads come from the driver's `usageLimits.read`, at most once
// per TTL (5 minutes by default, one minute after a failed read) and one at
// a time per instance; runtimes push sparse updates in between. Snapshots
// carry a copy: the usage enricher overlays it on every probe, and the
// snapshot service republishes whenever it changes.

export const DEFAULT_USAGE_LIMITS_TTL_MS = 5 * 60_000;
export const USAGE_LIMITS_RETRY_AFTER_FAILURE_MS = 60_000;
/** An account that cannot report (API key) is asked again rarely. */
export const USAGE_LIMITS_UNSUPPORTED_TTL_MS = 30 * 60_000;
export const DEFAULT_USAGE_READ_TIMEOUT_MS = 20_000;

export type EngineUsageLimitsChange = {
  instanceId: string;
  limits: EngineUsageLimits;
  userId: string;
};

export type EngineUsageReadTarget = {
  driver: Pick<EngineDriver, "usageLimits">;
  instance: ResolvedEngineInstance;
  /** The instance's snapshot, when known (auth method, plan). */
  snapshot?: EngineSnapshot | null;
};

export interface EngineUsageLimitsStore {
  /** Forget an instance's limits (removed, or reconfigured). */
  forget(instanceId: string): void;
  /** Whether a full read is due: never read, or older than its TTL. */
  isDue(
    userId: string,
    instanceId: string,
    driver: Pick<EngineDriver, "usageLimits">,
  ): boolean;
  peek(userId: string, instanceId: string): EngineUsageLimits | null;
  /**
   * A full read through the driver; with `force`, even when the last one
   * is fresh. Resolves the published limits (null when the driver reports
   * no usage). Never throws.
   */
  read(
    userId: string,
    target: EngineUsageReadTarget,
    options?: { force?: boolean },
  ): Promise<EngineUsageLimits | null>;
  /** A runtime's sparse live update (rate-limit events). */
  report(
    userId: string,
    instanceId: string,
    windows: readonly EngineUsageWindow[],
  ): void;
  /**
   * Limits a probe obtained for free (counts as a full read). Silent: the
   * caller is about to publish the snapshot it enriches.
   */
  seed(userId: string, instanceId: string, limits: EngineUsageLimits): void;
  subscribe(listener: (change: EngineUsageLimitsChange) => void): () => void;
}

export type EngineUsageLimitsStoreDeps = {
  clock?: {
    clearTimeout(handle: unknown): void;
    now(): number;
    setTimeout(callback: () => void, ms: number): unknown;
  };
  onError?: (error: unknown, context: { instanceId: string }) => void;
  readTimeoutMs?: number;
};

type Entry = {
  fetchedAt: number | null;
  /** Bumped by forget(): a read that started before must not store. */
  generation: number;
  inFlight: Promise<EngineUsageLimits | null> | null;
  lastRead: "failed" | "ok" | "unsupported";
  limits: EngineUsageLimits | null;
};

function readOutcome(limits: EngineUsageLimits): Entry["lastRead"] {
  return limits.unavailable?.reason === "probeFailed"
    ? "failed"
    : limits.unavailable?.reason === "unsupported"
      ? "unsupported"
      : "ok";
}

const systemClock = {
  clearTimeout: (handle: unknown) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
  setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
};

export function createEngineUsageLimitsStore(
  deps: EngineUsageLimitsStoreDeps = {},
): EngineUsageLimitsStore {
  const clock = deps.clock ?? systemClock;
  const readTimeoutMs = deps.readTimeoutMs ?? DEFAULT_USAGE_READ_TIMEOUT_MS;
  const entries = new Map<string, Entry>();
  const listeners = new Set<(change: EngineUsageLimitsChange) => void>();
  let generation = 0;

  const keyOf = (userId: string, instanceId: string) =>
    `${userId}\u0000${instanceId}`;

  function getEntry(userId: string, instanceId: string) {
    const key = keyOf(userId, instanceId);
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        fetchedAt: null,
        generation,
        inFlight: null,
        lastRead: "ok",
        limits: null,
      };
      entries.set(key, entry);
    }
    return entry;
  }

  function notify(change: EngineUsageLimitsChange) {
    for (const listener of listeners) {
      try {
        listener(change);
      } catch (error) {
        deps.onError?.(error, { instanceId: change.instanceId });
      }
    }
  }

  function publish(
    userId: string,
    instanceId: string,
    entry: Entry,
    next: EngineUsageLimits | null,
    options: { silent?: boolean } = {},
  ) {
    const previous = entry.limits;
    entry.limits = next;
    if (next && !options.silent && !engineUsageLimitsEqual(previous, next)) {
      notify({ instanceId, limits: next, userId });
    }
  }

  async function runRead(
    userId: string,
    target: EngineUsageReadTarget,
    entry: Entry,
  ) {
    const reader = target.driver.usageLimits!;
    const startedGeneration = entry.generation;
    const checkedAt = () => new Date(clock.now()).toISOString();
    let read: EngineUsageLimits | null;
    try {
      read = await withTimeout(
        (signal) =>
          reader.read(target.instance, {
            signal,
            snapshot: target.snapshot ?? null,
          }),
        readTimeoutMs,
        { clearTimeout: clock.clearTimeout, setTimeout: clock.setTimeout },
      );
    } catch (error) {
      deps.onError?.(error, { instanceId: target.instance.id });
      read = makeUnavailableEngineUsageLimits({
        checkedAt: checkedAt(),
        message: `${target.instance.label} could not read usage limits.`,
        reason: "probeFailed",
      });
    }
    read ??= makeUnavailableEngineUsageLimits({
      checkedAt: checkedAt(),
      message: `${target.instance.label} did not report usage in time.`,
      reason: "probeFailed",
    });

    if (entry.generation !== startedGeneration) {
      // Forgotten while reading: the answer describes the old instance.
      return entry.limits;
    }
    entry.fetchedAt = clock.now();
    entry.lastRead = readOutcome(read);
    publish(
      userId,
      target.instance.id,
      entry,
      resolveEngineUsageLimitsAfterRead({ published: entry.limits, read }),
    );
    return entry.limits;
  }

  const store: EngineUsageLimitsStore = {
    forget(instanceId) {
      generation += 1;
      for (const [key, entry] of entries) {
        if (key.endsWith(`\u0000${instanceId}`)) {
          entry.generation = generation;
          entries.delete(key);
        }
      }
    },

    isDue(userId, instanceId, driver) {
      if (!driver.usageLimits) {
        return false;
      }
      const entry = entries.get(keyOf(userId, instanceId));
      if (!entry || entry.fetchedAt === null) {
        return true;
      }
      const ttl =
        entry.lastRead === "failed"
          ? USAGE_LIMITS_RETRY_AFTER_FAILURE_MS
          : entry.lastRead === "unsupported"
            ? USAGE_LIMITS_UNSUPPORTED_TTL_MS
            : (driver.usageLimits.ttlMs ?? DEFAULT_USAGE_LIMITS_TTL_MS);
      return clock.now() - entry.fetchedAt >= ttl;
    },

    peek(userId, instanceId) {
      return entries.get(keyOf(userId, instanceId))?.limits ?? null;
    },

    async read(userId, target, options = {}) {
      const instanceId = target.instance.id;
      if (!target.driver.usageLimits) {
        return store.peek(userId, instanceId);
      }
      const entry = getEntry(userId, instanceId);
      if (entry.inFlight) {
        return await entry.inFlight;
      }
      if (!options.force && !store.isDue(userId, instanceId, target.driver)) {
        return entry.limits;
      }

      const pending = runRead(userId, target, entry).finally(() => {
        if (entry.inFlight === pending) {
          entry.inFlight = null;
        }
      });
      entry.inFlight = pending;
      return await pending;
    },

    report(userId, instanceId, windows) {
      if (windows.length === 0) {
        return;
      }
      const entry = getEntry(userId, instanceId);
      const next = applyEngineUsageLimitsUpdate({
        checkedAt: new Date(clock.now()).toISOString(),
        previous: entry.limits,
        windows,
      });
      if (next !== entry.limits) {
        publish(userId, instanceId, entry, next);
      }
    },

    seed(userId, instanceId, limits) {
      const entry = getEntry(userId, instanceId);
      entry.fetchedAt = clock.now();
      entry.lastRead = readOutcome(limits);
      publish(
        userId,
        instanceId,
        entry,
        resolveEngineUsageLimitsAfterRead({
          published: entry.limits,
          read: limits,
        }),
        { silent: true },
      );
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return store;
}

const globalForUsage = globalThis as unknown as {
  __sentinelEngineUsageLimitsStore?: EngineUsageLimitsStore;
};

/** The process-wide store (on globalThis so module copies share it). */
export function getEngineUsageLimitsStore(): EngineUsageLimitsStore {
  globalForUsage.__sentinelEngineUsageLimitsStore ??=
    createEngineUsageLimitsStore();
  return globalForUsage.__sentinelEngineUsageLimitsStore;
}

/**
 * What a runtime calls when its turn reports rate limits (Claude
 * rate_limit_event, Codex account/rateLimits/updated). Cheap and safe to
 * call for any instance; windows it omits keep their values.
 */
export function reportEngineUsageLimits(
  userId: string,
  instanceId: string,
  windows: readonly EngineUsageWindow[],
) {
  getEngineUsageLimitsStore().report(userId, instanceId, windows);
}
