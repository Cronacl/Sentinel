import { describe, expect, it, mock } from "bun:test";

import { createCommandSessionPool } from "./command-session-pool";

function manualTimers() {
  const callbacks = new Map<number, () => void>();
  let sequence = 0;
  return {
    clearTimeout: (handle: unknown) => callbacks.delete(handle as number),
    run() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback());
    },
    setTimeout: (callback: () => void) => {
      sequence += 1;
      callbacks.set(sequence, callback);
      return sequence;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("command session pool", () => {
  it("hands a remount the same session instead of starting it twice", async () => {
    const timers = manualTimers();
    const dispose = mock((_session: string) => {});
    const pool = createCommandSessionPool<string>({ dispose, ...timers });
    const create = mock(async () => "session-1");

    const first = pool.acquire("ticket", create);
    pool.release("ticket");
    const second = pool.acquire("ticket", create);

    expect(await second).toBe(await first);
    expect(create).toHaveBeenCalledTimes(1);
    timers.run();
    await flush();
    expect(dispose).not.toHaveBeenCalled();
  });

  it("disposes once the last view released it", async () => {
    const timers = manualTimers();
    const dispose = mock((_session: string) => {});
    const pool = createCommandSessionPool<string>({ dispose, ...timers });

    await pool.acquire("ticket", async () => "session-1");
    pool.acquire("ticket", async () => "unused");
    pool.release("ticket");
    timers.run();
    expect(pool.has("ticket")).toBe(true);

    pool.release("ticket");
    timers.run();
    await flush();
    expect(pool.has("ticket")).toBe(false);
    expect(dispose).toHaveBeenCalledWith("session-1");
  });

  it("keeps a failed start so the ticket is not spent again", async () => {
    const timers = manualTimers();
    const pool = createCommandSessionPool<string>({
      dispose: () => {},
      ...timers,
    });
    const create = mock(async () => {
      throw new Error("spent");
    });

    await expect(pool.acquire("ticket", create)).rejects.toThrow("spent");
    pool.release("ticket");
    await expect(pool.acquire("ticket", create)).rejects.toThrow("spent");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
