import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

// The process-wide service wires itself to the instance registry and its
// change notifications; both are replaced here.
const listeners: Array<(change: unknown) => void> = [];
mock.module("./instances", () => ({
  getEngineInstanceRegistry: () => ({
    get: async () => null,
    list: async () => [],
    listSummaries: async () => [],
  }),
  subscribeToEngineInstanceChanges: (listener: (change: unknown) => void) => {
    listeners.push(listener);
    return () => {};
  },
}));
mock.module("./drivers", () => ({ getEngineDriver: () => null }));

const { getEngineSnapshotService } = await import("./snapshot-service");
const { onEngineEvent } = await import("./events");

describe("getEngineSnapshotService", () => {
  it("is one service per process that follows instance changes", async () => {
    const service = getEngineSnapshotService();
    expect(getEngineSnapshotService()).toBe(service);
    expect(listeners).toHaveLength(1);

    const events: unknown[] = [];
    const stop = onEngineEvent((event) => events.push(event));
    listeners[0]!({
      driver: "codex",
      instanceId: "codex-work",
      type: "removed",
    });
    stop();

    expect(events).toEqual([
      expect.objectContaining({
        instanceId: "codex-work",
        type: "snapshot-removed",
      }),
    ]);
    expect(await service.peekAll("user-1")).toEqual([]);
  });
});
