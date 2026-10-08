import "server-only";

import { EventEmitter } from "node:events";

import type { EngineEvent } from "../contract";

// Engine events (snapshots, removals, auth and maintenance progress) for the
// engines.onEvents subscription. The emitter lives on globalThis so every
// dev-server module copy (HMR) publishes to the same subscribers, and the
// version counter increases monotonically per server process so a client
// can resume after its last event id.

export const ENGINE_EVENT_NAME = "event";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type EngineEventInput = DistributiveOmit<EngineEvent, "version">;

type EngineEventBus = {
  emitter: EventEmitter;
  version: number;
};

const globalForEngineEvents = globalThis as unknown as {
  __sentinelEngineEvents?: EngineEventBus;
};

function getBus() {
  if (!globalForEngineEvents.__sentinelEngineEvents) {
    const emitter = new EventEmitter();
    // One listener per connected subscription; there is no sensible cap.
    emitter.setMaxListeners(0);
    globalForEngineEvents.__sentinelEngineEvents = { emitter, version: 0 };
  }
  return globalForEngineEvents.__sentinelEngineEvents;
}

/** The emitter, for `on(emitter, ENGINE_EVENT_NAME, { signal })`. */
export function getEngineEventEmitter() {
  return getBus().emitter;
}

/** The version of the last emitted event (0 before the first). */
export function getEngineEventVersion() {
  return getBus().version;
}

/** Stamps the next version on `event` and publishes it. */
export function emitEngineEvent(event: EngineEventInput): EngineEvent {
  const bus = getBus();
  bus.version += 1;
  const stamped = { ...event, version: bus.version } as EngineEvent;
  bus.emitter.emit(ENGINE_EVENT_NAME, stamped);
  return stamped;
}

/** Subscribes to every engine event; returns the unsubscribe function. */
export function onEngineEvent(listener: (event: EngineEvent) => void) {
  const emitter = getBus().emitter;
  // A throwing listener must not break the emitter for the others.
  const safeListener = (event: EngineEvent) => {
    try {
      listener(event);
    } catch {
      // Ignored: subscribers handle their own errors.
    }
  };
  emitter.on(ENGINE_EVENT_NAME, safeListener);
  return () => {
    emitter.off(ENGINE_EVENT_NAME, safeListener);
  };
}
