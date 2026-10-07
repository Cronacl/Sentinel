"use client";

import { useEffect, useSyncExternalStore } from "react";

import { api } from "@/trpc/react";

import {
  applyEngineEvent,
  getEngineEventsConnection,
  getEngineSnapshotPollInterval,
  setEngineEventsConnection,
  subscribeToEngineEventsConnection,
} from "./engine-events";

/** True while engines.onEvents delivers events. */
export function useEngineEventsLive() {
  return (
    useSyncExternalStore(
      subscribeToEngineEventsConnection,
      getEngineEventsConnection,
      () => "idle" as const,
    ) === "live"
  );
}

/**
 * Every engine instance's snapshot. Kept current by EngineEventsBridge;
 * polls instead (2 s while anything is being checked) whenever the event
 * stream is down.
 */
export function useEngineSnapshots() {
  const live = useEngineEventsLive();
  return api.engines.snapshots.useQuery(undefined, {
    refetchInterval: (query) =>
      getEngineSnapshotPollInterval(query.state.data, live),
    staleTime: live ? Number.POSITIVE_INFINITY : 30_000,
  });
}

/**
 * Subscribes to engines.onEvents once for the app and folds each event into
 * the snapshots cache; composer queries are invalidated when an instance's
 * snapshot changes. Mounted once in the app shell.
 */
export function EngineEventsBridge() {
  const utils = api.useUtils();

  const subscription = api.engines.onEvents.useSubscription(undefined, {
    onData: ({ data: event }) => {
      let changed = false;
      utils.engines.snapshots.setData(undefined, (current) => {
        const result = applyEngineEvent(current, event);
        changed = result.changed;
        return result.snapshots;
      });
      if (changed) {
        void utils.engines.composerCatalog.invalidate();
        void utils.engines.models.invalidate();
      }
    },
  });

  // "pending" is a connected stream; while it reconnects ("connecting") or
  // after it gave up ("error"), the snapshots query polls instead.
  useEffect(() => {
    setEngineEventsConnection(
      subscription.status === "pending"
        ? "live"
        : subscription.status === "connecting"
          ? "connecting"
          : subscription.status,
    );
  }, [subscription.status]);

  useEffect(() => () => setEngineEventsConnection("idle"), []);

  return null;
}
