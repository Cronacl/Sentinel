// Command terminals keyed by their launch ticket, shared by every mount of
// the view that shows one. A ticket starts a command once, so a view that
// unmounts and mounts again right away (React StrictMode, a re-keyed parent)
// must get the same session back rather than redeem the ticket again. A
// session is disposed of only once no view used it for `releaseDelayMs`.

export type CommandSessionPoolOptions<T> = {
  clearTimeout?: (handle: unknown) => void;
  dispose(session: T): void | Promise<void>;
  releaseDelayMs?: number;
  setTimeout?: (callback: () => void, ms: number) => unknown;
};

type PoolEntry<T> = {
  promise: Promise<T>;
  refs: number;
  timer: unknown;
};

export function createCommandSessionPool<T>(
  options: CommandSessionPoolOptions<T>,
) {
  const schedule =
    options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
  const cancel =
    options.clearTimeout ??
    ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const releaseDelayMs = options.releaseDelayMs ?? 250;
  const entries = new Map<string, PoolEntry<T>>();

  return {
    /** The session for `key`, created with `create` the first time. */
    acquire(key: string, create: () => Promise<T>): Promise<T> {
      const existing = entries.get(key);
      if (existing) {
        existing.refs += 1;
        if (existing.timer !== null) {
          cancel(existing.timer);
          existing.timer = null;
        }
        return existing.promise;
      }

      const entry: PoolEntry<T> = { promise: create(), refs: 1, timer: null };
      // A failed start is kept like a session: mounting again shows the
      // same error instead of spending the ticket twice.
      entry.promise.catch(() => undefined);
      entries.set(key, entry);
      return entry.promise;
    },

    /** One view stopped using `key`; the last one disposes of it, later. */
    release(key: string) {
      const entry = entries.get(key);
      if (!entry) {
        return;
      }
      entry.refs = Math.max(0, entry.refs - 1);
      if (entry.refs > 0 || entry.timer !== null) {
        return;
      }

      entry.timer = schedule(() => {
        if (entries.get(key) !== entry || entry.refs > 0) {
          return;
        }
        entries.delete(key);
        void entry.promise.then(
          (session) => options.dispose(session),
          () => undefined,
        );
      }, releaseDelayMs);
    },

    has(key: string) {
      return entries.has(key);
    },
  };
}
