import { beforeEach, describe, expect, it, mock } from "bun:test";

import { PLAN_MODE_DEVELOPER_INSTRUCTIONS } from "./plan-mode-instructions";

const upsertMessage = mock(() => {});
const setActiveMessage = mock(async () => {});
const clearActiveStream = mock(() => {});
const sessionSnapshotState = {
  activeRunId: "run-1" as string | null,
  threadStatus: "streaming" as "idle" | "streaming" | "awaiting_approval",
  threadTitle: "Codex Thread",
};
const setThreadStatus = mock(
  (_threadId: string, status: "idle" | "streaming" | "awaiting_approval") => {
    sessionSnapshotState.threadStatus = status;
  },
);
const setActiveStream = mock((_threadId: string, streamId: string) => {
  sessionSnapshotState.activeRunId = streamId;
});
const loadThread = mock(async () => ({ chatEngineState: null }));
const loadThreadMessages = mock(async () => []);
const updateThreadRepoState = mock(() => {});
const updateThreadChatSettings = mock(async () => {});
const updateCodexThreadState = mock(() => {});
const updateClaudeThreadState = mock(() => {});
const updateCopilotThreadState = mock(() => {});
const updateThreadTitle = mock((_threadId: string, title: string) => {
  sessionSnapshotState.threadTitle = title;
});
const updateMessageMetadata = mock(async () => {});
const beginThreadRepoCheckpointRun = mock(async () => {});
const loadThreadSessionSnapshot = mock(async (threadId: string) => ({
  activeRunId: sessionSnapshotState.activeRunId,
  chatEngine: "codex",
  messages: [],
  queuedFollowUps: [],
  threadId,
  threadTitle: sessionSnapshotState.threadTitle,
  threadStatus: sessionSnapshotState.threadStatus,
}));
let codexSubscriptionHandler: ((event: any) => void) | null = null;

const codexManager = {
  respondToApproval: mock(async () => {}),
  respondToUserInput: mock(async () => {}),
  resumeThread: mock(async (threadId: string) => ({
    cwd: "/tmp/workspace",
    model: "gpt-5.4",
    modelProvider: "openai",
    reasoningEffort: null,
    thread: {
      cliVersion: "1.0.0",
      id: threadId,
    },
  })),
  startThread: mock(async () => ({
    cwd: "/tmp/workspace",
    model: "gpt-5.4",
    modelProvider: "openai",
    reasoningEffort: null,
    thread: {
      cliVersion: "1.0.0",
      id: "codex-thread-1",
    },
  })),
  startTurn: mock(async () => ({
    turn: {
      id: "turn-1",
      items: [],
    },
  })),
  steerTurn: mock(async () => {}),
  subscribe: mock((handler: (event: any) => void) => {
    codexSubscriptionHandler = handler;
    return mock(() => {});
  }),
};

mock.module("server-only", () => ({}));

mock.module("@/lib/ai/chat/engines/codex-app-server", () => ({
  getCodexAppServerManager: () => codexManager,
}));

const persistenceModuleMock = () => ({
  clearActiveStream,
  ensureThread: mock(async () => ({ created: true })),
  loadThread,
  loadThreadMessages,
  setActiveMessage,
  setActiveStream,
  setThreadStatus,
  updateClaudeThreadState: updateClaudeThreadState,
  updateCopilotThreadState: updateCopilotThreadState,
  updateCodexThreadState: updateCodexThreadState,
  updateMessageMetadata,
  updateThreadChatSettings,
  updateThreadTitle,
  updateThreadRepoState,
  upsertMessage,
});

mock.module("../persistence", persistenceModuleMock);
mock.module("../persistence.ts", persistenceModuleMock);
mock.module("@/lib/ai/chat/persistence", persistenceModuleMock);

mock.module("../repo-checkpoints", () => ({
  beginThreadRepoCheckpointRun,
  clearThreadRepoCheckpointRun: mock(async () => {}),
  finalizeThreadRepoCheckpointRun: mock(async () => null),
  getThreadCheckpointAnchorMessageId: mock(
    (thread?: {
      chatEngineState?: {
        repo?: { checkpointAnchorMessageId?: string | null };
      };
    }) => thread?.chatEngineState?.repo?.checkpointAnchorMessageId ?? null,
  ),
}));

mock.module("../session-server", () => ({
  loadThreadSessionSnapshot,
  serializeThreadStreamEvent: mock(
    (event: unknown) => `event: test\ndata: ${JSON.stringify(event)}\n\n`,
  ),
}));

mock.module("@/lib/streams", () => ({
  safelyCloseReadableStreamController: mock(() => true),
  safelyEnqueueReadableStreamController: mock(() => true),
  streamContext: {
    createNewResumableStream: mock(async () => {}),
  },
}));

mock.module("./workspace", () => ({
  getToolApprovalPolicies: mock(async () => ({})),
  getToolPermissionMode: mock(async () => "default"),
  getWorkspaceRootPath: mock(async () => "/tmp/workspace"),
}));

const { runCodexThreadChat } = await import("./codex");

async function emitCodexEvent(event: {
  method: string;
  params?: Record<string, unknown>;
  type?: string;
}) {
  if (!codexSubscriptionHandler) {
    throw new Error("Codex subscription handler is not registered.");
  }

  codexSubscriptionHandler({
    type: "event",
    ...event,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function getLatestAssistantMessage() {
  const assistantCalls = upsertMessage.mock.calls.filter(
    (call: unknown[]) =>
      typeof call[1] === "object" &&
      call[1] !== null &&
      "role" in (call[1] as Record<string, unknown>) &&
      (call[1] as { role?: unknown }).role === "assistant",
  );

  return assistantCalls.at(-1)?.[1] as
    | {
        metadata?: Record<string, unknown>;
        parts: Array<Record<string, unknown>>;
        role: "assistant";
      }
    | undefined;
}

function toDataUrl(content: string, mediaType: string) {
  return `data:${mediaType};base64,${Buffer.from(content).toString("base64")}`;
}

describe("runCodexThreadChat editing", () => {
  beforeEach(() => {
    beginThreadRepoCheckpointRun.mockClear();
    clearActiveStream.mockClear();
    loadThread.mockClear();
    loadThreadMessages.mockClear();
    loadThreadSessionSnapshot.mockClear();
    sessionSnapshotState.activeRunId = "run-1";
    sessionSnapshotState.threadStatus = "streaming";
    sessionSnapshotState.threadTitle = "Codex Thread";
    setActiveMessage.mockClear();
    setActiveStream.mockClear();
    setThreadStatus.mockClear();
    updateCodexThreadState.mockClear();
    updateMessageMetadata.mockClear();
    updateThreadChatSettings.mockClear();
    updateThreadTitle.mockClear();
    updateThreadRepoState.mockClear();
    upsertMessage.mockClear();
    codexManager.resumeThread.mockClear();
    codexManager.startThread.mockClear();
    codexManager.startTurn.mockClear();
    codexManager.subscribe.mockClear();
    codexSubscriptionHandler = null;
  });

  it("supports editing a restored user message and clears the checkpoint anchor", async () => {
    loadThreadMessages.mockResolvedValueOnce([
      {
        createdAt: new Date(1),
        id: "db-user-1",
        messageId: "user-1",
        metadata: {},
        parts: [{ text: "first", type: "text" }],
        role: "user",
        updatedAt: new Date(1),
      },
      {
        createdAt: new Date(2),
        id: "db-assistant-1",
        messageId: "assistant-1",
        metadata: { parentMessageId: "user-1" },
        parts: [{ text: "first reply", type: "text" }],
        role: "assistant",
        updatedAt: new Date(2),
      },
      {
        createdAt: new Date(3),
        id: "db-user-2",
        messageId: "user-2",
        metadata: { parentMessageId: "assistant-1" },
        parts: [{ text: "second", type: "text" }],
        role: "user",
        updatedAt: new Date(3),
      },
      {
        createdAt: new Date(4),
        id: "db-assistant-2",
        messageId: "assistant-2",
        metadata: { parentMessageId: "user-2" },
        parts: [{ text: "second reply", type: "text" }],
        role: "assistant",
        updatedAt: new Date(4),
      },
    ]);

    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-2-edit",
          metadata: {},
          parts: [{ text: "revised second", type: "text" }],
          role: "user",
        },
        messageId: "user-2",
        modelId: "gpt-5.4",
        threadId: "thread-1",
        trigger: "edit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: {
          repo: {
            checkpointAnchorMessageId: "user-2",
          },
        },
        mode: "chat",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);
    expect(upsertMessage).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        id: "user-2-edit",
        metadata: expect.objectContaining({
          editedFromMessageId: "user-2",
          parentMessageId: "assistant-1",
          status: "completed",
        }),
        role: "user",
      }),
    );
    expect(updateThreadRepoState).toHaveBeenCalledWith("thread-1", {
      checkpointAnchorMessageId: null,
    });
  });

  it("persists plan mode on submit", async () => {
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-1",
          metadata: {},
          parts: [{ text: "Plan the rollout", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-2",
        threadMode: "plan",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: null,
        mode: "chat",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);
    expect(updateThreadChatSettings).toHaveBeenCalledWith("thread-2", {
      engine: "codex",
      mode: "plan",
      modelId: "gpt-5.4",
      reasoningEffort: null,
    });
    expect(codexManager.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        collaborationMode: {
          mode: "plan",
          settings: expect.objectContaining({
            developer_instructions: PLAN_MODE_DEVELOPER_INSTRUCTIONS,
            model: "gpt-5.4",
            reasoning_effort: "medium",
          }),
        },
      }),
    );
  });

  it("persists a normalized error message when a Codex turn fails", async () => {
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-failed-1",
          metadata: {},
          parts: [{ text: "Trigger a failure", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-failed-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: null,
        mode: "chat",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);

    await emitCodexEvent({
      method: "turn/completed",
      params: {
        turn: {
          error: {},
          id: "turn-1",
          items: [],
          status: "failed",
        },
      },
    });

    expect(updateMessageMetadata).toHaveBeenCalledWith(
      "thread-failed-1",
      expect.any(String),
      expect.objectContaining({
        errorMessage: "Codex turn failed.",
        status: "error",
      }),
    );
    expect(getLatestAssistantMessage()?.metadata).toEqual(
      expect.objectContaining({
        errorMessage: "Codex turn failed.",
        status: "error",
      }),
    );
    expect(setThreadStatus).toHaveBeenLastCalledWith("thread-failed-1", "idle");
  });

  it("converts non-image attachments into text input instead of rejecting them", async () => {
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-file-1",
          metadata: {},
          parts: [
            {
              filename: "README.md",
              mediaType: "text/markdown",
              type: "file",
              url: toDataUrl("# Hello\n\nThis is a readme.\n", "text/markdown"),
            },
            { text: "summarize this", type: "text" },
          ],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-file-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: null,
        mode: "chat",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);
    expect(codexManager.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.arrayContaining([
          expect.objectContaining({
            text: "summarize this",
            type: "text",
          }),
          expect.objectContaining({
            text: expect.stringContaining("Document: README.md"),
            type: "text",
          }),
          expect.objectContaining({
            text: expect.stringContaining("# Hello"),
            type: "text",
          }),
        ]),
      }),
    );
  });

  it("bootstraps placeholder Codex threads with a title before the first snapshot", async () => {
    sessionSnapshotState.threadTitle = "New thread";

    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-title-1",
          metadata: {},
          parts: [{ text: "Fix codex sidebar title", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-title-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: null,
        mode: "chat",
        status: "idle",
        title: "New thread",
      } as any,
    );

    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(updateThreadTitle).toHaveBeenCalledWith(
      "thread-title-1",
      "Fix Codex Sidebar Title",
    );
    expect(payload).toMatchObject({
      snapshot: {
        threadId: "thread-title-1",
        threadTitle: "Fix Codex Sidebar Title",
      },
    });
  });

  it("starts a fresh Codex thread when switching from plan mode to chat mode", async () => {
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-implement-1",
          metadata: {},
          parts: [{ text: "Implement Plan", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-chat-handoff",
        threadMode: "chat",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: {
          approvalPolicy: "default",
          cliVersion: "1.0.0",
          codexThreadId: "codex-thread-plan-existing",
          cwd: "/tmp/workspace",
          modelId: "gpt-5.4",
          modelProvider: "openai",
          pendingTurnId: null,
          reasoningEffort: null,
          sandboxMode: "workspace-write",
        },
        mode: "plan",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);
    expect(codexManager.resumeThread).not.toHaveBeenCalled();
    expect(codexManager.startThread).toHaveBeenCalledTimes(1);
    expect(codexManager.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        collaborationMode: {
          mode: "default",
          settings: expect.objectContaining({
            developer_instructions: expect.any(String),
            model: "gpt-5.4",
            reasoning_effort: "medium",
          }),
        },
        threadId: "codex-thread-1",
      }),
    );
    expect(updateThreadChatSettings).toHaveBeenCalledWith(
      "thread-chat-handoff",
      {
        engine: "codex",
        mode: "chat",
        modelId: "gpt-5.4",
        reasoningEffort: null,
      },
    );
  });

  it("retries without collaboration mode when the runtime does not support it", async () => {
    codexManager.startTurn.mockImplementationOnce(async () => {
      throw new Error(
        "turn/start.collaborationMode requires experimentalApi capability",
      );
    });

    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-3",
          metadata: {},
          parts: [{ text: "hey", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-3",
        threadMode: "plan",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: null,
        mode: "chat",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);
    expect(codexManager.startTurn).toHaveBeenCalledTimes(2);
    expect(codexManager.startTurn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collaborationMode: {
          mode: "plan",
          settings: expect.objectContaining({
            developer_instructions: PLAN_MODE_DEVELOPER_INSTRUCTIONS,
            model: "gpt-5.4",
            reasoning_effort: "medium",
          }),
        },
      }),
    );
    expect(codexManager.startTurn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining("<proposed_plan>"),
            type: "text",
          }),
        ]),
      }),
    );
    expect(codexManager.startTurn).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({
        collaborationMode: expect.anything(),
      }),
    );

    await emitCodexEvent({
      method: "item/agentMessage/delta",
      params: {
        delta: "<proposed_plan>\n# Fallback Plan\n\nShip it\n</proposed_plan>",
        itemId: "agent-plan-1",
      },
    });

    expect(getLatestAssistantMessage()?.parts).toEqual([
      expect.objectContaining({
        input: { kind: "plan" },
        output: expect.objectContaining({
          steps: null,
          text: "# Fallback Plan\n\nShip it",
        }),
        state: "output-available",
        toolCallId: "agent-plan-1:proposed-plan:0",
        toolName: "codex_plan",
        type: "dynamic-tool",
      }),
    ]);
  });

  it("keeps surrounding prose as text when promoting fallback proposed_plan blocks", async () => {
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-4",
          metadata: {},
          parts: [{ text: "Draft the plan", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-4",
        threadMode: "plan",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: null,
        mode: "chat",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);

    await emitCodexEvent({
      method: "item/agentMessage/delta",
      params: {
        delta:
          "A quick note before the plan.\n\n<proposed_plan>\n# Plan\n\nDo the thing\n</proposed_plan>\n\nFollow-up after the plan.",
        itemId: "agent-plan-2",
      },
    });

    expect(getLatestAssistantMessage()?.parts).toEqual([
      {
        text: "A quick note before the plan.\n\n",
        type: "text",
      },
      expect.objectContaining({
        input: { kind: "plan" },
        output: expect.objectContaining({
          steps: null,
          text: "# Plan\n\nDo the thing",
        }),
        state: "output-available",
        toolCallId: "agent-plan-2:proposed-plan:0",
        toolName: "codex_plan",
        type: "dynamic-tool",
      }),
      {
        text: "\n\nFollow-up after the plan.",
        type: "text",
      },
    ]);
  });

  it("keeps incomplete fallback proposed_plan blocks streaming until the close tag arrives", async () => {
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-5",
          metadata: {},
          parts: [{ text: "Plan this incrementally", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-5",
        threadMode: "plan",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: null,
        mode: "chat",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);

    await emitCodexEvent({
      method: "item/agentMessage/delta",
      params: {
        delta: "Lead-in text\n<proposed_plan>\n# Streaming Plan\n\nPartial",
        itemId: "agent-plan-3",
      },
    });

    expect(getLatestAssistantMessage()?.parts).toEqual([
      {
        text: "Lead-in text\n",
        type: "text",
      },
      expect.objectContaining({
        input: { kind: "plan" },
        output: expect.objectContaining({
          steps: null,
          text: "# Streaming Plan\n\nPartial",
        }),
        state: "input-streaming",
        toolCallId: "agent-plan-3:proposed-plan:0",
        toolName: "codex_plan",
        type: "dynamic-tool",
      }),
    ]);

    await emitCodexEvent({
      method: "item/agentMessage/delta",
      params: {
        delta: "\nMore details\n</proposed_plan>\nTrailing note",
        itemId: "agent-plan-3",
      },
    });

    expect(getLatestAssistantMessage()?.parts).toEqual([
      {
        text: "Lead-in text\n",
        type: "text",
      },
      expect.objectContaining({
        input: { kind: "plan" },
        output: expect.objectContaining({
          steps: null,
          text: "# Streaming Plan\n\nPartial\nMore details",
        }),
        state: "output-available",
        toolCallId: "agent-plan-3:proposed-plan:0",
        toolName: "codex_plan",
        type: "dynamic-tool",
      }),
      {
        text: "\nTrailing note",
        type: "text",
      },
    ]);
  });
});
