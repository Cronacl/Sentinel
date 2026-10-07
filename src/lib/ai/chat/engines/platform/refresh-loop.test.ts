import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { createEngineRefreshLoop } = await import("./refresh-loop");

function createTimers() {
  const intervals = new Map<number, () => void>();
  let nextId = 1;
  return {
    clearInterval: (handle: unknown) => {
      intervals.delete(handle as number);
    },
    fire() {
      for (const callback of intervals.values()) {
        callback();
      }
    },
    intervals,
    setInterval: (callback: () => void) => {
      const id = nextId++;
      intervals.set(id, callback);
      return id;
    },
  };
}

describe("engine refresh loop", () => {
  it("refreshes while at least one subscriber retains it", async () => {
    const timers = createTimers();
    const refresh = mock(async (_userId: string) => {});
    const loop = createEngineRefreshLoop({ ...timers, refresh });

    const releaseFirst = loop.retain("user-1");
    const releaseSecond = loop.retain("user-1");
    expect(timers.intervals.size).toBe(1);

    timers.fire();
    expect(refresh).toHaveBeenCalledWith("user-1");

    releaseFirst();
    releaseFirst();
    expect(loop.activeUsers()).toEqual(["user-1"]);
    releaseSecond();
    expect(loop.activeUsers()).toEqual([]);
    expect(timers.intervals.size).toBe(0);
  });

  it("survives a failing refresh", async () => {
    const timers = createTimers();
    const refresh = mock(async () => {
      throw new Error("probe failed");
    });
    const loop = createEngineRefreshLoop({ ...timers, refresh });

    loop.retain("user-1");
    timers.fire();
    await Promise.resolve();
    timers.fire();

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
