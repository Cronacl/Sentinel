import "server-only";

import type {
  EngineSnapshot,
  EngineUsageLimits,
  ResolvedEngineInstance,
} from "../../contract";
import type { EngineDriver } from "../driver";
import type { EngineInstanceRegistry } from "../instances";
import type { EngineSnapshotService } from "../snapshot-service";
import {
  getEngineUsageLimitsStore,
  type EngineUsageLimitsStore,
} from "./limits-store";

// What api.engines.usage answers: one instance's usage limits from the
// store, read through its driver when nothing is known yet (get) or when
// the user asks (refresh), and the Cursor Keychain read that only ever runs
// on that explicit request.

export class EngineUsageError extends Error {
  constructor(
    readonly code: "not-found" | "not-ready" | "unsupported",
    message: string,
  ) {
    super(message);
    this.name = "EngineUsageError";
  }
}

export type EngineUsageServiceDeps = {
  drivers: (kind: string) => Pick<EngineDriver, "kind" | "usageLimits"> | null;
  /** Reads the Cursor CLI's Keychain login (macOS prompt): explicit only. */
  readCursorKeychainToken: (instanceId: string) => Promise<unknown>;
  registry: Pick<EngineInstanceRegistry, "get">;
  snapshots: Pick<EngineSnapshotService, "getSnapshot">;
  store?: EngineUsageLimitsStore;
};

type Target = {
  driver: Pick<EngineDriver, "kind" | "usageLimits">;
  instance: ResolvedEngineInstance;
  snapshot: EngineSnapshot | null;
};

export function createEngineUsageService(deps: EngineUsageServiceDeps) {
  const store = deps.store ?? getEngineUsageLimitsStore();

  async function resolveTarget(
    userId: string,
    instanceId: string,
  ): Promise<Target> {
    const lookup = await deps.registry.get(userId, instanceId);
    const driver =
      lookup?.status === "available"
        ? deps.drivers(lookup.instance.driver)
        : null;
    if (!lookup || lookup.status !== "available" || !driver) {
      throw new EngineUsageError(
        "not-found",
        `Engine instance "${instanceId}" is not available.`,
      );
    }
    return {
      driver,
      instance: lookup.instance,
      snapshot: await deps.snapshots.getSnapshot(userId, instanceId),
    };
  }

  return {
    /**
     * The instance's limits. When none are known yet and the instance is
     * usable, waits for a first read; otherwise answers at once and reads
     * in the background when one is due (the snapshot event carries it).
     */
    async get(
      userId: string,
      instanceId: string,
    ): Promise<EngineUsageLimits | null> {
      const target = await resolveTarget(userId, instanceId);
      const known = store.peek(userId, instanceId);
      if (!target.driver.usageLimits || !target.snapshot?.usable) {
        return known;
      }
      if (!known) {
        return await store.read(userId, target);
      }
      if (store.isDue(userId, instanceId, target.driver)) {
        void store.read(userId, target);
      }
      return known;
    },

    /** A fresh read now (the user asked). */
    async refresh(
      userId: string,
      instanceId: string,
    ): Promise<EngineUsageLimits | null> {
      const target = await resolveTarget(userId, instanceId);
      if (!target.driver.usageLimits) {
        throw new EngineUsageError(
          "unsupported",
          `${target.instance.label} does not report usage limits.`,
        );
      }
      if (!target.snapshot?.usable) {
        throw new EngineUsageError(
          "not-ready",
          target.snapshot?.message ??
            `${target.instance.label} is not ready to report usage.`,
        );
      }
      return await store.read(userId, target, { force: true });
    },

    /**
     * Reads the Cursor CLI's login from the macOS Keychain for this
     * instance, then reads usage with it. Only ever called from the user's
     * explicit request in Settings → Engines: macOS asks them to allow it.
     */
    async readCursorKeychain(
      userId: string,
      instanceId: string,
    ): Promise<EngineUsageLimits | null> {
      const target = await resolveTarget(userId, instanceId);
      if (target.driver.kind !== "cursor" || !target.driver.usageLimits) {
        throw new EngineUsageError(
          "unsupported",
          "Only Cursor keeps a login Sentinel can read from the Keychain.",
        );
      }
      await deps.readCursorKeychainToken(instanceId);
      return await store.read(userId, target, { force: true });
    },
  };
}

export type EngineUsageService = ReturnType<typeof createEngineUsageService>;
