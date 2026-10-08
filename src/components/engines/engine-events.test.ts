import { describe, expect, it } from "bun:test";

import { makeFakeSnapshot } from "@/lib/ai/chat/engines/contract/testing";

import {
  applyEngineEvent,
  createComposerViewTracker,
  ENGINE_SNAPSHOT_CHECKING_POLL_MS,
  ENGINE_SNAPSHOT_IDLE_POLL_MS,
  getEngineEventsConnection,
  getEngineSnapshotPollInterval,
  setEngineEventsConnection,
  subscribeToEngineEventsConnection,
} from "./engine-events";

describe("getEngineSnapshotPollInterval", () => {
  it("does not poll while events arrive", () => {
    expect(
      getEngineSnapshotPollInterval(
        [makeFakeSnapshot({ status: "checking" })],
        true,
      ),
    ).toBe(false);
  });

  it("polls every 2 s while anything is being checked without events", () => {
    expect(
      getEngineSnapshotPollInterval(
        [makeFakeSnapshot(), makeFakeSnapshot({ status: "checking" })],
        false,
      ),
    ).toBe(ENGINE_SNAPSHOT_CHECKING_POLL_MS);
    expect(getEngineSnapshotPollInterval([makeFakeSnapshot()], false)).toBe(
      ENGINE_SNAPSHOT_IDLE_POLL_MS,
    );
  });

  it("polls every 2 s while an install or update runs without events", () => {
    expect(
      getEngineSnapshotPollInterval(
        [
          makeFakeSnapshot({
            updateState: {
              finishedAt: null,
              message: "Updating Codex",
              output: null,
              startedAt: "2026-10-08T12:00:00.000Z",
              status: "running",
            },
          }),
        ],
        false,
      ),
    ).toBe(ENGINE_SNAPSHOT_CHECKING_POLL_MS);
  });
});

describe("applyEngineEvent", () => {
  const codex = makeFakeSnapshot({ driver: "codex" });
  const claude = makeFakeSnapshot({ driver: "claude" });

  it("replaces, adds and removes snapshots", () => {
    const updated = makeFakeSnapshot({ driver: "codex", usable: false });
    expect(
      applyEngineEvent([codex, claude], {
        snapshot: updated,
        type: "snapshot",
        version: 2,
      }),
    ).toEqual({ changed: true, snapshots: [updated, claude] });

    const added = makeFakeSnapshot({
      driver: "codex",
      instanceId: "codex-work",
    });
    expect(
      applyEngineEvent([codex], {
        snapshot: added,
        type: "snapshot",
        version: 3,
      }).snapshots,
    ).toEqual([codex, added]);

    expect(
      applyEngineEvent([codex, claude], {
        instanceId: "claude",
        type: "snapshot-removed",
        version: 4,
      }),
    ).toEqual({ changed: true, snapshots: [codex] });
  });

  it("reports no change for a replayed identical snapshot or other events", () => {
    expect(
      applyEngineEvent([codex], {
        snapshot: structuredClone(codex),
        type: "snapshot",
        version: 5,
      }),
    ).toEqual({ changed: false, snapshots: [codex] });
    expect(
      applyEngineEvent([codex], {
        instanceId: "codex",
        type: "maintenance",
        version: 6,
      }).changed,
    ).toBe(false);
  });

  it("folds install and update progress into the instance's snapshot", () => {
    const codex = makeFakeSnapshot({ driver: "codex" });
    const claude = makeFakeSnapshot({ driver: "claude" });
    const updateState = {
      finishedAt: null,
      message: "Updating Codex",
      output: null,
      startedAt: "2026-10-08T12:00:00.000Z",
      status: "running" as const,
    };

    const result = applyEngineEvent([codex, claude], {
      instanceId: "codex",
      type: "maintenance",
      updateState,
      version: 7,
    });
    expect(result.changed).toBe(true);
    expect(result.snapshots?.[0]).toEqual({ ...codex, updateState });
    expect(result.snapshots?.[1]).toBe(claude);

    expect(
      applyEngineEvent([claude], {
        instanceId: "codex",
        type: "maintenance",
        updateState,
        version: 8,
      }).changed,
    ).toBe(false);
  });
});

describe("createComposerViewTracker", () => {
  const snapshotEvent = (
    overrides: Parameters<typeof makeFakeSnapshot>[0],
    version: number,
  ) => ({
    snapshot: makeFakeSnapshot({ driver: "codex", ...overrides }),
    type: "snapshot" as const,
    version,
  });

  it("asks for a refetch only when what the composer shows changes", () => {
    const tracker = createComposerViewTracker();

    // First sight of an instance (a connect replays every one).
    expect(tracker.observe(snapshotEvent({}, 1))).toBe(true);
    // A probe that only moves its times.
    expect(
      tracker.observe(
        snapshotEvent(
          {
            checkedAt: "2026-10-07T12:05:00.000Z",
            lastSuccessfulProbeAt: "2026-10-07T12:05:00.000Z",
          },
          2,
        ),
      ),
    ).toBe(false);
    // Usability, labels and models do.
    expect(tracker.observe(snapshotEvent({ usable: false }, 3))).toBe(true);
    expect(tracker.observe(snapshotEvent({ usable: false }, 4))).toBe(false);
    expect(
      tracker.observe(
        snapshotEvent({ label: "Codex (home)", usable: false }, 5),
      ),
    ).toBe(true);
    expect(
      tracker.observe(
        snapshotEvent({ label: "Codex (home)", models: [], usable: false }, 6),
      ),
    ).toBe(true);
  });

  it("tracks instances apart and refetches on removal only", () => {
    const tracker = createComposerViewTracker();
    expect(tracker.observe(snapshotEvent({}, 1))).toBe(true);
    expect(
      tracker.observe(snapshotEvent({ instanceId: "codex-work" }, 2)),
    ).toBe(true);
    expect(tracker.observe(snapshotEvent({}, 3))).toBe(false);

    expect(
      tracker.observe({
        instanceId: "codex-work",
        type: "snapshot-removed",
        version: 4,
      }),
    ).toBe(true);
    expect(
      tracker.observe({ instanceId: "codex", type: "maintenance", version: 5 }),
    ).toBe(false);
    // A removed instance that comes back is new again.
    expect(
      tracker.observe(snapshotEvent({ instanceId: "codex-work" }, 6)),
    ).toBe(true);
  });
});

describe("events connection store", () => {
  it("notifies subscribers on changes only", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeToEngineEventsConnection(() =>
      seen.push(getEngineEventsConnection()),
    );

    setEngineEventsConnection("live");
    setEngineEventsConnection("live");
    setEngineEventsConnection("connecting");
    unsubscribe();
    setEngineEventsConnection("idle");

    expect(seen).toEqual(["live", "connecting"]);
  });
});
