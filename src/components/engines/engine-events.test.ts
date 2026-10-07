import { describe, expect, it } from "bun:test";

import { makeFakeSnapshot } from "@/lib/ai/chat/engines/contract/testing";

import {
  applyEngineEvent,
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
