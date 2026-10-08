"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { api } from "@/trpc/react";

import {
  applyEngineEvent,
  createComposerViewTracker,
  getEngineEventsConnection,
  getEngineSnapshotPollInterval,
  setEngineEventsConnection,
  subscribeToEngineEventsConnection,
} from "./engine-events";

/** Coalesces the composer refetches a burst of events asks for. */
const COMPOSER_INVALIDATE_DELAY_MS = 150;

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
 * the snapshots cache; composer queries are invalidated when what the
 * composer shows of an instance changes. Mounted once in the app shell.
 */
export function EngineEventsBridge() {
  const utils = api.useUtils();
  const [composerView] = useState(createComposerViewTracker);
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subscription = api.engines.onEvents.useSubscription(undefined, {
    onData: ({ data: event }) => {
      utils.engines.snapshots.setData(
        undefined,
        (current) => applyEngineEvent(current, event).snapshots,
      );
      // A (re)connect replays every instance: one refetch for the burst.
      if (composerView.observe(event) && !invalidateTimerRef.current) {
        invalidateTimerRef.current = setTimeout(() => {
          invalidateTimerRef.current = null;
          void utils.engines.composerCatalog.invalidate();
          void utils.engines.models.invalidate();
        }, COMPOSER_INVALIDATE_DELAY_MS);
      }
    },
  });

  useEffect(
    () => () => {
      if (invalidateTimerRef.current) {
        clearTimeout(invalidateTimerRef.current);
      }
    },
    [],
  );

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
