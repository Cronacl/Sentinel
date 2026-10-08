import { on } from "node:events";

import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  emitEngineEvent,
  ENGINE_EVENT_NAME,
  getEngineEventEmitter,
  getEngineEventVersion,
  onEngineEvent,
} = await import("./events");

describe("engine event bus", () => {
  it("stamps increasing versions and delivers events to subscribers", () => {
    const received: unknown[] = [];
    const unsubscribe = onEngineEvent((event) => received.push(event));
    const before = getEngineEventVersion();

    const first = emitEngineEvent({
      instanceId: "a",
      type: "snapshot-removed",
    });
    const second = emitEngineEvent({
      instanceId: "b",
      type: "snapshot-removed",
    });
    unsubscribe();
    emitEngineEvent({ instanceId: "c", type: "snapshot-removed" });

    expect(first.version).toBe(before + 1);
    expect(second.version).toBe(before + 2);
    expect(received).toEqual([first, second]);
  });

  it("keeps delivering when one subscriber throws", () => {
    const received: string[] = [];
    const stopBroken = onEngineEvent(() => {
      throw new Error("boom");
    });
    const stopGood = onEngineEvent((event) => received.push(event.type));

    expect(() =>
      emitEngineEvent({ instanceId: "a", type: "snapshot-removed" }),
    ).not.toThrow();
    expect(received).toEqual(["snapshot-removed"]);
    stopBroken();
    stopGood();
  });

  it("works with events.on for async iteration (the tRPC subscription)", async () => {
    const controller = new AbortController();
    const iterator = on(getEngineEventEmitter(), ENGINE_EVENT_NAME, {
      signal: controller.signal,
    });

    const emitted = emitEngineEvent({
      instanceId: "x",
      type: "snapshot-removed",
    });
    const next = await iterator.next();
    controller.abort();

    expect(next.value).toEqual([emitted]);
  });
});
