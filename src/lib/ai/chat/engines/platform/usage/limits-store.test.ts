import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { makeFakeInstance } = await import("../../contract/testing");
const { makeEngineUsageLimits, makeUnavailableEngineUsageLimits } =
  await import("../../contract");
const {
  DEFAULT_USAGE_LIMITS_TTL_MS,
  USAGE_LIMITS_RETRY_AFTER_FAILURE_MS,
  USAGE_LIMITS_UNSUPPORTED_TTL_MS,
  createEngineUsageLimitsStore,
} = await import("./limits-store");

import type { EngineUsageLimits, EngineUsageWindow } from "../../contract";
import type { EngineUsageLimitsChange } from "./limits-store";

const USER = "user-1";

function createClock(start = Date.parse("2026-10-08T10:00:00.000Z")) {
  let now = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now && timers.delete(id)) {
          timer.callback();
        }
      }
    },
    clearTimeout: (handle: unknown) => {
      timers.delete(handle as number);
    },
    now: () => now,
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
  };
}

function window(overrides: Partial<EngineUsageWindow> = {}): EngineUsageWindow {
  return {
    id: "five_hour",
    kind: "session",
    label: "Session",
    usedPercent: 10,
    ...overrides,
  };
}

function limits(
  windows: EngineUsageWindow[],
  checkedAt = "2026-10-08T10:00:00.000Z",
) {
  return makeEngineUsageLimits({ checkedAt, windows });
}

function setup(read: (signal: AbortSignal) => Promise<EngineUsageLimits>) {
  const clock = createClock();
  const store = createEngineUsageLimitsStore({ clock, readTimeoutMs: 1_000 });
  const changes: EngineUsageLimitsChange[] = [];
  store.subscribe((change) => changes.push(change));
  const reader = mock(
    async (_instance: unknown, options: { signal: AbortSignal }) =>
      await read(options.signal),
  );
  const driver = { usageLimits: { read: reader } };
  const instance = makeFakeInstance({ driver: "codex", id: "codex" });
  return { changes, clock, driver, instance, reader, store };
}

describe("usage limits store", () => {
  it("reads once per TTL and shares a read in flight", async () => {
    const { changes, clock, driver, instance, reader, store } = setup(
      async () => limits([window()]),
    );

    expect(store.isDue(USER, "codex", driver)).toBeTrue();
    const [first, second] = await Promise.all([
      store.read(USER, { driver, instance }),
      store.read(USER, { driver, instance }),
    ]);
    expect(first).toBe(second);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(changes).toHaveLength(1);

    await store.read(USER, { driver, instance });
    expect(reader).toHaveBeenCalledTimes(1);

    clock.advance(DEFAULT_USAGE_LIMITS_TTL_MS);
    expect(store.isDue(USER, "codex", driver)).toBeTrue();
    await store.read(USER, { driver, instance });
    expect(reader).toHaveBeenCalledTimes(2);
    // Same numbers: nothing to republish.
    expect(changes).toHaveLength(1);

    await store.read(USER, { driver, instance }, { force: true });
    expect(reader).toHaveBeenCalledTimes(3);
  });

  it("keeps the last good windows when a read fails and retries sooner", async () => {
    let next: EngineUsageLimits = limits([window({ usedPercent: 40 })]);
    const { clock, driver, instance, store } = setup(async () => next);
    await store.read(USER, { driver, instance });

    next = makeUnavailableEngineUsageLimits({
      checkedAt: "2026-10-08T10:05:00.000Z",
      reason: "probeFailed",
    });
    clock.advance(DEFAULT_USAGE_LIMITS_TTL_MS);
    const kept = await store.read(USER, { driver, instance });

    expect(kept?.windows[0]?.usedPercent).toBe(40);
    clock.advance(USAGE_LIMITS_RETRY_AFTER_FAILURE_MS - 1);
    expect(store.isDue(USER, "codex", driver)).toBeFalse();
    clock.advance(1);
    expect(store.isDue(USER, "codex", driver)).toBeTrue();
  });

  it("asks an unsupported account again only rarely", async () => {
    const { clock, driver, instance, store } = setup(async () =>
      makeUnavailableEngineUsageLimits({
        checkedAt: "2026-10-08T10:00:00.000Z",
        reason: "unsupported",
      }),
    );
    await store.read(USER, { driver, instance });
    clock.advance(DEFAULT_USAGE_LIMITS_TTL_MS);
    expect(store.isDue(USER, "codex", driver)).toBeFalse();
    clock.advance(USAGE_LIMITS_UNSUPPORTED_TTL_MS);
    expect(store.isDue(USER, "codex", driver)).toBeTrue();
  });

  it("gives up on a read that hangs and aborts it", async () => {
    const signals: AbortSignal[] = [];
    const { clock, driver, instance, store } = setup(
      (signal) =>
        new Promise<never>(() => {
          signals.push(signal);
        }),
    );
    const pending = store.read(USER, { driver, instance });
    await Promise.resolve();
    clock.advance(1_000);

    expect((await pending)?.unavailable?.reason).toBe("probeFailed");
    expect(signals[0]?.aborted).toBeTrue();
  });

  it("turns a throwing reader into a failed read", async () => {
    const { driver, instance, store } = setup(async () => {
      throw new Error("boom");
    });
    expect(
      (await store.read(USER, { driver, instance }))?.unavailable?.reason,
    ).toBe("probeFailed");
  });

  it("merges live reports and notifies only on change", async () => {
    const { changes, driver, instance, store } = setup(async () =>
      limits([window(), window({ id: "seven_day", kind: "weekly" })]),
    );
    await store.read(USER, { driver, instance });
    changes.length = 0;

    store.report(USER, "codex", [window({ usedPercent: 10 })]);
    expect(changes).toHaveLength(0);
    store.report(USER, "codex", [window({ usedPercent: 55 })]);
    expect(changes).toHaveLength(1);
    expect(
      store.peek(USER, "codex")?.windows.map((item) => item.usedPercent),
    ).toEqual([55, 10]);
    // Another user's instance with the same id is a different account.
    expect(store.peek("user-2", "codex")).toBeNull();
  });

  it("records a probe's own limits as a read, silently", async () => {
    const { changes, driver, instance, reader, store } = setup(async () =>
      limits([]),
    );
    store.seed(USER, "codex", limits([window({ usedPercent: 3 })]));

    expect(changes).toHaveLength(0);
    expect(store.isDue(USER, "codex", driver)).toBeFalse();
    await store.read(USER, { driver, instance });
    expect(reader).not.toHaveBeenCalled();
  });

  it("drops what an instance knew, and a read that was running, when it is forgotten", async () => {
    let resolveRead: (value: EngineUsageLimits) => void = () => {};
    const { driver, instance, store } = setup(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    store.report(USER, "codex", [window()]);
    const pending = store.read(USER, { driver, instance });
    store.forget("codex");
    resolveRead(limits([window({ usedPercent: 90 })]));
    await pending;

    expect(store.peek(USER, "codex")).toBeNull();
  });

  it("has nothing to read for drivers without a reader", async () => {
    const { instance, store } = setup(async () => limits([]));
    const driver = {};
    expect(store.isDue(USER, "codex", driver)).toBeFalse();
    expect(await store.read(USER, { driver, instance })).toBeNull();
  });
});
