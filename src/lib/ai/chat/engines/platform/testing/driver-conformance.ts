import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "bun:test";

import { DRIVER_CATALOG, getDriverMeta } from "../../catalog";
import {
  engineProbeResultSchema,
  type EngineInstanceSummary,
  type ResolvedEngineInstance,
} from "../../contract";
import { makeFakeInstance } from "../../contract/testing";
import {
  getDriverThreadState,
  getThreadStateBinding,
  stampThreadState,
} from "../../state/registry";
import type { EngineDriver, ProbeOptions } from "../driver";
import { EngineTriggerUnsupportedError } from "../errors";
import { createEngineSnapshotService } from "../snapshot-service";

// The checks every server driver passes (design/driver-contract.md §7.2).
// A driver test installs fakes for its runtime (mock.module on the engine
// module, an injected spawn) and calls describeDriverConformance once; the
// harness switches those fakes between an installed, a missing and a hung
// runtime. Nothing here starts a real process or waits on a real timer.

export type DriverConformanceHarness = {
  /** The runtime is installed, signed in and reports at least one model. */
  installed(): void;
  /** The runtime is not installed (omit for built-in drivers). */
  missing?(): void;
  /** Probing never settles on its own (omit for drivers that never wait). */
  hang?(): void;
  makeInstance?(
    overrides?: Partial<ResolvedEngineInstance>,
  ): ResolvedEngineInstance;
  /** Thread states the driver's runtime writes (unstamped). */
  stateSamples?: readonly object[];
};

/** Triggers the platform handles itself, never a driver. */
const PLATFORM_TRIGGERS = new Set([
  "queue-follow-up",
  "steer-follow-up",
  "stop-stream",
]);

const SECRET_ENV_VALUE = "conformance-secret-value-7f3a";

function probeOptions(overrides: Partial<ProbeOptions> = {}): ProbeOptions {
  return {
    depth: "full",
    forceRefresh: true,
    reason: "user",
    signal: new AbortController().signal,
    ...overrides,
  };
}

function createManualClock() {
  let now = Date.parse("2026-10-07T12:00:00.000Z");
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now && timers.delete(id)) {
          timer.callback();
        }
      }
    },
    clearTimeout: (handle: unknown) => {
      timers.delete(handle as number);
    },
    now: () => now,
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
  };
}

function summaryOf(instance: ResolvedEngineInstance): EngineInstanceSummary {
  return {
    accentColor: instance.accentColor,
    availability: "available",
    config: instance.config,
    customModels: [],
    driver: instance.driver,
    enabled: instance.enabled,
    environment: [],
    id: instance.id,
    isDefault: instance.isDefault,
    label: instance.label,
    persisted: false,
    sortOrder: instance.sortOrder,
    unavailableReason: null,
  };
}

export function describeDriverConformance(
  driver: EngineDriver,
  harness: DriverConformanceHarness,
) {
  const roots: string[] = [];

  async function makeInstance(overrides: Partial<ResolvedEngineInstance> = {}) {
    const root = await mkdtemp(path.join(os.tmpdir(), "sentinel-driver-"));
    roots.push(root);
    const build = harness.makeInstance ?? makeFakeInstance;
    const instance = build({ driver: driver.kind, ...overrides });
    return {
      ...instance,
      stateDir: path.join(root, "engines", instance.id),
    };
  }

  describe(`${driver.kind} driver conformance`, () => {
    afterAll(async () => {
      await Promise.all(
        roots.map((root) => rm(root, { force: true, recursive: true })),
      );
    });

    it("declares itself consistently with the catalog", () => {
      const meta = getDriverMeta(driver.kind);
      expect(meta).not.toBeNull();
      expect(driver.meta).toBe(
        DRIVER_CATALOG[driver.kind as keyof typeof DRIVER_CATALOG],
      );
      expect(driver.capabilities).toBe(meta!.capabilities);
      expect(driver.capabilities.supportsMultipleInstances).toBe(
        meta!.multiInstance,
      );
      expect(meta!.status).toBe("available");
      expect(driver.probeTimeoutMs).toBeGreaterThan(0);
      if (meta!.toolPrefix !== null) {
        expect(meta!.toolPrefix).toMatch(/^[a-z][a-z0-9]*_$/);
      }
      // External runtimes own their runs; the built-in engine never does.
      expect(Boolean(driver.thread)).toBe(meta!.runtime === "external");
    });

    it("probes an installed runtime into a valid, usable result", async () => {
      harness.installed();
      const result = await driver.probe(await makeInstance(), probeOptions());

      expect(engineProbeResultSchema.safeParse(result).success).toBe(true);
      expect(result.install.installed).toBe(true);
      expect(result.status).not.toBe("error");
      const ids = result.models.map((model) => model.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    if (harness.missing) {
      it("reports a missing runtime as not installed, without throwing", async () => {
        harness.missing!();
        const result = await driver.probe(await makeInstance(), probeOptions());

        expect(engineProbeResultSchema.safeParse(result).success).toBe(true);
        expect(result.install.installed).toBe(false);
        expect(result.status).toBe("error");
      });
    }

    if (harness.hang) {
      it("never holds a snapshot past its probe timeout", async () => {
        harness.hang!();
        const instance = await makeInstance();
        const clock = createManualClock();
        const service = createEngineSnapshotService({
          clock,
          disposeInstance: async () => {},
          drivers: (kind) => (kind === driver.kind ? driver : null),
          emit: () => {},
          registry: {
            get: async () => ({ instance, status: "available" }),
            list: async () => [instance],
            listSummaries: async () => [summaryOf(instance)],
          },
          retireInstance: async () => {},
        });

        let settled = false;
        const pending = service
          .getSnapshot("user-1", instance.id, { forceRefresh: true })
          .finally(() => {
            settled = true;
          });
        for (let step = 0; step < 50 && !settled; step += 1) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          clock.advance(driver.probeTimeoutMs);
        }
        const snapshot = await pending;

        expect(settled).toBe(true);
        expect(snapshot).not.toBeNull();
        expect(snapshot!.usable).toBe(false);
        expect(snapshot!.stale || snapshot!.status === "error").toBe(true);
      });
    }

    it("never puts instance environment values in its snapshot", async () => {
      harness.installed();
      const base = await makeInstance();
      const instance = {
        ...base,
        env: { ...base.env, CONFORMANCE_TOKEN: SECRET_ENV_VALUE },
        envOverrides: {
          ...base.envOverrides,
          CONFORMANCE_TOKEN: SECRET_ENV_VALUE,
        },
      };
      const service = createEngineSnapshotService({
        disposeInstance: async () => {},
        drivers: (kind) => (kind === driver.kind ? driver : null),
        emit: () => {},
        registry: {
          get: async () => ({ instance, status: "available" }),
          list: async () => [instance],
          listSummaries: async () => [summaryOf(instance)],
        },
        retireInstance: async () => {},
      });

      const snapshot = await service.getSnapshot("user-1", instance.id, {
        forceRefresh: true,
      });

      expect(snapshot).not.toBeNull();
      expect(JSON.stringify(snapshot)).not.toContain(SECRET_ENV_VALUE);
    });

    if (driver.thread) {
      const handlers = driver.thread;

      it("handles turn triggers only, and rejects the others before running", async () => {
        expect(handlers.triggers.length).toBeGreaterThan(0);
        expect(new Set(handlers.triggers).size).toBe(handlers.triggers.length);
        expect(handlers.triggers).toContain("submit-user-message");
        for (const trigger of handlers.triggers) {
          expect(PLATFORM_TRIGGERS.has(trigger)).toBe(false);
        }

        const { createEngineDispatcher } =
          await import("@/lib/ai/chat/runtime/thread-chat/engine-dispatcher");
        let resolved = 0;
        const dispatcher = createEngineDispatcher({
          drivers: (kind) => (kind === driver.kind ? driver : null),
          resolveInstance: async () => {
            resolved += 1;
            return await makeInstance();
          },
        });
        const unsupported = (
          [
            "retry-assistant-message",
            "regenerate-assistant-message",
            "submit-plan-answer",
          ] as const
        ).filter((trigger) => !handlers.triggers.includes(trigger));

        for (const trigger of unsupported) {
          await expect(
            dispatcher.run(
              { driver: driver.kind, instanceId: null },
              {
                threadId: "thread-1",
                trigger,
                userId: "user-1",
                workspaceId: "workspace-1",
              },
              null,
            ),
          ).rejects.toBeInstanceOf(EngineTriggerUnsupportedError);
        }
        expect(resolved).toBe(0);
      });
    }

    if (harness.stateSamples?.length) {
      it("keeps thread state per instance through its continuation key", async () => {
        const binding = getThreadStateBinding(driver.kind);
        expect(binding).not.toBeNull();

        const owner = await makeInstance({
          continuationKey: `${driver.kind}:home:/tmp/owner`,
          id: `${driver.kind}-owner`,
          isDefault: false,
        });
        const other = await makeInstance({
          continuationKey: `${driver.kind}:home:/tmp/other`,
          id: `${driver.kind}-other`,
          isDefault: false,
        });
        const defaultInstance = await makeInstance();

        for (const sample of harness.stateSamples!) {
          const stamped = { [binding!.key]: stampThreadState(sample, owner) };
          const legacy = { [binding!.key]: sample };

          expect(getDriverThreadState(driver.kind, stamped, owner)).toEqual(
            expect.objectContaining(sample),
          );
          expect(getDriverThreadState(driver.kind, stamped, other)).toBeNull();
          // State written before instances existed continues on the default
          // instance only.
          expect(
            getDriverThreadState(driver.kind, legacy, defaultInstance),
          ).toEqual(expect.objectContaining(sample));
          expect(getDriverThreadState(driver.kind, legacy, owner)).toBeNull();
        }
      });
    }
  });
}
