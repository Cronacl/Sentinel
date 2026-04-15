import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

let sentPayloads: Array<Record<string, unknown>> = [];

const clearActiveStream = mock(() => {});
const loadThreadMessages = mock(async () => []);
const setActiveMessage = mock(async () => {});
const setActiveStream = mock(() => {});
const setThreadStatus = mock(() => {});
const updateCodexThreadState = mock(() => {});
const updateClaudeThreadState = mock(() => {});
const updateMessageMetadata = mock(async () => {});
const updateThreadTitle = mock(() => {});
const updateThreadChatSettings = mock(async () => {});
const updateThreadRepoState = mock(() => {});
const upsertMessage = mock(() => {});
const beginThreadRepoCheckpointRun = mock(async () => {});
const loadThreadSessionSnapshot = mock(async (threadId: string) => ({
  activeRunId: "run-1",
  chatEngine: "copilot",
  messages: [],
  queuedFollowUps: [],
  threadId,
  threadTitle: "Copilot Thread",
  threadStatus: "streaming",
}));

const mockSession = {
  disconnect: mock(async () => {}),
  send: mock(async (payload: Record<string, unknown>) => {
    sentPayloads.push(payload);
  }),
  sessionId: "session-1",
};

const copilotManager = {
  createSession: mock(async () => mockSession),
  resumeSession: mock(async () => ({
    ...mockSession,
    sessionId: "session-existing",
  })),
};

mock.module("server-only", () => ({}));

mock.module("@/lib/ai/chat/engines/copilot-sdk", () => ({
  buildCopilotThreadState: mock((input: unknown) => input),
  getCopilotClientManager: () => copilotManager,
  normalizeCopilotErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

mock.module("../persistence", () => ({
  clearActiveStream,
  ensureThread: mock(async () => ({ created: true })),
  loadThreadMessages,
  setActiveMessage,
  setActiveStream,
  setThreadStatus,
  updateClaudeThreadState,
  updateCodexThreadState,
  updateCopilotThreadState: mock(() => {}),
  updateMessageMetadata,
  updateThreadChatSettings,
  updateThreadRepoState,
  updateThreadTitle,
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
  safelyCloseReadableStreamController: mock(() => true),
  safelyEnqueueReadableStreamController: mock(() => true),
  streamContext: {
    createNewResumableStream: mock(async () => {}),
  },
}));

const workspaceRuntimeMock = () => ({
  getToolApprovalPolicies: mock(async () => ({})),
  getToolPermissionMode: mock(async () => "default"),
  getWorkspaceRootPath: mock(async () => "/tmp/workspace"),
});

mock.module("./workspace", workspaceRuntimeMock);
mock.module("./workspace.ts", workspaceRuntimeMock);

const { runCopilotThreadChat } = await import("./copilot");

function createUserMessage(text: string) {
  return {
    id: "user-1",
    metadata: {},
    parts: [{ text, type: "text" as const }],
    role: "user" as const,
  };
}

describe("runCopilotThreadChat", () => {
  beforeEach(() => {
    sentPayloads = [];
    beginThreadRepoCheckpointRun.mockClear();
    clearActiveStream.mockClear();
    loadThreadMessages.mockClear();
    loadThreadSessionSnapshot.mockClear();
    setActiveMessage.mockClear();
    setActiveStream.mockClear();
    setThreadStatus.mockClear();
    updateThreadChatSettings.mockClear();
    updateThreadRepoState.mockClear();
    updateThreadTitle.mockClear();
    upsertMessage.mockClear();
    mockSession.disconnect.mockClear();
    mockSession.send.mockClear();
    copilotManager.createSession.mockClear();
    copilotManager.resumeSession.mockClear();
    if (!(globalThis as any).__sentinelActiveCopilotRunControls) {
      (globalThis as any).__sentinelActiveCopilotRunControls = new Map();
    }
    (globalThis as any).__sentinelActiveCopilotRunControls.clear();
  });

  afterEach(() => {
    (globalThis as any).__sentinelActiveCopilotRunControls?.clear();
  });

  it("injects the strict plan contract into fresh-session plan submissions", async () => {
    const response = await runCopilotThreadChat(
      {
        message: createUserMessage("Generate the plan."),
        modelId: "gpt-5.4",
        threadId: "thread-1",
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
    expect(copilotManager.createSession).toHaveBeenCalledTimes(1);
    expect(updateThreadChatSettings).toHaveBeenCalledWith("thread-1", {
      engine: "copilot",
      mode: "plan",
      modelId: "gpt-5.4",
      reasoningEffort: null,
    });
    expect(sentPayloads[0]?.prompt).toEqual(expect.any(String));
    expect(sentPayloads[0]?.prompt).toContain(
      "Plan Mode is active for this fresh Copilot session",
    );
    expect(sentPayloads[0]?.prompt).toContain("<proposed_plan>");
  });

  it("generates a thread title for fresh Copilot threads", async () => {
    const response = await runCopilotThreadChat(
      {
        message: createUserMessage("Hi"),
        modelId: "openai:gpt-5.4",
        threadId: "thread-title-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        activeStreamId: null,
        chatEngineState: null,
        mode: "chat",
        status: "idle",
        title: "New thread",
      } as any,
    );

    await Promise.resolve();

    expect(response.status).toBe(202);
    expect(updateThreadTitle).toHaveBeenCalledWith("thread-title-1", "Hi");
  });

  it("does not re-bootstrap resumed plan sessions", async () => {
    const response = await runCopilotThreadChat(
      {
        message: createUserMessage("Continue the plan."),
        modelId: "gpt-5.4",
        threadId: "thread-2",
        threadMode: "plan",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: {
          copilot: {
            cwd: "/tmp/workspace",
            modelId: "gpt-5.4",
            reasoningEffort: null,
            sessionId: "session-existing",
          },
        },
        mode: "plan",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);
    expect(copilotManager.resumeSession).toHaveBeenCalledTimes(1);
    expect(sentPayloads[0]?.prompt).toBe("Continue the plan.");
  });

  it("creates a fresh session when leaving plan mode to implement", async () => {
    const response = await runCopilotThreadChat(
      {
        message: createUserMessage("Implement Plan"),
        modelId: "gpt-5.4",
        threadId: "thread-3",
        threadMode: "chat",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: {
          copilot: {
            cwd: "/tmp/workspace",
            modelId: "gpt-5.4",
            reasoningEffort: null,
            sessionId: "session-existing",
          },
        },
        mode: "plan",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);
    expect(copilotManager.createSession).toHaveBeenCalledTimes(1);
    expect(copilotManager.resumeSession).not.toHaveBeenCalled();
    expect(updateThreadChatSettings).toHaveBeenCalledWith("thread-3", {
      engine: "copilot",
      mode: "chat",
      modelId: "gpt-5.4",
      reasoningEffort: null,
    });
    expect(sentPayloads[0]?.prompt).toEqual(expect.any(String));
    expect(sentPayloads[0]?.prompt).toContain("Current mode: chat.");
    expect(sentPayloads[0]?.prompt).toContain("USER: Implement Plan");
    expect(sentPayloads[0]?.prompt).not.toContain(
      "Plan Mode is active for this fresh Copilot session",
    );
  });
});
