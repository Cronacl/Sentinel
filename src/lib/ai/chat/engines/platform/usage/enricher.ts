import "server-only";

import type { EngineSnapshot, EngineUsageLimits } from "../../contract";
import type { EngineSnapshotEnricher } from "../snapshot-service";
import type { EngineUsageLimitsStore } from "./limits-store";

// The "usage" snapshot enricher: limits a probe obtained for free are
// recorded as a full read, a read is started in the background when one is
// due and the instance is usable (its answer is republished by the
// snapshot service when it lands), and the snapshot carries what the store
// knows. Never waits on a read: a slow usage endpoint must not hold the
// probe every caller shares.

export function withUsageLimits(
  snapshot: EngineSnapshot,
  limits: EngineUsageLimits | null,
): EngineSnapshot {
  return limits ? { ...snapshot, usageLimits: limits } : snapshot;
}

export function createUsageLimitsEnricher(
  store: EngineUsageLimitsStore,
  options: {
    onError?: (error: unknown, context: { instanceId: string }) => void;
  } = {},
): EngineSnapshotEnricher {
  return {
    enrich({ driver, instance, probe, snapshot, userId }) {
      if (snapshot.auth.status === "unauthenticated") {
        // Signed out: the last account's usage, and any login the reader
        // kept for it, no longer apply.
        store.clear(userId, instance.id);
        driver.usageLimits?.forget?.(instance.id, userId);
        return { ...snapshot, usageLimits: null };
      }
      if (probe?.usageLimits) {
        store.seed(userId, instance.id, probe.usageLimits);
      }
      if (
        driver.usageLimits &&
        snapshot.usable &&
        store.isDue(userId, instance.id, driver)
      ) {
        void store
          .read(userId, { driver, instance, snapshot })
          .catch((error: unknown) =>
            options.onError?.(error, { instanceId: instance.id }),
          );
      }
      return withUsageLimits(snapshot, store.peek(userId, instance.id));
    },
    id: "usage",
  };
}
