"use client";

import { useSyncExternalStore } from "react";

import { api } from "@/trpc/react";

import {
  getEngineEventsConnection,
  subscribeToEngineEventsConnection,
} from "./engine-events";

/** Without the event stream, usage is re-read on the server's TTL. */
const USAGE_POLL_MS = 5 * 60_000;

/**
 * One instance's usage limits (api.engines.usage.get). Kept current by
 * snapshot events (syncUsageLimitsFromEvent); polls only while the event
 * stream is down.
 */
export function useEngineUsageLimits(
  instanceId: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const live =
    useSyncExternalStore(
      subscribeToEngineEventsConnection,
      getEngineEventsConnection,
      () => "idle" as const,
    ) === "live";
  return api.engines.usage.get.useQuery(
    { instanceId: instanceId ?? "" },
    {
      enabled: (options.enabled ?? true) && Boolean(instanceId),
      refetchInterval: live ? false : USAGE_POLL_MS,
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: live ? Number.POSITIVE_INFINITY : 60_000,
    },
  );
}
