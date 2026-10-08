// A timeout that cancels the work it gives up on. The per-engine copies this
// replaces resolved null after the timeout but left the work running: a
// Cursor status probe kept its `agent acp` child alive in the background.
// Here the task receives an AbortSignal that fires on timeout, and
// `onTimeout` runs, so whoever owns a child process can kill it.

export type WithTimeoutOptions = {
  clearTimeout?: (handle: unknown) => void;
  /** Resolve null instead of rejecting when the task fails. */
  nullOnError?: boolean;
  /** Runs once when the timeout (or `signal`) wins: kill children here. */
  onTimeout?: () => void;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  /** An outer cancellation; aborting it ends the wait like a timeout. */
  signal?: AbortSignal;
};

export type TimeoutTask<T> = Promise<T> | ((signal: AbortSignal) => Promise<T>);

/**
 * Resolves the task's value, or null once `timeoutMs` passed (or `signal`
 * aborted), after aborting the task's signal and calling `onTimeout`.
 * Errors reject unless `nullOnError`.
 */
export function withTimeout<T>(
  task: TimeoutTask<T>,
  timeoutMs: number,
  options: WithTimeoutOptions = {},
): Promise<T | null> {
  const schedule =
    options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
  const cancel =
    options.clearTimeout ??
    ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const controller = new AbortController();

  return new Promise<T | null>((resolve, reject) => {
    let settled = false;
    let timer: unknown = null;

    const cleanup = () => {
      settled = true;
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
      options.signal?.removeEventListener("abort", giveUp);
    };

    function giveUp() {
      if (settled) {
        return;
      }

      cleanup();
      controller.abort(new Error(`Timed out after ${timeoutMs}ms.`));
      try {
        options.onTimeout?.();
      } catch {
        // Cleanup failures must not turn a timeout into an error.
      }
      resolve(null);
    }

    if (options.signal?.aborted) {
      giveUp();
      return;
    }
    options.signal?.addEventListener("abort", giveUp, { once: true });
    timer = schedule(giveUp, timeoutMs);

    let promise: Promise<T>;
    try {
      promise = typeof task === "function" ? task(controller.signal) : task;
    } catch (error) {
      promise = Promise.reject(error);
    }

    promise.then(
      (value) => {
        if (settled) {
          return;
        }
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) {
          return;
        }
        cleanup();
        if (options.nullOnError) {
          resolve(null);
          return;
        }
        reject(error);
      },
    );
  });
}
