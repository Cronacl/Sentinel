import { afterEach, describe, expect, it, mock } from "bun:test";

import type { ThreadSessionSnapshot } from "@/lib/ai/chat/session-types";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import {
  ThreadActionError,
  didSnapshotCommitMessage,
  fetchThreadSessionSnapshot,
  formatClientTimingLog,
  hasActiveThreadRun,
  isCommittedThreadActionError,
  isMeaningfulAssistantStreamEvent,
  mergeThreadSessionStateFromSnapshot,
  mergeThreadSessionStateWithError,
  moveQueuedFollowUpToFront,
  readThreadChatErrorMessage,
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
    status: "queued" as const,
    text,
    threadMode: "chat" as const,
  };
}

function createSnapshot(
  partial: Omit<ThreadSessionSnapshot, "chatEngine" | "threadTitle"> &
    Partial<Pick<ThreadSessionSnapshot, "chatEngine" | "threadTitle">>,
): ThreadSessionSnapshot {
  return {
    chatEngine: "sentinel",
    threadTitle: "Thread title",
    ...partial,
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
      chatEngine: "sentinel" as const,
      composerState: { pendingActionCount: 0 },
      connectionState: "connected" as const,
      errorMessage: null,
      lastAppliedRevision: 5,
      lastSyncedAt: 123,
      messages: [createMessage("assistant-1", "same assistant", 5)],
      queuedFollowUps,
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "streaming" as const,
    };
    const snapshot = createSnapshot({
      activeRunId: "run-1",
      messages: current.messages,
      queuedFollowUps,
      threadId: "thread-1",
      threadStatus: "streaming",
    });

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
      chatEngine: "sentinel" as const,
      composerState: { pendingActionCount: 0 },
      connectionState: "connected" as const,
      errorMessage: "stale error",
      lastAppliedRevision: 5,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "newer local assistant", 5)],
      queuedFollowUps: [createQueuedFollowUp("queued-old", "old queue")],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "streaming" as const,
    };
    const snapshot = createSnapshot({
      activeRunId: "run-1",
      messages: [createMessage("assistant-1", "older snapshot", 3)],
      queuedFollowUps: [createQueuedFollowUp("queued-new", "new queue")],
      threadId: "thread-1",
      threadStatus: "idle",
    });

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

  it("preserves newer local queued follow-ups while queue requests are still pending", () => {
    const queuedOld = createQueuedFollowUp("queued-old", "old queue");
    const queuedNew = createQueuedFollowUp("queued-new", "new queue");
    const current = {
      activeRunId: "run-1",
      chatEngine: "sentinel" as const,
      composerState: { pendingActionCount: 2 },
      connectionState: "connected" as const,
      errorMessage: null,
      lastAppliedRevision: 5,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "working", 5)],
      optimisticQueuedFollowUpIds: ["queued-new"],
      queuedFollowUps: [queuedOld, queuedNew],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "streaming" as const,
    };
    const snapshot = createSnapshot({
      activeRunId: "run-1",
      messages: current.messages,
      queuedFollowUps: [queuedOld],
      threadId: "thread-1",
      threadStatus: "streaming",
    });

    const result = mergeThreadSessionStateFromSnapshot(
      current,
      snapshot,
      "connected",
    );

    expect(result.queuedFollowUps).toEqual([queuedOld, queuedNew]);
  });

  it("drops stale server-owned queued follow-ups while preserving optimistic ones", () => {
    const staleServerFollowUp = createQueuedFollowUp("queued-stale", "stale");
    const optimisticFollowUp = createQueuedFollowUp("queued-new", "new queue");
    const current = {
      activeRunId: "run-1",
      chatEngine: "sentinel" as const,
      composerState: { pendingActionCount: 1 },
      connectionState: "connected" as const,
      errorMessage: null,
      lastAppliedRevision: 5,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "working", 5)],
      optimisticQueuedFollowUpIds: ["queued-new"],
      queuedFollowUps: [staleServerFollowUp, optimisticFollowUp],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "streaming" as const,
    };
    const snapshot = createSnapshot({
      activeRunId: "run-1",
      messages: current.messages,
      queuedFollowUps: [],
      threadId: "thread-1",
      threadStatus: "streaming",
    });

    const result = mergeThreadSessionStateFromSnapshot(
      current,
      snapshot,
      "connected",
    );

    expect(result.queuedFollowUps).toEqual([optimisticFollowUp]);
    expect(result.optimisticQueuedFollowUpIds).toEqual(["queued-new"]);
  });

  it("replaces messages when the snapshot is newer", () => {
    const current = {
      activeRunId: "run-1",
      chatEngine: "sentinel" as const,
      composerState: { pendingActionCount: 0 },
      connectionState: "connected" as const,
      errorMessage: null,
      lastAppliedRevision: 2,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "older local assistant", 2)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "streaming" as const,
    };
    const snapshot = createSnapshot({
      activeRunId: "run-1",
      messages: [createMessage("assistant-1", "newer snapshot", 4)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadStatus: "streaming",
    });

    const result = mergeThreadSessionStateFromSnapshot(
      current,
      snapshot,
      "disconnected",
    );

    expect(result.messages).toEqual(snapshot.messages);
    expect(result.lastAppliedRevision).toBe(4);
    expect(result.connectionState).toBe("disconnected");
  });

  it("replaces messages when branch selection changes message ids at the same revision", () => {
    const current = {
      activeRunId: null,
      chatEngine: "sentinel" as const,
      composerState: { pendingActionCount: 0 },
      connectionState: "idle" as const,
      errorMessage: null,
      lastAppliedRevision: 1,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "same text", 1)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "idle" as const,
    };
    const snapshot = createSnapshot({
      activeRunId: null,
      messages: [createMessage("assistant-2", "same text", 1)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadStatus: "idle",
    });

    const result = mergeThreadSessionStateFromSnapshot(
      current,
      snapshot,
      "idle",
    );

    expect(result).not.toBe(current);
    expect(result.messages).toEqual(snapshot.messages);
  });

  it("applies lower-revision snapshots when there is no active run", () => {
    const current = {
      activeRunId: null,
      chatEngine: "sentinel" as const,
      composerState: { pendingActionCount: 0 },
      connectionState: "idle" as const,
      errorMessage: null,
      lastAppliedRevision: 5,
      lastSyncedAt: null,
      messages: [createMessage("assistant-2", "newer branch", 5)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "idle" as const,
    };
    const snapshot = createSnapshot({
      activeRunId: null,
      messages: [createMessage("assistant-1", "older branch", 3)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadStatus: "idle",
    });

    const result = mergeThreadSessionStateFromSnapshot(
      current,
      snapshot,
      "idle",
    );

    expect(result).not.toBe(current);
    expect(result.messages).toEqual(snapshot.messages);
    expect(result.lastAppliedRevision).toBe(5);
  });

  it("updates the stored chat engine from newer snapshots", () => {
    const current = {
      activeRunId: "run-1",
      chatEngine: "sentinel" as const,
      composerState: { pendingActionCount: 0 },
      connectionState: "connected" as const,
      errorMessage: null,
      lastAppliedRevision: 1,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "before switch", 1)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "streaming" as const,
    };
    const snapshot = createSnapshot({
      activeRunId: "run-1",
      chatEngine: "codex",
      messages: [createMessage("assistant-2", "after switch", 2)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadStatus: "streaming",
    });

    const result = mergeThreadSessionStateFromSnapshot(
      current,
      snapshot,
      "connected",
    );

    expect(result.chatEngine).toBe("codex");
  });

  it("accepts Claude snapshots as first-class engine state", () => {
    const current = {
      activeRunId: "run-1",
      chatEngine: "sentinel" as const,
      composerState: { pendingActionCount: 0 },
      connectionState: "connected" as const,
      errorMessage: null,
      lastAppliedRevision: 1,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "before switch", 1)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "streaming" as const,
    };
    const snapshot = createSnapshot({
      activeRunId: "run-1",
      chatEngine: "claude",
      messages: [createMessage("assistant-2", "after switch", 2)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadStatus: "streaming",
    });

    const result = mergeThreadSessionStateFromSnapshot(
      current,
      snapshot,
      "connected",
    );

    expect(result.chatEngine).toBe("claude");
  });

  it("keeps the stream connection active while a run is awaiting approval", () => {
    const current = {
      activeRunId: "run-1",
      chatEngine: "claude" as const,
      composerState: { pendingActionCount: 0 },
      connectionState: "connected" as const,
      errorMessage: null,
      lastAppliedRevision: 1,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "waiting", 1)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "awaiting_approval" as const,
    };
    const snapshot = createSnapshot({
      activeRunId: "run-1",
      chatEngine: "claude",
      messages: current.messages,
      queuedFollowUps: [],
      threadId: "thread-1",
      threadStatus: "awaiting_approval",
    });

    const result = mergeThreadSessionStateFromSnapshot(
      current,
      snapshot,
      "connected",
    );

    expect(result.connectionState).toBe("connected");
    expect(result.threadStatus).toBe("awaiting_approval");
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

  it("requests session snapshots with no-store caching", async () => {
    const fetchMock = mock(async () =>
      Response.json(
        createSnapshot({
          activeRunId: "run-1",
          messages: [],
          queuedFollowUps: [],
          threadId: "thread-1",
          threadStatus: "streaming",
        }),
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchThreadSessionSnapshot("thread-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/chat/thread-1/session", {
      cache: "no-store",
      method: "GET",
    });
  });

  it("surfaces JSON error messages from failed snapshot requests", async () => {
    globalThis.fetch = mock(async () =>
      Response.json(
        {
          error: {
            message: "That Claude approval request is no longer active.",
          },
        },
        { status: 409 },
      ),
    ) as typeof fetch;

    await expect(fetchThreadSessionSnapshot("thread-1")).rejects.toThrow(
      "That Claude approval request is no longer active.",
    );
  });
});

describe("didSnapshotCommitMessage", () => {
  it("treats snapshots containing the submitted message id as committed", () => {
    const snapshot = createSnapshot({
      activeRunId: null,
      messages: [createMessage("user-1", "Prompt", 1)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadStatus: "idle",
    });

    expect(didSnapshotCommitMessage(snapshot, "user-1")).toBe(true);
  });

  it("treats snapshots missing the submitted message id as uncommitted", () => {
    const snapshot = createSnapshot({
      activeRunId: null,
      messages: [createMessage("user-2", "Other prompt", 1)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadStatus: "idle",
    });

    expect(didSnapshotCommitMessage(snapshot, "user-1")).toBe(false);
    expect(didSnapshotCommitMessage(null, "user-1")).toBe(false);
  });
});

describe("moveQueuedFollowUpToFront", () => {
  it("moves the requested follow-up to the front while preserving the rest", () => {
    const queuedFollowUps = [
      createQueuedFollowUp("queued-1", "first"),
      createQueuedFollowUp("queued-2", "second"),
      createQueuedFollowUp("queued-3", "third"),
    ];

    expect(
      moveQueuedFollowUpToFront(queuedFollowUps, "queued-3").map(
        (followUp) => followUp.id,
      ),
    ).toEqual(["queued-3", "queued-1", "queued-2"]);
  });

  it("returns the existing queue when the follow-up is missing", () => {
    const queuedFollowUps = [createQueuedFollowUp("queued-1", "first")];

    expect(moveQueuedFollowUpToFront(queuedFollowUps, "missing")).toBe(
      queuedFollowUps,
    );
  });
});

describe("readThreadChatErrorMessage", () => {
  it("extracts nested JSON error messages", async () => {
    const response = Response.json(
      {
        error: {
          message: "Something went wrong.",
        },
      },
      { status: 500 },
    );

    await expect(
      readThreadChatErrorMessage(
        response,
        "Unable to process the chat request.",
      ),
    ).resolves.toBe("Something went wrong.");
  });

  it("extracts top-level string error field", async () => {
    const response = Response.json(
      {
        error:
          "This action is no longer available because the session has moved on. The page will refresh automatically.",
      },
      { status: 409 },
    );

    await expect(
      readThreadChatErrorMessage(
        response,
        "Unable to process the chat request.",
      ),
    ).resolves.toBe(
      "This action is no longer available because the session has moved on. The page will refresh automatically.",
    );
  });

  it("falls back to plain-text response bodies", async () => {
    const response = new Response("Tool permission request failed.", {
      status: 500,
    });

    await expect(
      readThreadChatErrorMessage(
        response,
        "Unable to process the chat request.",
      ),
    ).resolves.toBe("Tool permission request failed.");
  });

  it("uses the fallback when the error response body is empty", async () => {
    const response = new Response(null, { status: 500 });

    await expect(
      readThreadChatErrorMessage(
        response,
        "Unable to process the chat request.",
      ),
    ).resolves.toBe("Unable to process the chat request.");
  });
});

describe("mergeThreadSessionStateWithError", () => {
  it("stores action errors as shared error state when the thread is idle", () => {
    const current = {
      activeRunId: null,
      chatEngine: "sentinel" as const,
      composerState: { pendingActionCount: 0 },
      connectionState: "idle" as const,
      errorMessage: null,
      lastAppliedRevision: 0,
      lastSyncedAt: null,
      messages: [],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "idle" as const,
    };

    const result = mergeThreadSessionStateWithError(
      current,
      "Unable to process the chat request.",
    );

    expect(result.connectionState).toBe("error");
    expect(result.errorMessage).toBe("Unable to process the chat request.");
  });

  it("preserves the active streaming connection while storing action errors", () => {
    const current = {
      activeRunId: "run-1",
      chatEngine: "sentinel" as const,
      composerState: { pendingActionCount: 0 },
      connectionState: "connected" as const,
      errorMessage: null,
      lastAppliedRevision: 2,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "working", 2)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "streaming" as const,
    };

    const result = mergeThreadSessionStateWithError(
      current,
      "Unable to queue the follow-up.",
    );

    expect(result.connectionState).toBe("connected");
    expect(result.errorMessage).toBe("Unable to queue the follow-up.");
  });

  it("preserves the active approval connection while storing action errors", () => {
    const current = {
      activeRunId: "run-1",
      chatEngine: "claude" as const,
      composerState: { pendingActionCount: 0 },
      connectionState: "connected" as const,
      errorMessage: null,
      lastAppliedRevision: 2,
      lastSyncedAt: null,
      messages: [createMessage("assistant-1", "waiting", 2)],
      queuedFollowUps: [],
      threadId: "thread-1",
      threadTitle: "Thread title",
      threadStatus: "awaiting_approval" as const,
    };

    const result = mergeThreadSessionStateWithError(
      current,
      "This action is no longer available because the session has moved on.",
    );

    expect(result.connectionState).toBe("connected");
    expect(result.errorMessage).toBe(
      "This action is no longer available because the session has moved on.",
    );
  });
});

describe("ThreadActionError", () => {
  it("marks committed turn failures so the transcript can own recovery", () => {
    const error = new ThreadActionError("Request failed.", {
      committed: true,
    });

    expect(isCommittedThreadActionError(error)).toBe(true);
    expect(error.committed).toBe(true);
  });

  it("treats uncommitted failures as banner-worthy request errors", () => {
    const error = new ThreadActionError("Request failed.");

    expect(isCommittedThreadActionError(error)).toBe(false);
    expect(error.committed).toBe(false);
  });
});

describe("formatClientTimingLog", () => {
  it("serializes readable client timing payloads into a single string", () => {
    expect(formatClientTimingLog("first_stream_event", 12.8, "thread-1")).toBe(
      '[ThreadChatClient] {"elapsedMs":13,"phase":"first_stream_event","threadId":"thread-1"}',
    );
  });

  it("formats meaningful assistant timing separately from transport timing", () => {
    expect(
      formatClientTimingLog(
        "first_meaningful_assistant_update",
        18.2,
        "thread-1",
      ),
    ).toBe(
      '[ThreadChatClient] {"elapsedMs":18,"phase":"first_meaningful_assistant_update","threadId":"thread-1"}',
    );
  });
});

describe("isMeaningfulAssistantStreamEvent", () => {
  it("treats only assistant-bearing stream updates as meaningful", () => {
    expect(
      isMeaningfulAssistantStreamEvent({
        message: createMessage("assistant-1", "thinking", 1),
        runId: "run-1",
        type: "message.upsert",
      }),
    ).toBe(true);
    expect(
      isMeaningfulAssistantStreamEvent({
        runId: "run-1",
        status: "streaming",
        type: "message.status",
        messageId: "assistant-1",
      }),
    ).toBe(true);
    expect(
      isMeaningfulAssistantStreamEvent({
        runId: "run-1",
        type: "run.started",
      }),
    ).toBe(false);
  });
});

describe("hasActiveThreadRun", () => {
  it("treats only streaming and approval states with a run id as live", () => {
    expect(hasActiveThreadRun("run-1", "streaming")).toBe(true);
    expect(hasActiveThreadRun("run-1", "awaiting_approval")).toBe(true);
    expect(hasActiveThreadRun("run-1", "idle")).toBe(false);
    expect(hasActiveThreadRun(null, "streaming")).toBe(false);
  });
});
