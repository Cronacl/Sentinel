import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// The snapshot service with a usage store: the "usage" enricher, the store's
// changes republished on snapshots, and live reports routed through it.

mock.module("server-only", () => ({}));

const { makeFakeInstance, makeFakeModel } =
  await import("../../contract/testing");
const { makeEngineUsageLimits, makeUnavailableEngineUsageLimits } =
  await import("../../contract");
const { DRIVER_CATALOG } = await import("../../catalog");
const { createEngineSnapshotService } = await import("../snapshot-service");
const { createEngineUsageLimitsStore } = await import("./limits-store");

import type {
  EngineEvent,
  EngineProbeResult,
  EngineUsageLimits,
} from "../../contract";
import type { EngineDriver } from "../driver";

const USER = "user-1";
let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "sentinel-usage-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

function readyProbe(overrides: Partial<EngineProbeResult> = {}) {
  return {
    auth: {
      canLogin: true,
      canLogout: true,
      email: null,
      label: null,
      method: "chatgpt",
      plan: "plus",
      status: "authenticated",
    },
    install: {
      installed: true,
      path: "/usr/local/bin/codex",
      source: "managed-path",
      version: "1.0.0",
    },
    models: [makeFakeModel({ isDefault: true })],
    status: "ready",
    ...overrides,
  } satisfies EngineProbeResult;
}

async function waitFor(check: () => boolean, timeoutMs = 2_000) {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for the condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function setup(input: {
  probe?: () => Promise<EngineProbeResult>;
  read?: () => Promise<EngineUsageLimits>;
}) {
  const instance = makeFakeInstance({
    driver: "codex",
    id: "codex",
    stateDir: path.join(root, "engines", "codex"),
  });
  const read = mock(
    input.read ??
      (async () =>
        makeEngineUsageLimits({
          checkedAt: "2026-10-08T10:00:00.000Z",
          windows: [
            {
              id: "primary",
              kind: "session",
              label: "Session",
              usedPercent: 25,
            },
          ],
        })),
  );
  const driver: EngineDriver = {
    capabilities: DRIVER_CATALOG.codex.capabilities,
    kind: "codex",
    meta: DRIVER_CATALOG.codex,
    probe: input.probe ?? (async () => readyProbe()),
    probeTimeoutMs: 1_000,
    usageLimits: { read },
  };
  const events: EngineEvent[] = [];
  const usageLimits = createEngineUsageLimitsStore();
  const service = createEngineSnapshotService({
    drivers: (kind) => (kind === "codex" ? driver : null),
    emit: (event) => events.push(event as EngineEvent),
    registry: {
      get: async () => ({ instance, status: "available" }) as const,
      list: async () => [instance],
      listSummaries: async () => [],
    },
    usageLimits,
  });
  const snapshotEvents = () =>
    events.flatMap((event) => (event.type === "snapshot" ? [event] : []));
  return { events, read, service, snapshotEvents, usageLimits };
}

const hasUsage = (event: { snapshot: { usageLimits: unknown } }) =>
  event.snapshot.usageLimits !== null;

describe("snapshots with usage limits", () => {
  it("reads usage in the background and republishes the snapshot", async () => {
    let finishRead: (limits: EngineUsageLimits) => void = () => {};
    const { read, service, snapshotEvents } = setup({
      read: () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    });

    const first = await service.getSnapshot(USER, "codex");
    // The probe never waits on the usage endpoint.
    expect(first?.usable).toBeTrue();
    expect(first?.usageLimits).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);

    finishRead(
      makeEngineUsageLimits({
        checkedAt: "2026-10-08T10:00:00.000Z",
        windows: [
          { id: "primary", kind: "session", label: "Session", usedPercent: 25 },
        ],
      }),
    );
    await waitFor(() => snapshotEvents().some(hasUsage));

    expect(snapshotEvents()).toHaveLength(2);
    expect(snapshotEvents()[1]?.snapshot.usageLimits?.windows).toEqual([
      { id: "primary", kind: "session", label: "Session", usedPercent: 25 },
    ]);
    expect(
      (await service.getSnapshot(USER, "codex"))?.usageLimits?.windows,
    ).toHaveLength(1);
  });

  it("does not read usage for an instance that cannot be used", async () => {
    const { read, service } = setup({
      probe: async () =>
        readyProbe({
          auth: { ...readyProbe().auth, status: "unauthenticated" },
        }),
    });
    const snapshot = await service.getSnapshot(USER, "codex");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(snapshot?.usable).toBeFalse();
    expect(read).not.toHaveBeenCalled();
  });

  it("drops the usage of an account that signed out", async () => {
    let signedIn = true;
    const { service, snapshotEvents, usageLimits } = setup({
      probe: async () =>
        signedIn
          ? readyProbe()
          : readyProbe({
              auth: { ...readyProbe().auth, status: "unauthenticated" },
            }),
    });
    await service.getSnapshot(USER, "codex");
    await waitFor(() => snapshotEvents().some(hasUsage));

    signedIn = false;
    const snapshot = await service.refresh(USER, "codex");

    expect(snapshot?.usageLimits).toBeNull();
    expect(usageLimits.peek(USER, "codex")).toBeNull();
  });

  it("takes a probe's own limits as the read", async () => {
    const { read, service } = setup({
      probe: async () =>
        readyProbe({
          usageLimits: makeUnavailableEngineUsageLimits({
            checkedAt: "2026-10-08T10:00:00.000Z",
            reason: "unsupported",
          }),
        }),
    });
    const snapshot = await service.getSnapshot(USER, "codex");

    expect(snapshot?.usageLimits?.unavailable?.reason).toBe("unsupported");
    expect(read).not.toHaveBeenCalled();
  });

  it("routes live reports through the store and republishes them", async () => {
    const { service, snapshotEvents, usageLimits } = setup({});
    await service.getSnapshot(USER, "codex");
    await waitFor(() => snapshotEvents().some(hasUsage));

    service.reportUsageLimits(USER, "codex", [
      { id: "primary", kind: "session", label: "Session", usedPercent: 80 },
    ]);

    expect(usageLimits.peek(USER, "codex")?.windows[0]?.usedPercent).toBe(80);
    expect(
      snapshotEvents().at(-1)?.snapshot.usageLimits?.windows[0]?.usedPercent,
    ).toBe(80);
  });

  it("forgets an instance's usage when it changes", async () => {
    const { service, snapshotEvents, usageLimits } = setup({});
    await service.getSnapshot(USER, "codex");
    await waitFor(() => snapshotEvents().some(hasUsage));

    service.handleInstanceChange({
      driver: "codex",
      instanceId: "codex",
      type: "updated",
    });

    // Another home can mean another account: read again.
    expect(usageLimits.peek(USER, "codex")).toBeNull();
  });
});
