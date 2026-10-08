import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

let capturedClaudeQueryInput: { options?: Record<string, unknown> } | null =
  null;
let queryMessages: unknown[] = [];

const upsertMessage = mock(() => {});
const setActiveMessage = mock(async () => {});
const clearActiveStream = mock(() => {});
const setThreadStatus = mock(() => {});
const loadThreadMessages = mock(async () => []);
const loadThread = mock(async () => null);
const updateThreadRepoState = mock(() => {});
const updateThreadChatSettings = mock(async () => {});
const updateCodexThreadState = mock(() => {});
const updateCopilotThreadState = mock(() => {});
const updateCursorThreadState = mock(() => {});
const updateOpenCodeThreadState = mock(() => {});
const updateThreadTitle = mock(() => {});
const updateMessageMetadata = mock(async () => {});
const beginThreadRepoCheckpointRun = mock(async () => {});
const ensureThread = mock(async (..._args: unknown[]) => ({ created: true }));
const updateClaudeThreadState = mock((..._args: unknown[]) => {});
const resolveClaudeCodeRuntime = mock(async (_input: unknown) => ({
  env: process.env,
  executablePath: null,
}));
const getToolPermissionMode = mock(async (): Promise<"default" | "full"> => {
  return "default";
});
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
  ensureThread,
  loadThreadMessages,
  loadThread,
  claimNextThreadFollowUp: mock(() => null),
  resetProcessingThreadFollowUps: mock(() => {}),
  setActiveMessage,
  setActiveStream: mock(() => {}),
  setThreadStatus,
  updateCodexThreadState,
  updateClaudeThreadState,
  updateCopilotThreadState,
  updateCursorThreadState,
  updateMessageMetadata,
  updateOpenCodeThreadState,
  updateThreadRepoState,
  updateThreadChatSettings,
  updateThreadTitle,
  upsertMessage,
}));

mock.module("../repo/checkpoints", () => ({
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

mock.module("../session/server", () => ({
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
    resolveClaudeCodeRuntime,
  };
});

mock.module("@/lib/streams", () => ({
  safelyCloseReadableStreamController: mock(() => true),
  safelyEnqueueReadableStreamController: mock(() => true),
  streamContext: {
    createNewResumableStream: mock(async () => {}),
  },
}));

mock.module("./workspace", () => ({
  getToolApprovalPolicies: mock(async () => ({})),
  getToolPermissionMode,
  getWorkspaceRootPath: mock(async () => "/tmp/workspace"),
}));

const { ThreadChatConflictError } = await import("../errors");
const { makeFakeInstance } = await import("../engines/contract/testing");
const { UNATTENDED_DECLINE_MESSAGE } = await import("./unattended");
const { runClaudeThreadChat } = await import("./claude");
const { getEngineUsageLimitsStore } =
  await import("../engines/platform/usage/limits-store");
const { getLatestClaudeRateLimits, resetClaudeRateLimits } =
  await import("./claude/rate-limits");

type CanUseToolMock = (
  toolName: string,
  input: Record<string, unknown>,
  permissionOptions: {
    decisionReason?: string;
    signal: AbortSignal;
    toolUseID: string;
  },
) => Promise<unknown>;

function createSuccessResult(overrides: Record<string, unknown> = {}) {
  return {
    duration_api_ms: 1,
    duration_ms: 1,
    errors: [],
    is_error: false,
    modelUsage: {},
    num_turns: 1,
    permission_denials: [],
    result: "",
    session_id: "session-1",
    stop_reason: "end_turn",
    subtype: "success",
    total_cost_usd: 0,
    type: "result",
    usage: {
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      server_tool_use: {},
      service_tier: "standard",
    },
    uuid: "result-1",
    ...overrides,
  };
}

function getLatestMirroredAssistant() {
  return upsertMessage.mock.calls
    .map((call: any[]) => call[1])
    .findLast((message: any) => message?.role === "assistant") as
    | {
        metadata?: Record<string, unknown>;
        parts?: Array<Record<string, unknown>>;
      }
    | undefined;
}

function getOnlyActiveRun() {
  const activeRuns = (globalThis as any)
    .__sentinelActiveClaudeRunControls as Map<string, any>;
  const [runId, control] = [...activeRuns.entries()][0] ?? [];
  return { control, runId: runId as string };
}

async function flushClaudeRun() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createQueryMock() {
  const messages = [...queryMessages];

  return {
    close: mock(() => {}),
    interrupt: mock(async () => {}),
    [Symbol.asyncIterator]: async function* () {
      for (const message of messages) {
        yield message;
      }
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
    queryMessages = [];
    clearActiveStream.mockClear();
    beginThreadRepoCheckpointRun.mockClear();
    loadThread.mockClear();
    loadThreadMessages.mockClear();
    loadThreadSessionSnapshot.mockClear();
    setActiveMessage.mockClear();
    setThreadStatus.mockClear();
    updateThreadChatSettings.mockClear();
    updateThreadRepoState.mockClear();
    updateThreadTitle.mockClear();
    upsertMessage.mockClear();
    getToolPermissionMode.mockClear();
    resetClaudeRateLimits();
    if (!(globalThis as any).__sentinelActiveClaudeRunControls) {
      (globalThis as any).__sentinelActiveClaudeRunControls = new Map();
    }
    (globalThis as any).__sentinelActiveClaudeRunControls.clear();
  });

  afterEach(() => {
    (globalThis as any).__sentinelActiveClaudeRunControls?.clear();
  });

  it("mirrors AskUserQuestion as claude_user_input and answers it through canUseTool updatedInput", async () => {
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
      updatedInput: {
        ...userQuestionInput,
        answers: {
          "Which improvements would you like to prioritize first?":
            "Critical fixes",
        },
      },
    });

    // The answer travels only through canUseTool; no user message is queued.
    await expect(
      Promise.race([
        promptIterator?.next(),
        new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
      ]),
    ).resolves.toBe("pending");
    expect(setThreadStatus).toHaveBeenCalledWith("thread-1", "streaming");
  });

  it("generates a thread title for fresh Claude threads", async () => {
    const response = await runClaudeThreadChat(
      {
        message: createUserMessage("Hi"),
        modelId: "anthropic:claude-sonnet-4",
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

  it("mirrors Claude local slash command output as assistant text", async () => {
    queryMessages = [
      {
        content: "Total cost: $0.01",
        session_id: "session-1",
        subtype: "local_command_output",
        type: "system",
        uuid: "system-1",
      },
      {
        duration_api_ms: 1,
        duration_ms: 1,
        errors: [],
        is_error: false,
        modelUsage: {},
        num_turns: 1,
        permission_denials: [],
        result: "",
        session_id: "session-1",
        stop_reason: "end_turn",
        subtype: "success",
        total_cost_usd: 0,
        type: "result",
        usage: {
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          server_tool_use: {},
          service_tier: "standard",
        },
        uuid: "result-1",
      },
    ];

    const response = await runClaudeThreadChat(
      {
        message: createUserMessage("/cost"),
        threadId: "thread-cost",
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

    await new Promise((resolve) => setTimeout(resolve, 0));

    const mirroredAssistant = upsertMessage.mock.calls
      .map((call: any[]) => call[1])
      .findLast(
        (
          message: any,
        ): message is { parts?: unknown[]; role?: string } | undefined =>
          message?.role === "assistant",
      );

    expect(response.status).toBe(202);
    expect(mirroredAssistant?.parts).toContainEqual(
      expect.objectContaining({
        text: "Total cost: $0.01",
        type: "text",
      }),
    );
    expect(setThreadStatus).toHaveBeenCalledWith("thread-cost", "idle");
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

  it("persists plan mode on submit", async () => {
    const response = await runClaudeThreadChat(
      {
        message: createUserMessage("Help me plan this."),
        modelId: "claude-sonnet-4-20250514",
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
    expect(updateThreadChatSettings).toHaveBeenCalledWith("thread-1", {
      engine: "claude",
      mode: "plan",
      modelId: "claude-sonnet-4-20250514",
      reasoningEffort: null,
    });
    expect(capturedClaudeQueryInput?.options?.permissionMode).toBe("plan");

    const activeRuns = (globalThis as any)
      .__sentinelActiveClaudeRunControls as Map<
      string,
      {
        inputQueue: {
          stream: AsyncIterable<unknown>;
        };
      }
    >;
    const [, control] = [...activeRuns.entries()][0] ?? [];
    const promptIterator = control?.inputQueue.stream[Symbol.asyncIterator]();
    const promptMessage = await promptIterator?.next();

    expect(promptMessage?.value).toEqual(
      expect.objectContaining({
        message: expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining("<proposed_plan>"),
              type: "text",
            }),
          ]),
        }),
      }),
    );
  });

  it("starts a fresh Claude session when leaving plan mode to implement", async () => {
    const response = await runClaudeThreadChat(
      {
        message: createUserMessage("Implement Plan"),
        modelId: "claude-sonnet-4-20250514",
        threadId: "thread-2",
        threadMode: "chat",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: {
          claude: {
            cwd: "/tmp/workspace",
            modelId: "claude-sonnet-4-20250514",
            permissionMode: "default",
            sessionId: "session-existing",
          },
        },
        mode: "plan",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);
    expect(updateThreadChatSettings).toHaveBeenCalledWith("thread-2", {
      engine: "claude",
      mode: "chat",
      modelId: "claude-sonnet-4-20250514",
      reasoningEffort: null,
    });
    expect(capturedClaudeQueryInput?.options?.permissionMode).toBe("default");
    expect(capturedClaudeQueryInput?.options?.resume).toBeUndefined();
    expect(capturedClaudeQueryInput?.options?.sessionId).toEqual(
      expect.any(String),
    );

    const activeRuns = (globalThis as any)
      .__sentinelActiveClaudeRunControls as Map<
      string,
      {
        inputQueue: {
          stream: AsyncIterable<unknown>;
        };
      }
    >;
    const [, control] = [...activeRuns.entries()][0] ?? [];
    const promptIterator = control?.inputQueue.stream[Symbol.asyncIterator]();
    const promptMessage = await promptIterator?.next();
    const promptParts = (promptMessage?.value as any)?.message?.content ?? [];

    expect(promptParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "Implement Plan",
          type: "text",
        }),
      ]),
    );
    expect(JSON.stringify(promptParts)).not.toContain("<proposed_plan>");
  });
  it("holds an AskUserQuestion answer that arrives before canUseTool", async () => {
    await runClaudeThreadChat(
      {
        message: createUserMessage("Plan it."),
        threadId: "thread-early",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );
    const { control, runId } = getOnlyActiveRun();
    // The assistant tool_use block was mirrored before Claude Code asked.
    control.pendingQuestions.set("question-early", {
      toolCallId: "question-early",
    });

    const answered = await runClaudeThreadChat(
      {
        threadId: "thread-early",
        toolApprovalResponse: {
          approved: true,
          id: "question-early",
          response: "Option B",
        },
        trigger: "submit-tool-approval",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { activeStreamId: runId, status: "awaiting_approval" } as any,
    );
    expect(answered.status).toBe(204);

    const questionInput = {
      questions: [
        {
          header: "Option",
          multiSelect: false,
          options: [
            { description: "First", label: "Option A" },
            { description: "Second", label: "Option B" },
          ],
          question: "Which option?",
        },
      ],
    };
    const canUseTool = capturedClaudeQueryInput?.options
      ?.canUseTool as CanUseToolMock;
    await expect(
      canUseTool("AskUserQuestion", questionInput, {
        signal: new AbortController().signal,
        toolUseID: "question-early",
      }),
    ).resolves.toEqual({
      behavior: "allow",
      updatedInput: {
        ...questionInput,
        answers: { "Which option?": "Option B" },
      },
    });
    expect(control.pendingQuestions.has("question-early")).toBe(false);
  });

  it("passes explicit run options for Claude Agent SDK 0.3", async () => {
    await runClaudeThreadChat(
      {
        message: createUserMessage("Hi"),
        modelId: "claude-opus-5-5",
        reasoningEffort: "xhigh",
        threadId: "thread-options",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );

    expect(capturedClaudeQueryInput?.options).toEqual(
      expect.objectContaining({
        effort: "xhigh",
        model: "claude-opus-5-5",
        permissionMode: "default",
        sandbox: expect.objectContaining({
          autoAllowBashIfSandboxed: true,
          enabled: true,
          failIfUnavailable: false,
        }),
        settings: { showThinkingSummaries: true },
        thinking: { display: "summarized", type: "adaptive" },
        toolConfig: { askUserQuestion: { previewFormat: "markdown" } },
      }),
    );
    expect(
      capturedClaudeQueryInput?.options?.allowDangerouslySkipPermissions,
    ).toBeUndefined();
  });

  it("uses bypassPermissions without a sandbox in full mode and maps Sentinel-only efforts", async () => {
    getToolPermissionMode.mockResolvedValueOnce("full");

    await runClaudeThreadChat(
      {
        message: createUserMessage("Hi"),
        reasoningEffort: "minimal",
        threadId: "thread-full",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );

    expect(capturedClaudeQueryInput?.options).toEqual(
      expect.objectContaining({
        allowDangerouslySkipPermissions: true,
        effort: "low",
        permissionMode: "bypassPermissions",
      }),
    );
    expect(capturedClaudeQueryInput?.options?.sandbox).toBeUndefined();
  });

  it("omits effort when none was requested", async () => {
    await runClaudeThreadChat(
      {
        message: createUserMessage("Hi"),
        threadId: "thread-no-effort",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );

    expect(capturedClaudeQueryInput?.options?.effort).toBeUndefined();
  });

  it("sends a Claude skill chip as Claude Code's own slash command", async () => {
    queryMessages = [createSuccessResult({ result: "Done." })];

    await runClaudeThreadChat(
      {
        message: {
          ...createUserMessage("ok, now $review the diff"),
          metadata: {
            composerContext: {
              paths: [],
              skills: [
                {
                  directory: "/tmp/workspace/.claude/skills/review",
                  engine: "claude",
                  name: "review",
                  sourceKind: "claude",
                  target: "claude",
                },
              ],
            },
          },
        },
        threadId: "thread-skill",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );

    const prompt = (
      capturedClaudeQueryInput as unknown as {
        prompt: AsyncIterable<{ message: { content: any[] } }>;
      }
    ).prompt;
    const first = await prompt[Symbol.asyncIterator]().next();
    const content = first.value.message.content;
    expect(content.at(-1)).toEqual({ text: "/review the diff", type: "text" });
    expect(content[0].text).toContain('<skill name="review" />');
    expect(content[0].text).toEndWith("ok, now");
    await flushClaudeRun();
  });

  it("keeps a Claude skill chip from a folder Claude Code does not read as prose", async () => {
    queryMessages = [createSuccessResult({ result: "Done." })];

    await runClaudeThreadChat(
      {
        message: {
          ...createUserMessage("ok, now $review the diff"),
          metadata: {
            composerContext: {
              paths: [],
              skills: [
                {
                  // A skillsBasePath folder: listed by Sentinel only.
                  directory: "/custom/base/.claude/skills/review",
                  engine: "claude",
                  name: "review",
                  scope: "global",
                  sourceKind: "claude",
                  target: "claude",
                },
              ],
            },
          },
        },
        threadId: "thread-skill-elsewhere",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );

    const prompt = (
      capturedClaudeQueryInput as unknown as {
        prompt: AsyncIterable<{ message: { content: any[] } }>;
      }
    ).prompt;
    const first = await prompt[Symbol.asyncIterator]().next();
    const content = first.value.message.content;
    expect(content).toHaveLength(1);
    expect(content[0].text).toContain('<skill name="review" />');
    expect(content[0].text).toEndWith("ok, now $review the diff");
    await flushClaudeRun();
  });

  it("records rate_limit_event messages and finishes the run normally", async () => {
    queryMessages = [
      {
        rate_limit_info: {
          rateLimitType: "five_hour",
          resetsAt: 1_790_000_000,
          status: "allowed_warning",
          utilization: 0.82,
        },
        session_id: "session-1",
        type: "rate_limit_event",
        uuid: "rate-limit-1",
      },
      createSuccessResult({ result: "Done." }),
    ];

    await runClaudeThreadChat(
      {
        message: createUserMessage("Hi"),
        threadId: "thread-rate-limit",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );
    await flushClaudeRun();

    expect(getLatestClaudeRateLimits()).toEqual([
      expect.objectContaining({
        info: expect.objectContaining({
          rateLimitType: "five_hour",
          status: "allowed_warning",
        }),
        sessionId: "session-1",
      }),
    ]);
    // The run's instance (the default one here) gets the live window.
    expect(getEngineUsageLimitsStore().peek("user-1", "claude")).toEqual(
      expect.objectContaining({
        windows: [
          {
            id: "five_hour",
            kind: "session",
            label: "Session",
            resetsAt: new Date(1_790_000_000_000).toISOString(),
            usedPercent: 82,
            windowDurationMins: 300,
          },
        ],
      }),
    );
    expect(getLatestMirroredAssistant()?.metadata?.status).toBe("completed");
    expect(setThreadStatus).toHaveBeenCalledWith("thread-rate-limit", "idle");
  });

  it("fails the run when a success result carries is_error", async () => {
    queryMessages = [
      createSuccessResult({
        is_error: true,
        result: "Invalid API key · Please run /login",
      }),
    ];

    await runClaudeThreadChat(
      {
        message: createUserMessage("Hi"),
        threadId: "thread-api-error",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );
    await flushClaudeRun();

    const assistant = getLatestMirroredAssistant();
    expect(assistant?.metadata).toEqual(
      expect.objectContaining({
        errorMessage: "Invalid API key · Please run /login",
        status: "error",
      }),
    );
    expect(JSON.stringify(assistant?.parts)).not.toContain("Invalid API key");
  });

  it("accumulates Task tool results by task id onto the tool parts", async () => {
    queryMessages = [
      {
        message: {
          content: [
            {
              id: "tool-create",
              input: {
                activeForm: "Running tests",
                description: "Run the unit tests",
                subject: "Run tests",
              },
              name: "TaskCreate",
              type: "tool_use",
            },
          ],
          model: "claude-opus-5-5",
        },
        parent_tool_use_id: null,
        session_id: "session-1",
        type: "assistant",
        uuid: "assistant-1",
      },
      {
        message: {
          content: [
            {
              content: "Task #1 created successfully: Run tests",
              tool_use_id: "tool-create",
              type: "tool_result",
            },
          ],
          role: "user",
        },
        parent_tool_use_id: null,
        session_id: "session-1",
        tool_use_result: { task: { id: "1", subject: "Run tests" } },
        type: "user",
      },
      {
        message: {
          content: [
            {
              id: "tool-update",
              input: { status: "in_progress", taskId: "1" },
              name: "TaskUpdate",
              type: "tool_use",
            },
          ],
          model: "claude-opus-5-5",
        },
        parent_tool_use_id: null,
        session_id: "session-1",
        type: "assistant",
        uuid: "assistant-2",
      },
      {
        message: {
          content: [
            {
              content: "Updated task #1 status",
              tool_use_id: "tool-update",
              type: "tool_result",
            },
          ],
          role: "user",
        },
        parent_tool_use_id: null,
        session_id: "session-1",
        tool_use_result: {
          statusChange: { from: "pending", to: "in_progress" },
          success: true,
          taskId: "1",
          updatedFields: ["status"],
        },
        type: "user",
      },
      createSuccessResult(),
    ];

    await runClaudeThreadChat(
      {
        message: createUserMessage("Run the tests"),
        threadId: "thread-tasks",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );
    await flushClaudeRun();

    const parts = getLatestMirroredAssistant()?.parts ?? [];
    const createPart = parts.find((part) => part.toolCallId === "tool-create");
    const updatePart = parts.find((part) => part.toolCallId === "tool-update");
    const runTests = {
      activeForm: "Running tests",
      description: "Run the unit tests",
      id: "1",
    };

    expect(createPart).toEqual(
      expect.objectContaining({
        output: {
          claudeSessionId: capturedClaudeQueryInput?.options?.sessionId,
          task: { id: "1", subject: "Run tests" },
          tasks: [{ ...runTests, status: "pending", subject: "Run tests" }],
        },
        state: "output-available",
        toolName: "claude_taskcreate",
      }),
    );
    expect(updatePart).toEqual(
      expect.objectContaining({
        output: expect.objectContaining({
          success: true,
          tasks: [{ ...runTests, status: "in_progress", subject: "Run tests" }],
        }),
        toolName: "claude_taskupdate",
      }),
    );
  });

  it("continues the thread's task list when resuming the Claude session", async () => {
    loadThreadMessages.mockResolvedValueOnce([
      {
        createdAt: new Date(1),
        id: "db-assistant-1",
        messageId: "assistant-1",
        metadata: {},
        parts: [
          {
            input: { subject: "Write docs" },
            output: {
              claudeSessionId: "session-1",
              task: { id: "7", subject: "Write docs" },
              tasks: [{ id: "7", status: "pending", subject: "Write docs" }],
            },
            state: "output-available",
            toolCallId: "tool-old",
            toolName: "claude_taskcreate",
            type: "dynamic-tool",
          },
        ],
        role: "assistant",
        updatedAt: new Date(1),
      },
    ]);
    queryMessages = [
      {
        message: {
          content: [
            {
              id: "tool-update",
              input: { status: "completed", taskId: "7" },
              name: "TaskUpdate",
              type: "tool_use",
            },
          ],
        },
        parent_tool_use_id: null,
        session_id: "session-1",
        type: "assistant",
        uuid: "assistant-2",
      },
      {
        message: {
          content: [
            { content: "ok", tool_use_id: "tool-update", type: "tool_result" },
          ],
          role: "user",
        },
        parent_tool_use_id: null,
        session_id: "session-1",
        tool_use_result: {
          success: true,
          taskId: "7",
          updatedFields: ["status"],
        },
        type: "user",
      },
      createSuccessResult(),
    ];

    await runClaudeThreadChat(
      {
        message: createUserMessage("Finish the docs"),
        threadId: "thread-resume-tasks",
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
    await flushClaudeRun();

    expect(capturedClaudeQueryInput?.options?.resume).toBe("session-1");
    const updatePart = (getLatestMirroredAssistant()?.parts ?? []).find(
      (part) => part.toolCallId === "tool-update",
    );
    expect((updatePart?.output as { tasks?: unknown })?.tasks).toEqual([
      { id: "7", status: "completed", subject: "Write docs" },
    ]);
  });

  it("does not continue a task list stored by an earlier Claude session", async () => {
    // Session 1 built tasks 1 and 2; a thread mode change then started
    // session 2, which numbers its own tasks from 1 again.
    loadThreadMessages.mockResolvedValueOnce([
      {
        createdAt: new Date(1),
        id: "db-assistant-1",
        messageId: "assistant-1",
        metadata: {},
        parts: [
          {
            input: { subject: "Old 2" },
            output: {
              claudeSessionId: "session-1",
              task: { id: "2", subject: "Old 2" },
              tasks: [
                { id: "1", status: "pending", subject: "Old 1" },
                { id: "2", status: "pending", subject: "Old 2" },
              ],
            },
            state: "output-available",
            toolCallId: "tool-old",
            toolName: "claude_taskcreate",
            type: "dynamic-tool",
          },
        ],
        role: "assistant",
        updatedAt: new Date(1),
      },
    ]);
    queryMessages = [
      {
        message: {
          content: [
            {
              id: "tool-create",
              input: { subject: "New 1" },
              name: "TaskCreate",
              type: "tool_use",
            },
          ],
        },
        parent_tool_use_id: null,
        session_id: "session-2",
        type: "assistant",
        uuid: "assistant-2",
      },
      {
        message: {
          content: [
            {
              content: "Task #1 created successfully: New 1",
              tool_use_id: "tool-create",
              type: "tool_result",
            },
          ],
          role: "user",
        },
        parent_tool_use_id: null,
        session_id: "session-2",
        tool_use_result: { task: { id: "1", subject: "New 1" } },
        type: "user",
      },
      createSuccessResult(),
    ];

    await runClaudeThreadChat(
      {
        message: createUserMessage("Keep going"),
        threadId: "thread-new-session-tasks",
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
            sessionId: "session-2",
          },
        },
        mode: "chat",
        status: "idle",
      } as any,
    );
    await flushClaudeRun();

    expect(capturedClaudeQueryInput?.options?.resume).toBe("session-2");
    const createPart = (getLatestMirroredAssistant()?.parts ?? []).find(
      (part) => part.toolCallId === "tool-create",
    );
    expect(createPart?.output).toEqual(
      expect.objectContaining({
        claudeSessionId: "session-2",
        tasks: [{ id: "1", status: "pending", subject: "New 1" }],
      }),
    );
  });
});

describe("runClaudeThreadChat instances and unattended runs", () => {
  beforeEach(() => {
    capturedClaudeQueryInput = null;
    queryMessages = [];
    ensureThread.mockClear();
    resolveClaudeCodeRuntime.mockClear();
    setThreadStatus.mockClear();
    updateClaudeThreadState.mockClear();
    if (!(globalThis as any).__sentinelActiveClaudeRunControls) {
      (globalThis as any).__sentinelActiveClaudeRunControls = new Map();
    }
    (globalThis as any).__sentinelActiveClaudeRunControls.clear();
  });

  afterEach(() => {
    (globalThis as any).__sentinelActiveClaudeRunControls?.clear();
  });

  it("binds a new thread to its instance and runs that instance's Claude Code", async () => {
    const instance = makeFakeInstance({
      continuationKey: "claude:home:/tmp/claude-work",
      driver: "claude",
      id: "claude-work",
    });

    const response = await runClaudeThreadChat(
      {
        message: createUserMessage("Hello"),
        threadId: "thread-instance",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      null,
      instance,
    );
    await flushClaudeRun();

    expect(response.status).toBe(202);
    expect(ensureThread.mock.calls[0]?.at(-1)).toBe("claude-work");
    expect(resolveClaudeCodeRuntime).toHaveBeenCalledWith({ instance });
    expect(updateClaudeThreadState).toHaveBeenCalledWith(
      "thread-instance",
      expect.objectContaining({ sessionId: expect.any(String) }),
      instance,
    );
  });

  it("declines permission requests at once when nobody can answer", async () => {
    await runClaudeThreadChat(
      {
        interactive: false,
        message: createUserMessage("Run the nightly check"),
        threadId: "thread-unattended",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      null,
    );

    const canUseTool = capturedClaudeQueryInput?.options
      ?.canUseTool as CanUseToolMock;
    for (const toolName of ["Bash", "AskUserQuestion"]) {
      await expect(
        canUseTool(
          toolName,
          { command: "rm -rf build" },
          {
            signal: new AbortController().signal,
            toolUseID: `approval-${toolName}`,
          },
        ),
      ).resolves.toEqual({
        behavior: "deny",
        message: UNATTENDED_DECLINE_MESSAGE,
      });
    }
    expect(setThreadStatus).not.toHaveBeenCalledWith(
      "thread-unattended",
      "awaiting_approval",
    );
  });
});
