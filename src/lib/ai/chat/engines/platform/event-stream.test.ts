import { EventEmitter } from "node:events";

import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { makeFakeSnapshot } = await import("../contract/testing");
const { ENGINE_EVENT_NAME } = await import("./events");
const { streamEngineEvents } = await import("./event-stream");

describe("streamEngineEvents", () => {
  it("replays every snapshot, then streams events, losing none in between", async () => {
    const emitter = new EventEmitter();
    const controller = new AbortController();
    const codex = makeFakeSnapshot({ driver: "codex" });
    const claude = makeFakeSnapshot({ driver: "claude" });
    const stream = streamEngineEvents({
      emitter,
      peekAll: async () => {
        // Emitted while the replay is being read: still delivered.
        emitter.emit(ENGINE_EVENT_NAME, {
          instanceId: "cursor",
          type: "snapshot-removed",
          version: 8,
        });
        return [codex, claude];
      },
      signal: controller.signal,
      version: () => 7,
    });

    const received = [];
    for await (const event of stream) {
      received.push(event);
      if (received.length === 3) {
        controller.abort();
      }
    }

    expect(received).toEqual([
      { snapshot: codex, type: "snapshot", version: 7 },
      { snapshot: claude, type: "snapshot", version: 7 },
      { instanceId: "cursor", type: "snapshot-removed", version: 8 },
    ]);
    expect(emitter.listenerCount(ENGINE_EVENT_NAME)).toBe(0);
  });

  it("ends quietly when the client disconnects", async () => {
    const emitter = new EventEmitter();
    const controller = new AbortController();
    const stream = streamEngineEvents({
      emitter,
      peekAll: async () => [],
      signal: controller.signal,
    });

    const pending = stream.next();
    await Promise.resolve();
    controller.abort();

    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(emitter.listenerCount(ENGINE_EVENT_NAME)).toBe(0);
  });
});
