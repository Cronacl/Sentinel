import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

let capturedClaudeQueryInput: { options?: Record<string, unknown> } | null =
  null;

const upsertMessage = mock(() => {});
const setActiveMessage = mock(async () => {});
const clearActiveStream = mock(() => {});
const setThreadStatus = mock(() => {});
const loadThreadMessages = mock(async () => []);
const updateThreadRepoState = mock(() => {});
const beginThreadRepoCheckpointRun = mock(async () => {});
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

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: mock((input: { options?: Record<string, unknown> }) => {
    capturedClaudeQueryInput = input;
    return createQueryMock();
  }),
}));

mock.module("../persistence", () => ({
  clearActiveStream,
  ensureThread: mock(async () => ({ created: true })),
  loadThreadMessages,
  setActiveMessage,
  setActiveStream: mock(() => {}),
  setThreadStatus,
  updateClaudeThreadState: mock(() => {}),
  updateThreadRepoState,
  updateThreadChatSettings: mock(async () => {}),
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

mock.module("@/lib/ai/chat/engines/claude-sdk", async () => {
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
  const actual = await import("../engines/claude-sdk.ts?runtime-test-actual");

  return {
    ...actual,
    buildClaudeSdkBaseOptions: mock((options: unknown) => options),
    buildClaudeThreadState: mock((input: unknown) => input),
    resolveClaudeCodeRuntime: mock(async () => ({
      env: process.env,
      executablePath: null,
    })),
  };
});

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

function createUserMessage(text: string) {
  return {
    id: "user-1",
    metadata: {},
    parts: [{ text, type: "text" as const }],
    role: "user" as const,
  };
}

describe("runClaudeThreadChat approvals", () => {
  beforeEach(() => {
    capturedClaudeQueryInput = null;
    clearActiveStream.mockClear();
    beginThreadRepoCheckpointRun.mockClear();
    loadThreadMessages.mockClear();
    loadThreadSessionSnapshot.mockClear();
    setActiveMessage.mockClear();
    setThreadStatus.mockClear();
    updateThreadRepoState.mockClear();
    upsertMessage.mockClear();
    if (!(globalThis as any).__sentinelActiveClaudeRunControls) {
      (globalThis as any).__sentinelActiveClaudeRunControls = new Map();
    }
    (globalThis as any).__sentinelActiveClaudeRunControls.clear();
  });

  afterEach(() => {
    (globalThis as any).__sentinelActiveClaudeRunControls?.clear();
  });

  it("mirrors AskUserQuestion as claude_user_input from the permission callback and resumes with the submitted response", async () => {
    const response = await runClaudeThreadChat(
      {
        message: createUserMessage("Help me plan this."),
        threadId: "thread-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: {
          claude: {
            cwd: "/tmp/workspace",
            modelId: null,
            permissionMode: "default",
            sessionId: "session-1",
          },
        },
        mode: "chat",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);

    const canUseTool = capturedClaudeQueryInput?.options?.canUseTool as
      | ((
          toolName: string,
          input: Record<string, unknown>,
          permissionOptions: {
            decisionReason?: string;
            signal: AbortSignal;
            toolUseID: string;
          },
        ) => Promise<unknown>)
      | undefined;

    expect(canUseTool).toBeDefined();

    const userQuestionInput = {
      questions: [
        {
          header: "Priority Focus",
          multiSelect: false,
          options: [
            {
              description: "Address stability issues first.",
              label: "Critical fixes",
            },
          ],
          question: "Which improvements would you like to prioritize first?",
        },
      ],
    };

    const permissionPromise = canUseTool?.(
      "Askuserquestion",
      userQuestionInput,
      {
        decisionReason: "Needs permission",
        signal: new AbortController().signal,
        toolUseID: "approval-ask",
      },
    );

    const activeRuns = (globalThis as any)
      .__sentinelActiveClaudeRunControls as Map<
      string,
      {
        inputQueue: {
          stream: AsyncIterable<unknown>;
        };
        pendingApprovals: Map<string, unknown>;
        pendingQuestions: Map<string, unknown>;
      }
    >;
    const [runId, control] = [...activeRuns.entries()][0] ?? [];

    expect(runId).toBeString();
    expect(control?.pendingApprovals.has("approval-ask")).toBe(false);
    expect(control?.pendingQuestions.has("approval-ask")).toBe(true);

    expect(setThreadStatus).toHaveBeenCalledWith(
      "thread-1",
      "awaiting_approval",
    );

    const mirroredAssistant = upsertMessage.mock.calls
      .map((call: any[]) => call[1])
      .findLast(
        (
          message: any,
        ): message is { parts?: unknown[]; role?: string } | undefined =>
          message?.role === "assistant",
      );

    expect(mirroredAssistant?.parts).toContainEqual(
      expect.objectContaining({
        approval: { id: "approval-ask" },
        input: userQuestionInput,
        state: "approval-requested",
        toolCallId: "approval-ask",
        toolName: "claude_user_input",
        type: "dynamic-tool",
      }),
    );

    const promptIterator = control?.inputQueue.stream[Symbol.asyncIterator]();
    await promptIterator?.next();

    const approvalResponse = await runClaudeThreadChat(
      {
        messages: [
          {
            id: "assistant-1",
            metadata: {},
            parts: [
              {
                approval: {
                  id: "approval-ask",
                  response: "Critical fixes",
                } as any,
                input: userQuestionInput,
                state: "approval-responded",
                toolCallId: "approval-ask",
                toolName: "claude_user_input",
                type: "dynamic-tool",
              },
            ],
            role: "assistant",
          },
        ],
        threadId: "thread-1",
        toolApprovalResponse: {
          approved: true,
          id: "approval-ask",
          response: "Critical fixes",
        },
        trigger: "submit-tool-approval",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        activeStreamId: runId,
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

    expect(approvalResponse.status).toBe(204);
    await expect(permissionPromise).resolves.toEqual({
      behavior: "allow",
      updatedInput: userQuestionInput,
    });

    await expect(promptIterator?.next()).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        parent_tool_use_id: "approval-ask",
        tool_use_result: {
          action: "accept",
          answers: { response: "Critical fixes" },
        },
        type: "user",
      }),
    });
    expect(setThreadStatus).toHaveBeenCalledWith("thread-1", "streaming");
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

    const response = await runClaudeThreadChat(
      {
        message: {
          id: "user-2-edit",
          metadata: {},
          parts: [{ text: "revised second", type: "text" }],
          role: "user",
        },
        messageId: "user-2",
        threadId: "thread-1",
        trigger: "edit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: {
          claude: {
            cwd: "/tmp/workspace",
            modelId: null,
            permissionMode: "default",
            sessionId: "session-1",
          },
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
});
