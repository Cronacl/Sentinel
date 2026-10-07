// A pool of long-lived resources (agent processes, one per instance and
// thread) that are reused while their launch fingerprint holds and reaped
// once idle. Users acquire a resource for the duration of a turn and release
// it afterwards; an idle resource is disposed after `idleTtlMs`, and past
// `maxLive` the least recently used idle ones go first. Busy or pinned
// resources are never reaped or evicted.

export type PoolClock = {
  clearTimeout(handle: unknown): void;
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
};

export type PooledResource = {
  dispose(): Promise<void> | void;
};

export type ProcessPoolOptions = {
  clock?: PoolClock;
  /** Dispose an idle resource after this long (default 10 min). */
  idleTtlMs?: number;
  /** Live resources kept before idle ones are evicted (default 8). */
  maxLive?: number;
  /** Errors thrown by a resource's dispose(); disposal never rejects. */
  onDisposeError?: (error: unknown, key: string) => void;
};

export type PoolLease<R> = {
  /** Marks this use finished; idempotent. */
  release(): void;
  resource: R;
};

export interface ProcessPool<R extends PooledResource> {
  /**
   * The live resource for `key`, created by `create` when missing or when
   * its fingerprint (command, args, cwd, env, launch mode…) changed. It stays
   * busy until the lease is released. A resource whose fingerprint changed is
   * disposed once its last lease is released.
   */
  acquire(
    key: string,
    fingerprint: string,
    create: () => Promise<R>,
  ): Promise<PoolLease<R>>;
  /** Keeps an idle resource from being reaped (background work pending). */
  pin(key: string): void;
  unpin(key: string): void;
  peek(key: string): R | null;
  dispose(key: string): Promise<void>;
  disposeAll(): Promise<void>;
  keys(): string[];
}

type Entry<R> = {
  fingerprint: string;
  idleTimer: unknown;
  lastUsedAt: number;
  pins: number;
  ready: Promise<R>;
  resource: R | null;
  retired: boolean;
  users: number;
};

const DEFAULT_IDLE_TTL_MS = 10 * 60 * 1_000;
const DEFAULT_MAX_LIVE = 8;

const systemClock: PoolClock = {
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
  setTimeout: (callback, ms) => {
    const timer = setTimeout(callback, ms);
    // Reaping alone must not keep the process alive.
    timer.unref?.();
    return timer;
  },
};

export function createProcessPool<R extends PooledResource>(
  options: ProcessPoolOptions = {},
): ProcessPool<R> {
  const clock = options.clock ?? systemClock;
  const idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
  const maxLive = options.maxLive ?? DEFAULT_MAX_LIVE;
  const entries = new Map<string, Entry<R>>();

  function clearIdleTimer(entry: Entry<R>) {
    if (entry.idleTimer !== null) {
      clock.clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
  }

  async function disposeEntry(key: string, entry: Entry<R>) {
    clearIdleTimer(entry);
    entry.retired = true;
    if (entries.get(key) === entry) {
      entries.delete(key);
    }

    let resource: R | null = entry.resource;
    if (!resource) {
      resource = await entry.ready.catch(() => null);
    }
    if (!resource) {
      return;
    }

    try {
      await resource.dispose();
    } catch (error) {
      options.onDisposeError?.(error, key);
    }
  }

  function isIdle(entry: Entry<R>) {
    return entry.users === 0 && entry.pins === 0 && entry.resource !== null;
  }

  function scheduleReap(key: string, entry: Entry<R>) {
    clearIdleTimer(entry);
    if (!isIdle(entry)) {
      return;
    }

    entry.idleTimer = clock.setTimeout(() => {
      entry.idleTimer = null;
      if (entries.get(key) === entry && isIdle(entry)) {
        void disposeEntry(key, entry);
      }
    }, idleTtlMs);
  }

  function evictOverflow() {
    let live = entries.size;
    if (live <= maxLive) {
      return;
    }

    const idle = [...entries]
      .filter(([, entry]) => isIdle(entry))
      .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt);
    for (const [key, entry] of idle) {
      if (live <= maxLive) {
        break;
      }
      void disposeEntry(key, entry);
      live -= 1;
    }
  }

  function releaseEntry(key: string, entry: Entry<R>) {
    entry.users = Math.max(0, entry.users - 1);
    entry.lastUsedAt = clock.now();
    if (entry.retired) {
      if (entry.users === 0) {
        void disposeEntry(key, entry);
      }
      return;
    }
    scheduleReap(key, entry);
  }

  function lease(key: string, entry: Entry<R>, resource: R): PoolLease<R> {
    let released = false;
    return {
      release() {
        if (!released) {
          released = true;
          releaseEntry(key, entry);
        }
      },
      resource,
    };
  }

  return {
    async acquire(key, fingerprint, create) {
      const existing = entries.get(key);
      if (existing && existing.fingerprint === fingerprint) {
        existing.users += 1;
        existing.lastUsedAt = clock.now();
        clearIdleTimer(existing);
        try {
          return lease(key, existing, await existing.ready);
        } catch (error) {
          existing.users -= 1;
          throw error;
        }
      }

      if (existing) {
        // Relaunch: the old resource goes once nobody uses it any more.
        entries.delete(key);
        existing.retired = true;
        clearIdleTimer(existing);
        if (existing.users === 0) {
          void disposeEntry(key, existing);
        }
      }

      const entry: Entry<R> = {
        fingerprint,
        idleTimer: null,
        lastUsedAt: clock.now(),
        pins: 0,
        ready: Promise.resolve(null as never),
        resource: null,
        retired: false,
        users: 1,
      };
      entry.ready = (async () => create())();
      entries.set(key, entry);

      try {
        const resource = await entry.ready;
        entry.resource = resource;
        if (entry.retired) {
          // Disposed (dispose/disposeAll) while it was starting.
          await disposeEntry(key, entry);
          throw new Error(
            `Pooled resource "${key}" was disposed while starting.`,
          );
        }
        evictOverflow();
        return lease(key, entry, resource);
      } catch (error) {
        if (entries.get(key) === entry) {
          entries.delete(key);
        }
        throw error;
      }
    },

    async dispose(key) {
      const entry = entries.get(key);
      if (entry) {
        await disposeEntry(key, entry);
      }
    },

    async disposeAll() {
      await Promise.all(
        [...entries].map(([key, entry]) => disposeEntry(key, entry)),
      );
    },

    keys() {
      return [...entries.keys()];
    },

    peek(key) {
      return entries.get(key)?.resource ?? null;
    },

    pin(key) {
      const entry = entries.get(key);
      if (entry) {
        entry.pins += 1;
        clearIdleTimer(entry);
      }
    },

    unpin(key) {
      const entry = entries.get(key);
      if (entry && entry.pins > 0) {
        entry.pins -= 1;
        entry.lastUsedAt = clock.now();
        scheduleReap(key, entry);
      }
    },
  };
}
