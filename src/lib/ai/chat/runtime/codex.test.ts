import { beforeEach, describe, expect, it, mock } from "bun:test";

const upsertMessage = mock(() => {});
const setActiveMessage = mock(async () => {});
const clearActiveStream = mock(() => {});
const setThreadStatus = mock(() => {});
const setActiveStream = mock(() => {});
const loadThreadMessages = mock(async () => []);
const updateThreadRepoState = mock(() => {});
const updateThreadChatSettings = mock(async () => {});
const updateCodexThreadState = mock(() => {});
const updateMessageMetadata = mock(async () => {});
const beginThreadRepoCheckpointRun = mock(async () => {});
const loadThreadSessionSnapshot = mock(async (threadId: string) => ({
  activeRunId: "run-1",
  chatEngine: "codex",
  messages: [],
  queuedFollowUps: [],
  threadId,
  threadTitle: "Codex Thread",
  threadStatus: "streaming",
}));

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
  subscribe: mock(() => mock(() => {})),
};

mock.module("server-only", () => ({}));

mock.module("@/lib/ai/chat/engines/codex-app-server", () => ({
  getCodexAppServerManager: () => codexManager,
}));

mock.module("../persistence", () => ({
  clearActiveStream,
  ensureThread: mock(async () => ({ created: true })),
  loadThreadMessages,
  setActiveMessage,
  setActiveStream,
  setThreadStatus,
  updateCodexThreadState,
  updateMessageMetadata,
  updateThreadChatSettings,
  updateThreadRepoState,
  upsertMessage,
}));

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
  streamContext: {
    createNewResumableStream: mock(async () => {}),
  },
}));

mock.module("./workspace", () => ({
  getToolPermissionMode: mock(async () => "default"),
  getWorkspaceRootPath: mock(async () => "/tmp/workspace"),
}));

const { runCodexThreadChat } = await import("./codex");

describe("runCodexThreadChat editing", () => {
  beforeEach(() => {
    beginThreadRepoCheckpointRun.mockClear();
    clearActiveStream.mockClear();
    loadThreadMessages.mockClear();
    loadThreadSessionSnapshot.mockClear();
    setActiveMessage.mockClear();
    setActiveStream.mockClear();
    setThreadStatus.mockClear();
    updateCodexThreadState.mockClear();
    updateMessageMetadata.mockClear();
    updateThreadChatSettings.mockClear();
    updateThreadRepoState.mockClear();
    upsertMessage.mockClear();
    codexManager.resumeThread.mockClear();
    codexManager.startThread.mockClear();
    codexManager.startTurn.mockClear();
    codexManager.subscribe.mockClear();
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
  });
});
