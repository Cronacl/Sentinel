import type { ThreadUIMessage } from "@/lib/ai/messages/types";

// Streams an external run's assistant message: every update persists the
// message (one upsert, which returns the stored revision) and emits it as a
// `message.upsert` from memory, never from a reloaded thread snapshot (the
// Cursor runtime this replaces read the whole snapshot back on every chunk).
// Bursts of chunks are coalesced into one write per `flushMs`; structural
// changes (tool start/finish, approvals, the end of the run) flush at once.
// Everything is synchronous after the timer fires, so updates can never be
// emitted out of order.

export type MirrorEmitterTimers = {
  clearTimeout(handle: unknown): void;
  setTimeout(callback: () => void, ms: number): unknown;
};

export type MirrorEmitter = {
  /** Flushes now (cancelling a pending flush). */
  flush(): void;
  /** Flushes within `flushMs`. */
  schedule(): void;
  /** Cancels a pending flush (the run finished through another path). */
  cancel(): void;
};

const systemTimers: MirrorEmitterTimers = {
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
};

export function createMirrorEmitter(input: {
  /** Emits the stored message. */
  emit: (message: ThreadUIMessage) => void;
  flushMs?: number;
  /** Persists the current message and returns what was stored. */
  persist: () => ThreadUIMessage;
  timers?: MirrorEmitterTimers;
}): MirrorEmitter {
  const timers = input.timers ?? systemTimers;
  const flushMs = input.flushMs ?? 50;
  let timer: unknown = null;

  const cancel = () => {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
  };

  const flush = () => {
    cancel();
    input.emit(input.persist());
  };

  return {
    cancel,
    flush,
    schedule() {
      if (timer === null) {
        timer = timers.setTimeout(() => {
          timer = null;
          flush();
        }, flushMs);
      }
    },
  };
}
