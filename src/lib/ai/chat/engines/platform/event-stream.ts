import "server-only";

import { on, type EventEmitter } from "node:events";

import type { EngineEvent, EngineSnapshot } from "../contract";
import {
  ENGINE_EVENT_NAME,
  getEngineEventEmitter,
  getEngineEventVersion,
} from "./events";

// The engines.onEvents stream: every current snapshot first (so a client
// that connects or reconnects starts from the full state, whatever it
// missed), then each event as it is emitted. The listener is attached
// before the snapshots are read, so nothing emitted in between is lost; a
// snapshot event that repeats the replayed state is harmless.

export async function* streamEngineEvents(input: {
  emitter?: EventEmitter;
  /** Current snapshots without waiting on probes (snapshotService.peekAll). */
  peekAll: () => Promise<EngineSnapshot[]>;
  signal?: AbortSignal;
  version?: () => number;
}): AsyncGenerator<EngineEvent> {
  const emitter = input.emitter ?? getEngineEventEmitter();
  const signal = input.signal ?? new AbortController().signal;
  const events = on(emitter, ENGINE_EVENT_NAME, { signal });

  try {
    const version = (input.version ?? getEngineEventVersion)();
    for (const snapshot of await input.peekAll()) {
      if (signal.aborted) {
        return;
      }
      yield { snapshot, type: "snapshot", version };
    }

    for await (const [event] of events) {
      yield event as EngineEvent;
    }
  } catch (error) {
    if (signal.aborted) {
      return;
    }
    throw error;
  } finally {
    // Detaches the listener when the consumer stops early.
    await events.return?.();
  }
}
