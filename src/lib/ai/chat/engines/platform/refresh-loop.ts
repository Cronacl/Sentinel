import "server-only";

// Background snapshot refresh while someone is watching (design §6): every
// connected engines.onEvents subscription retains the loop for its user;
// while retained, each tick asks the snapshot service for every snapshot,
// which re-probes what expired in the background (cheap or full, per
// driver cadence) and pushes changes as events. Nothing runs when no client
// is connected.

export const ENGINE_REFRESH_INTERVAL_MS = 5 * 60 * 1_000;

export type EngineRefreshLoopDeps = {
  clearInterval(handle: unknown): void;
  intervalMs?: number;
  /** Probes what expired (snapshotService.peekAll). Must not throw. */
  refresh(userId: string): Promise<unknown>;
  setInterval(callback: () => void, ms: number): unknown;
};

export function createEngineRefreshLoop(deps: EngineRefreshLoopDeps) {
  const loops = new Map<string, { handle: unknown; holders: number }>();

  function tick(userId: string) {
    void deps.refresh(userId).catch(() => {
      // A failed tick waits for the next one.
    });
  }

  return {
    /** Starts (or joins) the user's loop; returns the release function. */
    retain(userId: string) {
      const existing = loops.get(userId);
      if (existing) {
        existing.holders += 1;
      } else {
        loops.set(userId, {
          handle: deps.setInterval(
            () => tick(userId),
            deps.intervalMs ?? ENGINE_REFRESH_INTERVAL_MS,
          ),
          holders: 1,
        });
      }

      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        const loop = loops.get(userId);
        if (!loop) {
          return;
        }
        loop.holders -= 1;
        if (loop.holders <= 0) {
          deps.clearInterval(loop.handle);
          loops.delete(userId);
        }
      };
    },
    /** Users with a running loop (tests and diagnostics). */
    activeUsers() {
      return [...loops.keys()];
    },
  };
}

export type EngineRefreshLoop = ReturnType<typeof createEngineRefreshLoop>;

const globalForRefresh = globalThis as unknown as {
  __sentinelEngineRefreshLoop?: EngineRefreshLoop;
};

/** The process-wide loop (on globalThis so dev-server module copies share it). */
export function getEngineRefreshLoop(
  refresh: (userId: string) => Promise<unknown>,
): EngineRefreshLoop {
  globalForRefresh.__sentinelEngineRefreshLoop ??= createEngineRefreshLoop({
    clearInterval: (handle) =>
      clearInterval(handle as ReturnType<typeof setInterval>),
    refresh,
    setInterval: (callback, ms) => {
      const handle = setInterval(callback, ms);
      // Never keep the process alive for a refresh.
      (handle as { unref?: () => void }).unref?.();
      return handle;
    },
  });
  return globalForRefresh.__sentinelEngineRefreshLoop;
}
