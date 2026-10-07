import type {
  EngineEvent,
  EngineSnapshot,
} from "@/lib/ai/chat/engines/contract";

// Client-side state for the engines.onEvents subscription: whether it is
// live (a tiny external store, so any component can switch its polling off
// while events arrive) and the pure cache updates applied per event.

export type EngineEventsConnection = "connecting" | "error" | "idle" | "live";

let connection: EngineEventsConnection = "idle";
const listeners = new Set<() => void>();

export function getEngineEventsConnection() {
  return connection;
}

export function setEngineEventsConnection(next: EngineEventsConnection) {
  if (next === connection) {
    return;
  }
  connection = next;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeToEngineEventsConnection(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Polling while `checking` without events (G17): fast until probes settle. */
export const ENGINE_SNAPSHOT_CHECKING_POLL_MS = 2_000;
export const ENGINE_SNAPSHOT_IDLE_POLL_MS = 60_000;

/**
 * How often the snapshots query refetches: never while events arrive, every
 * 2 s while any snapshot is still being checked, otherwise every minute.
 */
export function getEngineSnapshotPollInterval(
  snapshots: readonly Pick<EngineSnapshot, "status">[] | undefined,
  live: boolean,
): number | false {
  if (live) {
    return false;
  }
  return snapshots?.some((snapshot) => snapshot.status === "checking")
    ? ENGINE_SNAPSHOT_CHECKING_POLL_MS
    : ENGINE_SNAPSHOT_IDLE_POLL_MS;
}

/**
 * The snapshots list after one event, and whether anything the composer
 * shows (models, usability, labels) changed. Unrelated events leave the
 * list untouched.
 */
export function applyEngineEvent(
  snapshots: EngineSnapshot[] | undefined,
  event: EngineEvent,
): { changed: boolean; snapshots: EngineSnapshot[] | undefined } {
  if (event.type === "snapshot-removed") {
    if (!snapshots?.some((item) => item.instanceId === event.instanceId)) {
      return { changed: false, snapshots };
    }
    return {
      changed: true,
      snapshots: snapshots.filter(
        (item) => item.instanceId !== event.instanceId,
      ),
    };
  }

  if (event.type !== "snapshot") {
    return { changed: false, snapshots };
  }

  const next = event.snapshot;
  if (!snapshots) {
    // The query has not loaded yet; it will fetch the full list itself.
    return { changed: true, snapshots };
  }

  const index = snapshots.findIndex(
    (item) => item.instanceId === next.instanceId,
  );
  if (index === -1) {
    return { changed: true, snapshots: [...snapshots, next] };
  }
  if (JSON.stringify(snapshots[index]) === JSON.stringify(next)) {
    return { changed: false, snapshots };
  }

  const updated = [...snapshots];
  updated[index] = next;
  return { changed: true, snapshots: updated };
}
