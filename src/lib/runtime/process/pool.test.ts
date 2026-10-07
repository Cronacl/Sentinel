import { describe, expect, it, mock } from "bun:test";

import { createProcessPool, type PoolClock } from "./pool";

function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();

  const clock: PoolClock & { advance(ms: number): void; pending(): number } = {
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers].sort(
        ([, left], [, right]) => left.at - right.at,
      )) {
        if (timer.at <= now && timers.delete(id)) {
          timer.callback();
        }
      }
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    now: () => now,
    pending: () => timers.size,
    setTimeout(callback, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
  };
  return clock;
}

function createResource(name: string) {
  return { dispose: mock(async () => {}), name };
}

async function flush() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

describe("createProcessPool", () => {
  it("reuses a resource while its fingerprint holds and shares a pending start", async () => {
    const pool = createProcessPool<ReturnType<typeof createResource>>({
      clock: createFakeClock(),
    });
    const create = mock(async () => createResource("a"));

    const [first, second] = await Promise.all([
      pool.acquire("cursor:thread-1", "fp-1", create),
      pool.acquire("cursor:thread-1", "fp-1", create),
    ]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(first.resource).toBe(second.resource);
    expect(pool.peek("cursor:thread-1")).toBe(first.resource);
  });

  it("reaps a resource once it has been idle for the TTL", async () => {
    const clock = createFakeClock();
    const pool = createProcessPool<ReturnType<typeof createResource>>({
      clock,
      idleTtlMs: 1_000,
    });
    const lease = await pool.acquire("k", "fp", async () =>
      createResource("a"),
    );

    clock.advance(5_000);
    expect(lease.resource.dispose).not.toHaveBeenCalled();

    lease.release();
    lease.release();
    clock.advance(999);
    expect(lease.resource.dispose).not.toHaveBeenCalled();
    clock.advance(1);
    await flush();

    expect(lease.resource.dispose).toHaveBeenCalledTimes(1);
    expect(pool.keys()).toEqual([]);
  });

  it("cancels the reap when the resource is acquired again", async () => {
    const clock = createFakeClock();
    const pool = createProcessPool<ReturnType<typeof createResource>>({
      clock,
      idleTtlMs: 1_000,
    });
    const create = mock(async () => createResource("a"));
    (await pool.acquire("k", "fp", create)).release();

    clock.advance(500);
    const again = await pool.acquire("k", "fp", create);
    clock.advance(5_000);
    await flush();

    expect(create).toHaveBeenCalledTimes(1);
    expect(again.resource.dispose).not.toHaveBeenCalled();
  });

  it("keeps pinned resources past the TTL", async () => {
    const clock = createFakeClock();
    const pool = createProcessPool<ReturnType<typeof createResource>>({
      clock,
      idleTtlMs: 1_000,
    });
    const lease = await pool.acquire("grok:t1", "fp", async () =>
      createResource("a"),
    );
    pool.pin("grok:t1");
    lease.release();

    clock.advance(10_000);
    await flush();
    expect(lease.resource.dispose).not.toHaveBeenCalled();

    pool.unpin("grok:t1");
    clock.advance(1_000);
    await flush();
    expect(lease.resource.dispose).toHaveBeenCalledTimes(1);
  });

  it("relaunches on a new fingerprint and disposes the old one after its last lease", async () => {
    const pool = createProcessPool<ReturnType<typeof createResource>>({
      clock: createFakeClock(),
    });
    const oldLease = await pool.acquire("k", "fp-1", async () =>
      createResource("old"),
    );
    const newLease = await pool.acquire("k", "fp-2", async () =>
      createResource("new"),
    );

    expect(pool.peek("k")).toBe(newLease.resource);
    expect(oldLease.resource.dispose).not.toHaveBeenCalled();

    oldLease.release();
    await flush();
    expect(oldLease.resource.dispose).toHaveBeenCalledTimes(1);
    expect(newLease.resource.dispose).not.toHaveBeenCalled();
    expect(pool.keys()).toEqual(["k"]);
  });

  it("evicts the least recently used idle resources past maxLive", async () => {
    const clock = createFakeClock();
    const pool = createProcessPool<ReturnType<typeof createResource>>({
      clock,
      maxLive: 2,
    });
    const a = await pool.acquire("a", "fp", async () => createResource("a"));
    clock.advance(10);
    const b = await pool.acquire("b", "fp", async () => createResource("b"));
    clock.advance(10);
    a.release();
    clock.advance(10);
    b.release();

    const c = await pool.acquire("c", "fp", async () => createResource("c"));
    await flush();

    expect(a.resource.dispose).toHaveBeenCalledTimes(1);
    expect(b.resource.dispose).not.toHaveBeenCalled();
    expect(pool.keys().sort()).toEqual(["b", "c"]);

    // Busy resources are never evicted, even past the limit.
    const d = await pool.acquire("d", "fp", async () => createResource("d"));
    await flush();
    expect(b.resource.dispose).toHaveBeenCalledTimes(1);
    expect(c.resource.dispose).not.toHaveBeenCalled();
    expect(d.resource.dispose).not.toHaveBeenCalled();
  });

  it("forgets a resource whose start failed", async () => {
    const pool = createProcessPool<ReturnType<typeof createResource>>({
      clock: createFakeClock(),
    });

    await expect(
      pool.acquire("k", "fp", async () => {
        throw new Error("spawn failed");
      }),
    ).rejects.toThrow("spawn failed");
    expect(pool.keys()).toEqual([]);

    const lease = await pool.acquire("k", "fp", async () =>
      createResource("a"),
    );
    expect(lease.resource.name).toBe("a");
  });

  it("leases nothing disposed while starting and disposes it once", async () => {
    const pool = createProcessPool<ReturnType<typeof createResource>>({
      clock: createFakeClock(),
    });
    const resource = createResource("a");
    let finishStart!: () => void;
    const create = () =>
      new Promise<typeof resource>((resolve) => {
        finishStart = () => resolve(resource);
      });

    const first = pool.acquire("k", "fp", create);
    const second = pool.acquire("k", "fp", create);
    const disposed = pool.dispose("k");
    finishStart();

    const results = await Promise.allSettled([first, second]);
    await disposed;

    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(
      results.map((result) =>
        result.status === "rejected" ? String(result.reason) : "",
      ),
    ).toEqual([
      'Error: Pooled resource "k" was disposed while starting.',
      'Error: Pooled resource "k" was disposed while starting.',
    ]);
    expect(resource.dispose).toHaveBeenCalledTimes(1);
    expect(pool.keys()).toEqual([]);
  });

  it("disposes a busy resource once, also when its lease is released later", async () => {
    const pool = createProcessPool<ReturnType<typeof createResource>>({
      clock: createFakeClock(),
    });
    const lease = await pool.acquire("k", "fp", async () =>
      createResource("a"),
    );

    await pool.dispose("k");
    lease.release();
    await flush();

    expect(lease.resource.dispose).toHaveBeenCalledTimes(1);
  });

  it("still leases a starting resource that a new fingerprint replaced", async () => {
    const pool = createProcessPool<ReturnType<typeof createResource>>({
      clock: createFakeClock(),
    });
    const old = createResource("old");
    let finishStart!: () => void;
    const starting = pool.acquire(
      "k",
      "fp-1",
      () =>
        new Promise<typeof old>((resolve) => {
          finishStart = () => resolve(old);
        }),
    );
    const fresh = await pool.acquire("k", "fp-2", async () =>
      createResource("new"),
    );
    finishStart();

    const lease = await starting;
    expect(lease.resource).toBe(old);
    expect(old.dispose).not.toHaveBeenCalled();

    lease.release();
    await flush();
    expect(old.dispose).toHaveBeenCalledTimes(1);
    expect(pool.peek("k")).toBe(fresh.resource);
  });

  it("disposes everything and reports dispose errors without rejecting", async () => {
    const errors: string[] = [];
    const pool = createProcessPool<{ dispose(): Promise<void> }>({
      clock: createFakeClock(),
      onDisposeError: (_error, key) => errors.push(key),
    });
    const good = { dispose: mock(async () => {}) };
    await pool.acquire("good", "fp", async () => good);
    await pool.acquire("bad", "fp", async () => ({
      dispose: async () => {
        throw new Error("kill failed");
      },
    }));

    await pool.disposeAll();

    expect(good.dispose).toHaveBeenCalledTimes(1);
    expect(errors).toEqual(["bad"]);
    expect(pool.keys()).toEqual([]);
  });
});
