import { describe, expect, it, mock } from "bun:test";

import { withTimeout } from "./with-timeout";

function createManualTimers() {
  const timers = new Map<number, () => void>();
  let nextId = 1;
  return {
    clearTimeout: (handle: unknown) => {
      timers.delete(handle as number);
    },
    fire() {
      for (const [id, callback] of [...timers]) {
        timers.delete(id);
        callback();
      }
    },
    pending: () => timers.size,
    setTimeout: (callback: () => void) => {
      const id = nextId++;
      timers.set(id, callback);
      return id;
    },
  };
}

describe("withTimeout", () => {
  it("resolves the value and clears its timer", async () => {
    const timers = createManualTimers();

    await expect(withTimeout(Promise.resolve(42), 100, timers)).resolves.toBe(
      42,
    );
    expect(timers.pending()).toBe(0);
  });

  it("aborts the task and runs onTimeout when the time is up", async () => {
    const timers = createManualTimers();
    const onTimeout = mock(() => {});
    let taskSignal: AbortSignal | null = null;

    const result = withTimeout(
      (signal) => {
        taskSignal = signal;
        return new Promise<string>(() => {});
      },
      100,
      { ...timers, onTimeout },
    );
    timers.fire();

    await expect(result).resolves.toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(taskSignal!.aborted).toBe(true);
  });

  it("ignores a late result after the timeout", async () => {
    const timers = createManualTimers();
    let resolveTask!: (value: string) => void;

    const result = withTimeout(
      new Promise<string>((resolve) => {
        resolveTask = resolve;
      }),
      100,
      timers,
    );
    timers.fire();
    resolveTask("late");

    await expect(result).resolves.toBeNull();
  });

  it("rejects task errors unless nullOnError is set", async () => {
    const timers = createManualTimers();
    const failing = () => Promise.reject(new Error("boom"));

    await expect(withTimeout(failing(), 100, timers)).rejects.toThrow("boom");
    await expect(
      withTimeout(failing(), 100, { ...timers, nullOnError: true }),
    ).resolves.toBeNull();
    await expect(
      withTimeout(
        () => {
          throw new Error("sync boom");
        },
        100,
        { ...timers, nullOnError: true },
      ),
    ).resolves.toBeNull();
  });

  it("gives up when the outer signal aborts", async () => {
    const timers = createManualTimers();
    const controller = new AbortController();
    const onTimeout = mock(() => {});

    const pending = withTimeout(new Promise(() => {}), 100, {
      ...timers,
      onTimeout,
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).resolves.toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toBe(0);

    await expect(
      withTimeout(Promise.resolve(1), 100, {
        ...timers,
        signal: controller.signal,
      }),
    ).resolves.toBeNull();
  });

  it("works with real timers", async () => {
    const onTimeout = mock(() => {});

    await expect(
      withTimeout(new Promise(() => {}), 5, { onTimeout }),
    ).resolves.toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
