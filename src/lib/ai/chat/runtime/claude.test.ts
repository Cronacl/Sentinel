import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const upsertMessage = mock(() => {});
const setActiveMessage = mock(async () => {});
const clearActiveStream = mock(() => {});
const setThreadStatus = mock(() => {});
const loadThreadSessionSnapshot = mock(async (threadId: string) => ({
  activeRunId: "run-1",
  chatEngine: "claude",
  messages: [],
  queuedFollowUps: [],
  threadId,
  threadTitle: "Claude Thread",
  threadStatus: "streaming",
}));

mock.module("server-only", () => ({}));

mock.module("../persistence", () => ({
  clearActiveStream,
  ensureThread: mock(async () => ({ created: true })),
  loadThreadMessages: mock(async () => []),
  setActiveMessage,
  setActiveStream: mock(() => {}),
  setThreadStatus,
  updateClaudeThreadState: mock(() => {}),
  updateThreadChatSettings: mock(async () => {}),
  upsertMessage,
}));

mock.module("../session-server", () => ({
  loadThreadSessionSnapshot,
  serializeThreadStreamEvent: mock(
    (event: unknown) => `event: test\ndata: ${JSON.stringify(event)}\n\n`,
  ),
}));

mock.module("@/lib/ai/chat/engines/claude-sdk", () => ({
  buildClaudeSdkBaseOptions: mock((options: unknown) => options),
  buildClaudeThreadState: mock((input: unknown) => input),
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

const { ThreadChatConflictError } = await import("../errors");
const { runClaudeThreadChat } = await import("./claude");

function createQueryMock() {
  return {
    close: mock(() => {}),
    interrupt: mock(async () => {}),
    [Symbol.asyncIterator]: async function* () {
      return;
    },
  };
}

function createEventChannelMock() {
  return {
    close: mock(() => {}),
    emit: mock(() => {}),
  };
}

function createInputQueueMock() {
  return {
    close: mock(() => {}),
    enqueue: mock(() => {}),
    stream: {
      async *[Symbol.asyncIterator]() {
        return;
      },
    },
  };
}

function createClaudeAssistantPart(input: Record<string, unknown> = {}) {
  return {
    approval: { id: "approval-1", reason: "Needs permission" } as any,
    input,
    state: "approval-requested" as const,
    toolCallId: "approval-1",
    toolName: "claude_bash",
    type: "dynamic-tool" as const,
  } as any;
}

describe("runClaudeThreadChat approvals", () => {
  beforeEach(() => {
    clearActiveStream.mockClear();
    loadThreadSessionSnapshot.mockClear();
    setActiveMessage.mockClear();
    setThreadStatus.mockClear();
    upsertMessage.mockClear();
    if (!(globalThis as any).__sentinelActiveClaudeRunControls) {
      (globalThis as any).__sentinelActiveClaudeRunControls = new Map();
    }
    (globalThis as any).__sentinelActiveClaudeRunControls.clear();
  });

  afterEach(() => {
    (globalThis as any).__sentinelActiveClaudeRunControls?.clear();
  });

  it("resumes a live Claude approval using the explicit approval payload", async () => {
    const resolveApproval = mock(() => {});
    (globalThis as any).__sentinelActiveClaudeRunControls?.set("run-1", {
      abortController: new AbortController(),
      assistantId: "assistant-1",
      eventChannel: createEventChannelMock(),
      exitPlanModeSwitched: false,
      inputQueue: createInputQueueMock(),
      pendingApprovals: new Map([
        [
          "approval-1",
          {
            input: { command: "pwd" },
            resolve: resolveApproval,
            toolCallId: "approval-1",
          },
        ],
      ]),
      pendingQuestions: new Map(),
      pendingResponseWatchers: new Set(),
      query: createQueryMock(),
      runId: "run-1",
      sessionId: "session-1",
      state: {
        assistantId: "assistant-1",
        nextOrder: 1,
        reasoningText: "",
        requestedModelId: null,
        responseModelId: null,
        sessionId: "session-1",
        text: "",
        threadId: "thread-1",
        tools: new Map([
          [
            "approval-1",
            {
              approval: { id: "approval-1", reason: "Needs permission" },
              id: "approval-1",
              input: { command: "pwd" },
              name: "claude_bash",
              order: 0,
              state: "approval-requested",
            },
          ],
        ]),
        usage: null,
      },
      threadId: "thread-1",
    } as any);

    const response = await runClaudeThreadChat(
      {
        threadId: "thread-1",
        toolApprovalResponse: {
          approved: true,
          id: "approval-1",
        },
        trigger: "submit-tool-approval",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        activeStreamId: "run-1",
        chatEngineState: {
          claude: {
            cwd: "/tmp/workspace",
            modelId: null,
            permissionMode: "default",
            sessionId: "session-1",
          },
        },
        status: "awaiting_approval",
      } as any,
    );

    expect(response.status).toBe(204);
    expect(resolveApproval).toHaveBeenCalledWith({
      behavior: "allow",
      updatedInput: { command: "pwd" },
    });
    expect(setThreadStatus).toHaveBeenCalledWith("thread-1", "streaming");
  });

  it("returns a conflict when the live Claude approval is gone", async () => {
    await expect(
      runClaudeThreadChat(
        {
          threadId: "thread-1",
          toolApprovalResponse: {
            approved: true,
            id: "approval-1",
          },
          trigger: "submit-tool-approval",
          userId: "user-1",
          workspaceId: "workspace-1",
        },
        {
          activeStreamId: "run-1",
          chatEngineState: {
            claude: {
              cwd: "/tmp/workspace",
              modelId: null,
              permissionMode: "default",
              sessionId: "session-1",
            },
          },
          status: "awaiting_approval",
        } as any,
      ),
    ).rejects.toBeInstanceOf(ThreadChatConflictError);

    expect(clearActiveStream).toHaveBeenCalledWith("thread-1");
    expect(setThreadStatus).toHaveBeenCalledWith("thread-1", "idle");
  });

  it("returns a conflict when the approval id is no longer pending", async () => {
    (globalThis as any).__sentinelActiveClaudeRunControls?.set("run-1", {
      abortController: new AbortController(),
      assistantId: "assistant-1",
      eventChannel: createEventChannelMock(),
      exitPlanModeSwitched: false,
      inputQueue: createInputQueueMock(),
      pendingApprovals: new Map(),
      pendingQuestions: new Map(),
      pendingResponseWatchers: new Set(),
      query: createQueryMock(),
      runId: "run-1",
      sessionId: "session-1",
      state: {
        assistantId: "assistant-1",
        nextOrder: 1,
        reasoningText: "",
        requestedModelId: null,
        responseModelId: null,
        sessionId: "session-1",
        text: "",
        threadId: "thread-1",
        tools: new Map([
          [
            "approval-1",
            {
              approval: { id: "approval-1", reason: "Needs permission" },
              id: "approval-1",
              input: { command: "pwd" },
              name: "claude_bash",
              order: 0,
              state: "approval-requested",
            },
          ],
        ]),
        usage: null,
      },
      threadId: "thread-1",
    } as any);

    await expect(
      runClaudeThreadChat(
        {
          messages: [
            {
              id: "assistant-1",
              metadata: {},
              parts: [createClaudeAssistantPart({ command: "pwd" })],
              role: "assistant",
            },
          ],
          threadId: "thread-1",
          toolApprovalResponse: {
            approved: true,
            id: "approval-1",
          },
          trigger: "submit-tool-approval",
          userId: "user-1",
          workspaceId: "workspace-1",
        },
        {
          activeStreamId: "run-1",
          chatEngineState: {
            claude: {
              cwd: "/tmp/workspace",
              modelId: null,
              permissionMode: "default",
              sessionId: "session-1",
            },
          },
          status: "awaiting_approval",
        } as any,
      ),
    ).rejects.toBeInstanceOf(ThreadChatConflictError);

    expect(clearActiveStream).not.toHaveBeenCalled();
  });
});
