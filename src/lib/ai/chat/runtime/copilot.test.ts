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
  createSession: mock(async (_config: unknown) => mockSession),
  getSupportedReasoningEfforts: mock(
    async (_modelId: string): Promise<string[] | null> => null,
  ),
  resumeSession: mock(async () => ({
    ...mockSession,
    sessionId: "session-existing",
  })),
};
let toolPermissionMode: "default" | "full" = "default";

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
  loadThread: mock(async () => null),
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

mock.module("@/lib/streams", () => ({
  safelyCloseReadableStreamController: mock(() => true),
  safelyEnqueueReadableStreamController: mock(() => true),
  streamContext: {
    createNewResumableStream: mock(async () => {}),
  },
}));

const workspaceRuntimeMock = () => ({
  getToolApprovalPolicies: mock(async () => ({})),
  getToolPermissionMode: mock(async () => toolPermissionMode),
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
    copilotManager.getSupportedReasoningEfforts.mockClear();
    copilotManager.getSupportedReasoningEfforts.mockImplementation(
      async () => null,
    );
    copilotManager.resumeSession.mockClear();
    toolPermissionMode = "default";
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

type CapturedSessionConfig = {
  clientName?: string;
  includeSubAgentStreamingEvents?: boolean;
  onEvent: (event: Record<string, unknown>) => void;
  onPermissionRequest: (
    request: Record<string, unknown>,
    invocation: { sessionId: string },
  ) => Promise<unknown>;
  reasoningEffort?: string;
  streaming?: boolean;
  workingDirectory?: string;
};

type CapturedControl = {
  eventQueue: Promise<void>;
  finished: boolean;
  pendingApprovals: Map<string, unknown>;
  state: {
    reasoningText: string;
    responseModelId: string | null;
    text: string;
    tools: Map<string, Record<string, unknown>>;
    usage: Record<string, number> | null;
  };
};

async function startCopilotRun(
  threadId: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await runCopilotThreadChat(
    {
      message: createUserMessage("Hi"),
      modelId: "gpt-5.4",
      threadId,
      trigger: "submit-user-message",
      userId: "user-1",
      workspaceId: "workspace-1",
      ...overrides,
    },
    { chatEngineState: null, mode: "chat", status: "idle" } as any,
  );
  const { activeRunId } = (await response.json()) as { activeRunId: string };
  const config = copilotManager.createSession.mock.calls.at(
    -1,
  )?.[0] as CapturedSessionConfig;
  const control = (globalThis as any).__sentinelActiveCopilotRunControls.get(
    activeRunId,
  ) as CapturedControl;

  return { config, control, runId: activeRunId };
}

async function answerCopilotApproval(input: {
  approvalId: string;
  approved: boolean;
  response?: string;
  runId: string;
  threadId: string;
}) {
  return await runCopilotThreadChat(
    {
      messages: [],
      threadId: input.threadId,
      toolApprovalResponse: {
        approved: input.approved,
        id: input.approvalId,
        ...(input.response ? { response: input.response } : {}),
      },
      trigger: "submit-tool-approval",
      userId: "user-1",
      workspaceId: "workspace-1",
    } as any,
    {
      activeStreamId: input.runId,
      chatEngineState: null,
      status: "awaiting_approval",
    } as any,
  );
}

async function drainCopilotEvents(control: CapturedControl) {
  let queue: Promise<void> | null = null;
  while (queue !== control.eventQueue) {
    queue = control.eventQueue;
    await queue;
  }
}

function emitCopilotEvents(
  config: CapturedSessionConfig,
  events: Array<Record<string, unknown>>,
) {
  events.forEach((event, index) => {
    config.onEvent({
      id: `event-${index}`,
      parentId: index === 0 ? null : `event-${index - 1}`,
      timestamp: "2026-10-07T00:00:00.000Z",
      ...event,
    });
  });
}

describe("Copilot SDK 1.x session wiring", () => {
  beforeEach(() => {
    sentPayloads = [];
    copilotManager.createSession.mockClear();
    copilotManager.getSupportedReasoningEfforts.mockClear();
    copilotManager.getSupportedReasoningEfforts.mockImplementation(
      async () => null,
    );
    setThreadStatus.mockClear();
    updateThreadChatSettings.mockClear();
    upsertMessage.mockClear();
    toolPermissionMode = "default";
    if (!(globalThis as any).__sentinelActiveCopilotRunControls) {
      (globalThis as any).__sentinelActiveCopilotRunControls = new Map();
    }
    (globalThis as any).__sentinelActiveCopilotRunControls.clear();
  });

  it("creates streaming sessions without sub-agent deltas", async () => {
    const { config } = await startCopilotRun("thread-config");

    expect(config).toMatchObject({
      clientName: "sentinel",
      includeSubAgentStreamingEvents: false,
      streaming: true,
      workingDirectory: "/tmp/workspace",
    });
    expect(config.reasoningEffort).toBeUndefined();
    expect(copilotManager.getSupportedReasoningEfforts).not.toHaveBeenCalled();
  });

  it("sends xhigh when the model lists it and falls back to high otherwise", async () => {
    copilotManager.getSupportedReasoningEfforts.mockImplementation(async () => [
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    const { config: xhighConfig } = await startCopilotRun("thread-xhigh", {
      reasoningEffort: "xhigh",
    });

    expect(copilotManager.getSupportedReasoningEfforts).toHaveBeenCalledWith(
      "gpt-5.4",
    );
    expect(xhighConfig.reasoningEffort).toBe("xhigh");
    expect(updateThreadChatSettings).toHaveBeenLastCalledWith("thread-xhigh", {
      engine: "copilot",
      mode: "chat",
      modelId: "gpt-5.4",
      reasoningEffort: "xhigh",
    });

    copilotManager.getSupportedReasoningEfforts.mockImplementation(async () => [
      "low",
      "medium",
      "high",
    ]);
    const { config: highConfig } = await startCopilotRun("thread-high", {
      reasoningEffort: "xhigh",
    });
    expect(highConfig.reasoningEffort).toBe("high");

    const { config: minimalConfig } = await startCopilotRun("thread-minimal", {
      reasoningEffort: "minimal",
    });
    expect(minimalConfig.reasoningEffort).toBe("low");
  });

  it("surfaces MCP, custom-tool and hook permissions as approvals with SDK 1.x decisions", async () => {
    const threadId = "thread-permissions";
    const { config, control, runId } = await startCopilotRun(threadId);
    const invocation = { sessionId: "session-1" };

    const mcpDecision = config.onPermissionRequest(
      {
        args: { title: "Bug" },
        kind: "mcp",
        readOnly: false,
        serverName: "github",
        toolCallId: "call-mcp",
        toolName: "create_issue",
        toolTitle: "Create issue",
      },
      invocation,
    );
    const [mcpApprovalId] = [...control.pendingApprovals.keys()];
    expect(control.state.tools.get("call-mcp")).toMatchObject({
      approval: {
        id: mcpApprovalId,
        reason: "Call Create issue on the github MCP server",
      },
      name: "copilot_mcp",
      state: "approval-requested",
    });
    expect(setThreadStatus).toHaveBeenCalledWith(threadId, "awaiting_approval");

    await answerCopilotApproval({
      approvalId: mcpApprovalId!,
      approved: true,
      runId,
      threadId,
    });
    expect(await mcpDecision).toEqual({
      approvedInteractively: true,
      kind: "approve-once",
    });
    expect(control.state.tools.get("call-mcp")?.state).toBe("input-available");

    const customToolDecision = config.onPermissionRequest(
      {
        kind: "custom-tool",
        toolCallId: "call-custom",
        toolDescription: "Deploys the app",
        toolName: "deploy",
      },
      invocation,
    );
    const [customApprovalId] = [...control.pendingApprovals.keys()];
    expect(control.state.tools.get("call-custom")?.name).toBe(
      "copilot_custom_tool",
    );
    await answerCopilotApproval({
      approvalId: customApprovalId!,
      approved: false,
      response: "Not now",
      runId,
      threadId,
    });
    expect(await customToolDecision).toEqual({
      feedback: "Not now",
      kind: "reject",
    });
    expect(control.state.tools.get("call-custom")?.state).toBe("output-denied");

    // A request still pending when the run ends is answered for the user.
    const hookDecision = config.onPermissionRequest(
      { hookMessage: "Run lint hook", kind: "hook", toolName: "lint" },
      invocation,
    );
    expect(control.pendingApprovals.size).toBe(1);
    emitCopilotEvents(config, [{ data: {}, type: "session.idle" }]);
    await drainCopilotEvents(control);

    expect(await hookDecision).toEqual({ kind: "user-not-available" });
    expect(control.finished).toBe(true);
  });

  it("approves without asking in full access unless managed policy requires a decision", async () => {
    toolPermissionMode = "full";
    const { config, control } = await startCopilotRun("thread-full-access");
    const invocation = { sessionId: "session-1" };

    expect(
      await config.onPermissionRequest(
        {
          kind: "mcp",
          readOnly: true,
          serverName: "github",
          toolName: "get_issue",
          toolTitle: "Get issue",
        },
        invocation,
      ),
    ).toEqual({ kind: "approve-once" });
    expect(control.pendingApprovals.size).toBe(0);

    void config.onPermissionRequest(
      {
        canOfferSessionApproval: false,
        commands: [],
        fullCommandText: "rm -rf build",
        hasWriteFileRedirection: false,
        intention: "Clean the build",
        kind: "shell",
        managedApprovalRequired: true,
        possiblePaths: [],
        possibleUrls: [],
        toolCallId: "call-shell",
      },
      invocation,
    );
    expect(control.pendingApprovals.size).toBe(1);
    expect(control.state.tools.get("call-shell")).toMatchObject({
      name: "copilot_shell",
      state: "approval-requested",
    });
  });

  it("keeps sub-agent output out of the main message and the run outcome", async () => {
    const { config, control } = await startCopilotRun("thread-events");

    emitCopilotEvents(config, [
      {
        data: { deltaContent: "Hel", messageId: "m1" },
        type: "assistant.message_delta",
      },
      {
        agentId: "sub-1",
        data: { deltaContent: "SUB", messageId: "s1" },
        type: "assistant.message_delta",
      },
      {
        data: { deltaContent: "lo", messageId: "m1" },
        type: "assistant.message_delta",
      },
      {
        data: {
          arguments: { path: "a.ts" },
          toolCallId: "tool-view",
          toolName: "view",
        },
        type: "tool.execution_start",
      },
      {
        agentId: "sub-1",
        data: {
          arguments: { pattern: "todo" },
          parentToolCallId: "tool-task",
          toolCallId: "tool-grep",
          toolName: "grep",
        },
        type: "tool.execution_start",
      },
      {
        data: {
          result: { content: "file contents" },
          success: true,
          toolCallId: "tool-view",
        },
        type: "tool.execution_complete",
      },
      {
        data: {
          content: "sub-agent answer",
          messageId: "s1",
          parentToolCallId: "tool-task",
        },
        type: "assistant.message",
      },
      {
        agentId: "sub-1",
        data: { errorType: "model", message: "sub-agent failed" },
        type: "session.error",
      },
      {
        agentId: "sub-1",
        data: { inputTokens: 99, model: "sub-model", outputTokens: 99 },
        type: "assistant.usage",
      },
      {
        data: { inputTokens: 10, model: "gpt-5.4-mini", outputTokens: 5 },
        type: "assistant.usage",
      },
    ]);
    await drainCopilotEvents(control);

    expect(control.finished).toBe(false);
    expect(control.state.text).toBe("Hello");
    expect(control.state.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
    expect(control.state.responseModelId).toBe("gpt-5.4-mini");
    expect([...control.state.tools.keys()]).toEqual(["tool-view", "tool-grep"]);
    expect(control.state.tools.get("tool-view")).toMatchObject({
      name: "copilot_view",
      output: { content: "file contents" },
      state: "output-available",
    });

    emitCopilotEvents(config, [
      {
        data: {
          content: "Hello",
          messageId: "m1",
          reasoningText: "Looked at a.ts",
        },
        type: "assistant.message",
      },
      { data: {}, type: "session.idle" },
    ]);
    await drainCopilotEvents(control);

    expect(control.finished).toBe(true);
    expect(control.state.reasoningText).toBe("Looked at a.ts");
    const persistedMessages = (upsertMessage.mock.calls as unknown[][]).map(
      (call) =>
        call[1] as {
          metadata: { finishReason?: string; status: string };
          parts: Array<{ text?: string }>;
        },
    );
    const persistedTexts: string[] = persistedMessages.flatMap((message) =>
      message.parts.map((part) => part.text ?? ""),
    );
    expect(persistedTexts.some((text) => text.includes("SUB"))).toBe(false);
    expect(
      persistedTexts.some((text) => text.includes("sub-agent answer")),
    ).toBe(false);
    const lastMessage = persistedMessages.at(-1)!;
    expect(lastMessage.metadata).toMatchObject({
      finishReason: "stop",
      status: "completed",
    });
  });

  it("keeps every chunk of a response the runtime split at reasoning boundaries", async () => {
    const { config, control } = await startCopilotRun("thread-chunks");

    emitCopilotEvents(config, [
      {
        data: { deltaContent: "First ", messageId: "chunk-0" },
        type: "assistant.message_delta",
      },
      {
        data: { deltaContent: "part.", messageId: "chunk-0" },
        type: "assistant.message_delta",
      },
      {
        data: {
          apiCallId: "call-1",
          chunkCount: 2,
          chunkIndex: 0,
          content: "First part.",
          messageId: "chunk-0",
          reasoningText: "Reasoning A",
        },
        type: "assistant.message",
      },
      {
        data: { deltaContent: "Second part.", messageId: "chunk-1" },
        type: "assistant.message_delta",
      },
    ]);
    await drainCopilotEvents(control);

    // The streamed text already shows the chunks as separate paragraphs.
    expect(control.state.text).toBe("First part.\n\nSecond part.");

    emitCopilotEvents(config, [
      {
        data: {
          apiCallId: "call-1",
          chunkCount: 2,
          chunkIndex: 1,
          content: "Second part.",
          messageId: "chunk-1",
          reasoningText: "Reasoning B",
        },
        type: "assistant.message",
      },
      { data: {}, type: "session.idle" },
    ]);
    await drainCopilotEvents(control);

    expect(control.finished).toBe(true);
    expect(control.state.text).toBe("First part.\n\nSecond part.");
    expect(control.state.reasoningText).toBe("Reasoning A\n\nReasoning B");
    const lastMessage = (upsertMessage.mock.calls as unknown[][]).at(
      -1,
    )?.[1] as {
      metadata: { status: string };
      parts: Array<{ text?: string; type: string }>;
    };
    expect(lastMessage.metadata.status).toBe("completed");
    expect(lastMessage.parts).toEqual([
      { text: "Reasoning A\n\nReasoning B", type: "reasoning" },
      { text: "First part.\n\nSecond part.", type: "text" },
    ]);
  });

  it("still lets the message of a later model call replace the main text", async () => {
    const { config, control } = await startCopilotRun("thread-model-calls");

    emitCopilotEvents(config, [
      {
        data: { deltaContent: "Let me look.", messageId: "message-1" },
        type: "assistant.message_delta",
      },
      {
        data: {
          apiCallId: "call-1",
          content: "Let me look.",
          messageId: "message-1",
          reasoningText: "Plan the lookup",
        },
        type: "assistant.message",
      },
      {
        data: { deltaContent: "Found it.", messageId: "message-2" },
        type: "assistant.message_delta",
      },
    ]);
    await drainCopilotEvents(control);

    expect(control.state.text).toBe("Let me look.\n\nFound it.");

    // chunkIndex 0 starts a new model call even when it is split.
    emitCopilotEvents(config, [
      {
        data: {
          apiCallId: "call-2",
          chunkCount: 2,
          chunkIndex: 0,
          content: "Found it.",
          messageId: "message-2",
        },
        type: "assistant.message",
      },
    ]);
    await drainCopilotEvents(control);

    expect(control.state.text).toBe("Found it.");
    expect(control.state.reasoningText).toBe("Plan the lookup");
  });
});
