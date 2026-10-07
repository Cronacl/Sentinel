import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { makeFakeInstance, makeFakeModel } = await import("../contract/testing");
const { DRIVER_CATALOG } = await import("../catalog");
const { createEngineSnapshotService } = await import("./snapshot-service");
const { getInstanceRuntimeKey } = await import("./runtime/resolve-binary");

import type { EngineInstanceSummary, EngineProbeResult } from "../contract";
import type { EngineDriver, ProbeOptions } from "./driver";

type Instance = ReturnType<typeof makeFakeInstance>;

const USER = "user-1";
let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "sentinel-snapshots-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

function instance(overrides: Partial<Instance> = {}): Instance {
  const id = overrides.id ?? "codex";
  return makeFakeInstance({
    stateDir: path.join(root, "engines", id),
    ...overrides,
    id,
  });
}

function summaryOf(
  value: Instance,
  overrides: Partial<EngineInstanceSummary> = {},
): EngineInstanceSummary {
  return {
    accentColor: value.accentColor,
    availability: "available",
    config: value.config,
    customModels: [],
    driver: value.driver,
    enabled: value.enabled,
    environment: [],
    id: value.id,
    isDefault: value.isDefault,
    label: value.label,
    persisted: false,
    sortOrder: value.sortOrder,
    unavailableReason: null,
    ...overrides,
  };
}

function createRegistry(
  instances: Instance[],
  extraSummaries: EngineInstanceSummary[] = [],
) {
  const state = { instances };
  return {
    registry: {
      get: async (_userId: string, id: string) => {
        const found = state.instances.find((value) => value.id === id);
        return found
          ? ({ instance: found, status: "available" } as const)
          : null;
      },
      list: async () => state.instances,
      listSummaries: async () => [
        ...state.instances.map((value) => summaryOf(value)),
        ...extraSummaries,
      ],
    },
    state,
  };
}

function readyProbe(
  overrides: Partial<EngineProbeResult> = {},
): EngineProbeResult {
  return {
    auth: {
      canLogin: true,
      canLogout: true,
      email: "me@example.com",
      label: null,
      method: "chatgpt",
      plan: "plus",
      status: "authenticated",
    },
    defaultModelId: "model-1",
    install: {
      installed: true,
      path: "/usr/local/bin/codex",
      source: "managed-path",
      version: "codex-cli 0.160.0",
    },
    models: [makeFakeModel({ isDefault: true })],
    status: "ready",
    ...overrides,
  };
}

function createDriver(
  probe: (
    instance: Instance,
    options: ProbeOptions,
  ) => Promise<EngineProbeResult>,
  overrides: Partial<EngineDriver> = {},
) {
  const probeMock = mock(probe);
  const driver: EngineDriver = {
    capabilities: DRIVER_CATALOG.codex.capabilities,
    kind: "codex",
    meta: DRIVER_CATALOG.codex,
    probe: probeMock as EngineDriver["probe"],
    probeTimeoutMs: 1_000,
    snapshotTtlMs: 15_000,
    ...overrides,
  };
  return { driver, probe: probeMock };
}

function createClock(start = Date.parse("2026-10-07T12:00:00.000Z")) {
  let now = start;
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

function createService(input: {
  clock?: ReturnType<typeof createClock>;
  drivers: Record<string, EngineDriver>;
  instances: Instance[];
  extraSummaries?: EngineInstanceSummary[];
  enrichers?: Parameters<typeof createEngineSnapshotService>[0]["enrichers"];
}) {
  const events: unknown[] = [];
  const disposed: string[] = [];
  const clock = input.clock ?? createClock();
  const { registry, state } = createRegistry(
    input.instances,
    input.extraSummaries,
  );
  const service = createEngineSnapshotService({
    clock,
    disposeInstance: async (id) => {
      disposed.push(id);
    },
    drivers: (kind) => input.drivers[kind] ?? null,
    emit: (event) => events.push(event),
    enrichers: input.enrichers,
    registry,
  });
  return { clock, disposed, events, service, state };
}

async function flush() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

/** Waits (real time, bounded) for asynchronous work such as file reads. */
async function waitFor(check: () => boolean, timeoutMs = 2_000) {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for the condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("getSnapshot", () => {
  it("builds a usable snapshot from the probe and caches it for the TTL", async () => {
    const { driver, probe } = createDriver(async () => readyProbe());
    const { clock, service } = createService({
      drivers: { codex: driver },
      instances: [instance()],
    });

    const snapshot = await service.getSnapshot(USER, "codex");

    expect(snapshot).toEqual(
      expect.objectContaining({
        auth: expect.objectContaining({ status: "authenticated" }),
        availability: "available",
        checkedAt: "2026-10-07T12:00:00.000Z",
        defaultModelId: "model-1",
        driver: "codex",
        instanceId: "codex",
        isDefaultInstance: true,
        label: "Codex",
        lastSuccessfulProbeAt: "2026-10-07T12:00:00.000Z",
        stale: false,
        status: "ready",
        usable: true,
      }),
    );
    expect(probe.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        depth: "full",
        forceRefresh: false,
        reason: "user",
      }),
    );

    clock.advance(14_000);
    await service.getSnapshot(USER, "codex");
    expect(probe).toHaveBeenCalledTimes(1);

    clock.advance(2_000);
    await service.getSnapshot(USER, "codex");
    expect(probe).toHaveBeenCalledTimes(2);

    await service.getSnapshot(USER, "codex", { forceRefresh: true });
    expect(probe).toHaveBeenCalledTimes(3);
    expect(probe.mock.calls[2]?.[1].forceRefresh).toBe(true);
  });

  it("shares one in-flight probe between concurrent callers", async () => {
    let resolveProbe!: (result: EngineProbeResult) => void;
    const { driver, probe } = createDriver(
      () =>
        new Promise<EngineProbeResult>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const { service } = createService({
      drivers: { codex: driver },
      instances: [instance()],
    });

    const first = service.getSnapshot(USER, "codex");
    const second = service.getSnapshot(USER, "codex");
    await waitFor(() => probe.mock.calls.length > 0);
    await flush();
    resolveProbe(readyProbe());

    const [a, b] = await Promise.all([first, second]);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("aborts a probe that hangs and serves the last snapshot as stale", async () => {
    const signals: AbortSignal[] = [];
    let hang = false;
    const { driver } = createDriver(async (_instance, options) => {
      signals.push(options.signal);
      if (!hang) {
        return readyProbe();
      }
      return await new Promise<EngineProbeResult>(() => {});
    });
    const { clock, service } = createService({
      drivers: { codex: driver },
      instances: [instance()],
    });
    await service.getSnapshot(USER, "codex");

    hang = true;
    const pending = service.getSnapshot(USER, "codex", { forceRefresh: true });
    await waitFor(() => signals.length === 2);
    clock.advance(1_000);
    const snapshot = await pending;

    expect(signals[1]?.aborted).toBe(true);
    expect(snapshot).toEqual(
      expect.objectContaining({
        message: "Codex did not answer within 1 s.",
        stale: true,
        status: "ready",
        usable: true,
      }),
    );
  });

  it("reports a timeout without history as an error and survives throwing probes", async () => {
    const { driver, probe } = createDriver(
      async () => await new Promise<EngineProbeResult>(() => {}),
    );
    const throwing = createDriver(
      async () => {
        throw new Error("spawn EACCES");
      },
      { kind: "claude", meta: DRIVER_CATALOG.claude },
    );
    const { clock, service } = createService({
      drivers: { claude: throwing.driver, codex: driver },
      instances: [instance(), instance({ driver: "claude", id: "claude" })],
    });

    const pending = service.getSnapshot(USER, "codex");
    await waitFor(() => probe.mock.calls.length === 1);
    clock.advance(1_000);
    expect(await pending).toEqual(
      expect.objectContaining({ stale: true, status: "error", usable: false }),
    );
    expect(await service.getSnapshot(USER, "claude")).toEqual(
      expect.objectContaining({
        message: "spawn EACCES",
        status: "error",
        usable: false,
      }),
    );
  });

  it("asks for a cheap probe on interval refreshes while a full probe is fresh", async () => {
    const { driver, probe } = createDriver(async () => readyProbe(), {
      fullProbeTtlMs: 10 * 60 * 1_000,
    });
    const { clock, service } = createService({
      drivers: { codex: driver },
      instances: [instance()],
    });

    await service.getSnapshot(USER, "codex");
    clock.advance(20_000);
    await service.getSnapshot(USER, "codex", { reason: "interval" });
    clock.advance(10 * 60 * 1_000);
    await service.getSnapshot(USER, "codex", { reason: "focus" });

    expect(
      probe.mock.calls.map((call: [Instance, ProbeOptions]) => call[1].depth),
    ).toEqual(["full", "cheap", "full"]);
  });

  it("hands a cheap probe the last full result and goes full again after invalidate", async () => {
    let version = 0;
    const { driver, probe } = createDriver(
      async (_instance, options) =>
        options.depth === "cheap"
          ? { ...options.previous!, message: "carried" }
          : readyProbe({ message: `full ${++version}` }),
      { fullProbeTtlMs: 10 * 60 * 1_000 },
    );
    const { clock, service } = createService({
      drivers: { codex: driver },
      instances: [instance()],
    });

    await service.getSnapshot(USER, "codex");
    clock.advance(20_000);
    const cheap = await service.getSnapshot(USER, "codex", {
      reason: "interval",
    });
    clock.advance(20_000);
    await service.getSnapshot(USER, "codex", { reason: "interval" });

    const options = probe.mock.calls.map(
      (call: [Instance, ProbeOptions]) => call[1],
    );
    expect(options[0]?.previous).toBeNull();
    // Always the full probe's own result, never a carried one.
    expect(options[1]?.previous?.message).toBe("full 1");
    expect(options[2]?.previous?.message).toBe("full 1");
    expect(cheap?.message).toBe("carried");

    service.invalidate("codex");
    await service.getSnapshot(USER, "codex", { reason: "interval" });
    expect(probe.mock.calls.at(-1)?.[1].depth).toBe("full");
  });

  it("never lets an older probe overwrite a newer one that finished first", async () => {
    const pending: Array<(result: EngineProbeResult) => void> = [];
    const { driver, probe } = createDriver(
      () =>
        new Promise<EngineProbeResult>((resolve) => {
          pending.push(resolve);
        }),
    );
    const { events, service } = createService({
      drivers: { codex: driver },
      instances: [instance()],
    });
    const unauthenticated = readyProbe({
      auth: { ...readyProbe().auth, status: "unauthenticated" },
      status: "warning",
    });

    const background = service.getSnapshot(USER, "codex");
    await waitFor(() => probe.mock.calls.length === 1);
    const forced = service.refresh(USER, "codex", "auth");
    await waitFor(() => probe.mock.calls.length === 2);

    // The forced probe (after a login) answers first, the older one later.
    pending[1]!(readyProbe());
    expect((await forced)?.auth.status).toBe("authenticated");
    pending[0]!(unauthenticated);
    expect((await background)?.auth.status).toBe("authenticated");

    expect((await service.getSnapshot(USER, "codex"))?.auth.status).toBe(
      "authenticated",
    );
    expect(probe).toHaveBeenCalledTimes(2);
    expect(
      events.map(
        (event) =>
          (event as { snapshot: { auth: { status: string } } }).snapshot.auth
            .status,
      ),
    ).toEqual(["authenticated"]);
    const persisted = JSON.parse(
      await readFile(
        path.join(root, "engines", "codex", "status.json"),
        "utf8",
      ),
    ) as { snapshot: { auth: { status: string } } };
    expect(persisted.snapshot.auth.status).toBe("authenticated");
  });

  it("does not probe disabled instances and reports unknown ones as null", async () => {
    const { driver, probe } = createDriver(async () => readyProbe());
    const { service } = createService({
      drivers: { codex: driver },
      instances: [instance({ enabled: false })],
    });

    expect(await service.getSnapshot(USER, "codex")).toEqual(
      expect.objectContaining({
        enabled: false,
        status: "disabled",
        usable: false,
      }),
    );
    expect(await service.getSnapshot(USER, "missing")).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it("keeps an unauthenticated engine unusable", async () => {
    const { driver } = createDriver(async () =>
      readyProbe({
        auth: { ...readyProbe().auth, status: "unauthenticated" },
        status: "warning",
      }),
    );
    const { service } = createService({
      drivers: { codex: driver },
      instances: [instance()],
    });

    expect((await service.getSnapshot(USER, "codex"))?.usable).toBe(false);
  });

  it("never puts instance environment values in a snapshot", async () => {
    const { driver } = createDriver(async () => readyProbe());
    const { service } = createService({
      drivers: { codex: driver },
      instances: [
        instance({
          env: { OPENAI_API_KEY: "sk-very-secret" },
          envOverrides: {
            CODEX_HOME: "/homes/work",
            OPENAI_API_KEY: "sk-very-secret",
          },
          id: "codex-work",
          isDefault: false,
        }),
      ],
    });

    const snapshot = await service.getSnapshot(USER, "codex-work");

    expect(JSON.stringify(snapshot)).not.toContain("sk-very-secret");
    expect(snapshot?.runtimePaths).toEqual({ homePath: "/homes/work" });
  });
});

describe("persisted snapshots", () => {
  it("persists a good probe and serves it stale to a cold service while it re-probes", async () => {
    const codex = instance();
    const first = createService({
      drivers: { codex: createDriver(async () => readyProbe()).driver },
      instances: [codex],
    });
    await first.service.getSnapshot(USER, "codex");

    const persisted = JSON.parse(
      await readFile(path.join(codex.stateDir, "status.json"), "utf8"),
    );
    expect(persisted).toEqual(
      expect.objectContaining({
        runtimeKey: getInstanceRuntimeKey(codex),
        savedAt: "2026-10-07T12:00:00.000Z",
        version: 1,
      }),
    );

    let resolveProbe!: (result: EngineProbeResult) => void;
    const cold = createDriver(
      () =>
        new Promise<EngineProbeResult>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const second = createService({
      drivers: { codex: cold.driver },
      instances: [codex],
    });

    const [peeked] = await second.service.peekAll(USER);
    expect(peeked).toEqual(
      expect.objectContaining({ stale: true, status: "ready", usable: true }),
    );
    expect(cold.probe).toHaveBeenCalledTimes(1);

    resolveProbe(readyProbe({ models: [] }));
    await waitFor(() => second.events.length > 0);
    expect(second.events.at(-1)).toEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({ models: [], stale: false }),
        type: "snapshot",
      }),
    );
  });

  it("ignores persisted snapshots that are too old, unreadable or from another configuration", async () => {
    const codex = instance();
    await mkdir(codex.stateDir, { recursive: true });
    const write = (payload: unknown) =>
      writeFile(
        path.join(codex.stateDir, "status.json"),
        JSON.stringify(payload),
      );
    const hang = () =>
      createDriver(async () => await new Promise<EngineProbeResult>(() => {}))
        .driver;

    for (const payload of [
      {
        runtimeKey: "default",
        savedAt: "2026-09-01T00:00:00.000Z",
        snapshot: {},
        version: 1,
      },
      {
        runtimeKey: "codex:other",
        savedAt: "2026-10-07T11:00:00.000Z",
        snapshot: {},
        version: 1,
      },
      "garbage",
    ]) {
      await write(payload);
      const { service } = createService({
        drivers: { codex: hang() },
        instances: [codex],
      });
      const [peeked] = await service.peekAll(USER);
      expect(peeked?.status).toBe("checking");
    }
  });
});

describe("peekAll", () => {
  it("answers immediately with checking snapshots and reports unavailable instances", async () => {
    const { driver, probe } = createDriver(
      async () => await new Promise<EngineProbeResult>(() => {}),
    );
    const grok = instance({ driver: "grok", id: "grok" });
    const { service } = createService({
      drivers: { codex: driver },
      extraSummaries: [
        summaryOf(
          instance({ driver: "gemini", id: "gemini", label: "Gemini" }),
          {
            availability: "unavailable",
            unavailableReason: "driver-unknown",
          },
        ),
      ],
      instances: [instance(), grok],
    });

    const snapshots = await service.peekAll(USER);

    expect(
      snapshots.map((snapshot) => [snapshot.instanceId, snapshot.status]),
    ).toEqual([
      ["codex", "checking"],
      ["grok", "error"],
      ["gemini", "error"],
    ]);
    expect(snapshots[1]?.message).toBe(
      "Grok is not available in this version of Sentinel yet.",
    );
    expect(snapshots[2]?.message).toBe(
      "Gemini uses an engine this version of Sentinel does not know.",
    );
    expect(snapshots[2]?.availability).toBe("unavailable");
    expect(probe).toHaveBeenCalledTimes(1);
  });
});

describe("events and enrichment", () => {
  it("emits only when a snapshot changes beyond its check time", async () => {
    const { driver } = createDriver(async () => readyProbe());
    const { clock, events, service } = createService({
      drivers: { codex: driver },
      instances: [instance()],
    });

    await service.getSnapshot(USER, "codex");
    clock.advance(20_000);
    await service.getSnapshot(USER, "codex");

    expect(events).toHaveLength(1);
  });

  it("runs enrichers in order and skips one that fails", async () => {
    const { driver } = createDriver(async () => readyProbe());
    const calls: string[] = [];
    const { service } = createService({
      drivers: { codex: driver },
      enrichers: [
        {
          enrich: ({ snapshot }) => {
            calls.push("manifest");
            return { ...snapshot, badgeLabel: "Beta" };
          },
          id: "manifest",
        },
        {
          enrich: () => {
            calls.push("broken");
            throw new Error("boom");
          },
          id: "broken",
        },
        {
          enrich: async ({ snapshot, probe }) => {
            calls.push("compatibility");
            expect(probe?.status).toBe("ready");
            return {
              ...snapshot,
              compatibilityAdvisory: {
                message: "Too old",
                recommendedRange: ">=1",
                recommendedVersion: null,
                status: "broken",
              },
            };
          },
          id: "compatibility",
        },
      ],
      instances: [instance()],
    });

    const snapshot = await service.getSnapshot(USER, "codex");

    expect(calls).toEqual(["manifest", "broken", "compatibility"]);
    expect(snapshot?.badgeLabel).toBe("Beta");
    // usable is recomputed after enrichment.
    expect(snapshot?.usable).toBe(false);
  });

  it("gives up on enrichers that miss their deadline and keeps what finished", async () => {
    const { driver } = createDriver(async () => readyProbe());
    const signals: AbortSignal[] = [];
    const errors: string[] = [];
    const clock = createClock();
    const { registry } = createRegistry([instance()]);
    const service = createEngineSnapshotService({
      clock,
      drivers: () => driver,
      emit: () => {},
      enrichTimeoutMs: 500,
      enrichers: [
        {
          enrich: ({ snapshot }) => ({ ...snapshot, badgeLabel: "Beta" }),
          id: "manifest",
        },
        {
          enrich: async (_input, { signal }) => {
            signals.push(signal);
            return await new Promise<never>(() => {});
          },
          id: "usage",
        },
        {
          enrich: ({ snapshot }) => ({ ...snapshot, badgeLabel: "Late" }),
          id: "after-hung",
        },
      ],
      onError: (_error, context) => errors.push(context.stage),
      registry,
    });

    const pending = service.getSnapshot(USER, "codex");
    await waitFor(() => signals.length === 1);
    clock.advance(500);
    const snapshot = await pending;

    expect(signals[0]?.aborted).toBe(true);
    expect(snapshot).toEqual(
      expect.objectContaining({ badgeLabel: "Beta", status: "ready" }),
    );
    expect(errors).toEqual(["enrich"]);
  });

  it("merges usage windows sparsely by id", async () => {
    const { driver } = createDriver(async () =>
      readyProbe({
        usageLimits: {
          checkedAt: "2026-10-07T11:00:00.000Z",
          windows: [
            { id: "session", kind: "session", label: "5h", usedPercent: 10 },
            { id: "weekly", kind: "weekly", label: "Week", usedPercent: 40 },
          ],
        },
      }),
    );
    const { events, service } = createService({
      drivers: { codex: driver },
      instances: [instance()],
    });
    await service.getSnapshot(USER, "codex");

    service.reportUsageLimits(USER, "codex", [
      { id: "session", kind: "session", label: "5h", usedPercent: 95 },
    ]);

    const snapshot = (await service.getSnapshot(USER, "codex"))!;
    expect(snapshot.usageLimits?.windows).toEqual([
      { id: "session", kind: "session", label: "5h", usedPercent: 95 },
      { id: "weekly", kind: "weekly", label: "Week", usedPercent: 40 },
    ]);
    expect(events).toHaveLength(2);
  });
});

describe("instance changes and startup", () => {
  it("drops removed instances, ends their processes and tells subscribers", async () => {
    const { driver } = createDriver(async () => readyProbe());
    const invalidate = mock(() => {});
    driver.invalidate = invalidate;
    const { disposed, events, service } = createService({
      drivers: { codex: driver },
      instances: [instance({ id: "codex-work", isDefault: false })],
    });
    await service.getSnapshot(USER, "codex-work");

    service.handleInstanceChange({
      driver: "codex",
      instanceId: "codex-work",
      type: "removed",
    });
    await waitFor(() => disposed.length > 0);

    expect(invalidate).toHaveBeenCalledWith({
      driver: "codex",
      id: "codex-work",
    });
    expect(disposed).toEqual(["codex-work"]);
    expect(events.at(-1)).toEqual({
      instanceId: "codex-work",
      type: "snapshot-removed",
    });
  });

  it("re-probes an updated instance and ends the processes of a disabled one", async () => {
    const { driver, probe } = createDriver(async () => readyProbe());
    const work = instance({ id: "codex-work", isDefault: false });
    const { disposed, events, service, state } = createService({
      drivers: { codex: driver },
      instances: [work],
    });
    await service.getSnapshot(USER, "codex-work");

    service.handleInstanceChange({
      driver: "codex",
      instanceId: "codex-work",
      type: "updated",
    });
    await waitFor(() => probe.mock.calls.length === 2);
    expect(probe.mock.calls[1]?.[1].reason).toBe("config-change");

    state.instances = [{ ...work, enabled: false }];
    service.handleInstanceChange({
      driver: "codex",
      instanceId: "codex-work",
      type: "updated",
    });
    await waitFor(() => disposed.length > 0 && events.length > 1);

    expect(disposed).toEqual(["codex-work"]);
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({ status: "disabled" }),
      }),
    );
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("probes at startup only instances that were installed and usable last time", async () => {
    const usable = instance({ id: "codex" });
    const neverProbed = instance({ id: "codex-new", isDefault: false });
    const disabled = instance({
      enabled: false,
      id: "codex-off",
      isDefault: false,
    });
    const seed = createService({
      drivers: { codex: createDriver(async () => readyProbe()).driver },
      instances: [usable, disabled],
    });
    await seed.service.getSnapshot(USER, "codex");
    await seed.service.getSnapshot(USER, "codex-off");

    const { driver, probe } = createDriver(async () => readyProbe());
    const { service } = createService({
      drivers: { codex: driver },
      instances: [usable, neverProbed, disabled],
    });
    await service.probeAtStartup(USER, { concurrency: 2 });

    expect(
      probe.mock.calls.map((call: [Instance, ProbeOptions]) => [
        call[0].id,
        call[1].reason,
      ]),
    ).toEqual([["codex", "startup"]]);
  });
});
