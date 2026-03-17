import { afterEach, describe, expect, it, mock } from "bun:test";

import type { ThreadSessionSnapshot } from "@/lib/ai/chat/session-types";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import {
  fetchThreadSessionSnapshot,
  mergeThreadSessionStateFromSnapshot,
} from "./use-thread-chat";

function createMessage(
  id: string,
  text: string,
  revision: number,
): ThreadUIMessage {
  return {
    id,
    metadata: { revision },
    parts: [{ text, type: "text" }],
    role: "assistant",
  };
}

function createQueuedFollowUp(id: string, text: string) {
  return {
    attachmentCount: 0,
    createdAt: new Date("2026-03-17T10:00:00.000Z"),
    hasFiles: false,
    id,
    modelId: "openai:gpt-5.2",
    reasoningEffort: "high" as const,
    text,
    threadMode: "chat" as const,
  };
}

afterEach(() => {
  mock.restore();
});

describe("mergeThreadSessionStateFromSnapshot", () => {
  it("returns the current state when the snapshot is identical", () => {
    const queuedFollowUps = [createQueuedFollowUp("queued-1", "same queue")];
    const current = {
      activeRunId: "run-1",
      composerState: { pendingActionCount: 0 },
      connectionState: "connected" as const,
      errorMessage: null,
      lastAppliedRevision: 5,
      lastSyncedAt: 123,
      messages: [createMessage("assistant-1", "same assistant", 5)],
      queuedFollowUps,
      threadId: "thread-1",
      threadStatus: "streaming" as const,
    };
    const snapshot: ThreadSessionSnapshot = {
      activeRunId: "run-1",
      messages: current.messages,
      queuedFollowUps,
      threadId: "thread-1",
      threadStatus: "streaming",
    };

    const result = mergeThreadSessionStateFromSnapshot(
      current,
      snapshot,
      "connected",
    );

    expect(result).toBe(current);
  });

  it("preserves newer local messages while applying queue and status updates", () => {
    const current = {
      activeRunId: "run-1",
      composerState: { pendingActionCount: 0 },
      connectionState: "connected" as const,
      errorMessage: "stale error",
      lastAppliedRevision: 5,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "newer local assistant", 5)],
      queuedFollowUps: [createQueuedFollowUp("queued-old", "old queue")],
      threadId: "thread-1",
      threadStatus: "streaming" as const,
    };
    const snapshot: ThreadSessionSnapshot = {
      activeRunId: "run-1",
      messages: [createMessage("assistant-1", "older snapshot", 3)],
      queuedFollowUps: [createQueuedFollowUp("queued-new", "new queue")],
      threadId: "thread-1",
      threadStatus: "idle",
    };

    const result = mergeThreadSessionStateFromSnapshot(
      current,
      snapshot,
      "disconnected",
    );

    expect(result.messages).toEqual(current.messages);
    expect(result.queuedFollowUps).toEqual(snapshot.queuedFollowUps);
    expect(result.threadStatus).toBe("idle");
    expect(result.connectionState).toBe("idle");
    expect(result.lastAppliedRevision).toBe(5);
    expect(result.errorMessage).toBeNull();
  });

  it("replaces messages when the snapshot is newer", () => {
    const current = {
      activeRunId: "run-1",
      composerState: { pendingActionCount: 0 },
      connectionState: "connected" as const,
      errorMessage: null,
      lastAppliedRevision: 2,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "older local assistant", 2)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadStatus: "streaming" as const,
    };
    const snapshot: ThreadSessionSnapshot = {
      activeRunId: "run-1",
      messages: [createMessage("assistant-1", "newer snapshot", 4)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadStatus: "streaming",
    };

    const result = mergeThreadSessionStateFromSnapshot(
      current,
      snapshot,
      "disconnected",
    );

    expect(result.messages).toEqual(snapshot.messages);
    expect(result.lastAppliedRevision).toBe(4);
    expect(result.connectionState).toBe("disconnected");
  });
});

describe("fetchThreadSessionSnapshot", () => {
  it("returns null for missing sessions when allowMissing is enabled", async () => {
    const fetchMock = mock(async () => new Response(null, { status: 404 }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      fetchThreadSessionSnapshot("thread-1", { allowMissing: true }),
    ).resolves.toBeNull();
  });
});
