import { beforeEach, describe, expect, it, mock } from "bun:test";

const ensureThread = mock(async () => ({ created: true }));
const clearActiveStream = mock(() => {});
const loadThread = mock(async () => null);
const loadThreadMessages = mock(async () => []);
const setActiveMessage = mock(async () => {});
const setActiveStream = mock(() => {});
const setThreadStatus = mock(() => {});
const updateCodexThreadState = mock(() => {});
const updateCopilotThreadState = mock(() => {});
const updateCursorThreadState = mock(() => {});
const updateMessageMetadata = mock(async () => {});
const updateOpenCodeThreadState = mock(() => {});
const updateThreadChatSettings = mock(async () => {});
const updateThreadRepoState = mock(() => {});
const updateThreadTitle = mock(() => {});
const upsertMessage = mock((_threadId: string, message: unknown) => message);
const loadThreadSessionSnapshot = mock(async (threadId: string) => ({
  activeRunId: "run-1",
  chatEngine: "opencode" as const,
  messages: [],
  queuedFollowUps: [],
  threadId,
  threadTitle: "OpenCode thread",
  threadStatus: "streaming" as const,
}));
const serializeThreadStreamEvent = mock(
  (event: unknown) => `event: test\ndata: ${JSON.stringify(event)}\n\n`,
);
const createNewResumableStream = mock(async () => {});
const resumeExistingStream = mock(
  async () =>
    new ReadableStream<string>({
      start(controller) {
        controller.close();
      },
    }),
);
const getToolPermissionMode = mock(async () => "default");
const getToolApprovalPolicies = mock(async () => ({}));
const getWorkspaceRootPath = mock(async () => "/tmp/workspace");
const beginThreadRepoCheckpointRun = mock(async () => true);
const clearThreadRepoCheckpointRun = mock(async () => {});
const finalizeThreadRepoCheckpointRun = mock(async () => "checkpoint-1");
type MockOpenCodeSessionOverrides = {
  permissionReply?: (...args: any[]) => Promise<unknown>;
  promptAsync?: (...args: any[]) => Promise<unknown>;
  questionReject?: (...args: any[]) => Promise<unknown>;
  questionReply?: (...args: any[]) => Promise<unknown>;
  serverExited?: Promise<{ code: number | null; signal: string | null }>;
  stream?: AsyncIterable<unknown>;
};

// A stream that stays open, like a live server that has not emitted anything
// yet. (An ended stream now means the server went away.)
function createPendingStream(): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise<IteratorResult<unknown>>(() => {}),
      };
    },
  };
}

function createMockOpenCodeSession(
  overrides: MockOpenCodeSessionOverrides = {},
) {
  return {
    client: {
      event: {
        subscribe: mock(async () => ({
          stream: overrides.stream ?? createPendingStream(),
        })),
      },
      permission: {
        reply: mock(overrides.permissionReply ?? (async () => {})),
      },
      question: {
        reject: mock(overrides.questionReject ?? (async () => {})),
        reply: mock(overrides.questionReply ?? (async () => {})),
      },
      session: {
        abort: mock(async () => {}),
        promptAsync: mock(overrides.promptAsync ?? (async () => {})),
      },
    },
    server: {
      close: mock(() => {}),
      exited: overrides.serverExited ?? new Promise(() => {}),
    },
    sessionId: "opencode-session-1",
  };
}

const startOpenCodeSession = mock(async () => createMockOpenCodeSession());

mock.module("server-only", () => ({}));

mock.module("@/lib/ai/chat/engines/opencode-sdk", () => ({
  buildOpenCodeThreadState: mock((state: unknown) => state),
  openCodeQuestionId: mock((id: string) => id),
  parseOpenCodeModelSlug: mock(() => "openai/gpt-5.2"),
  startOpenCodeSession,
  toOpenCodePermissionReply: mock(() => "allow"),
  toOpenCodeQuestionAnswers: mock(() => []),
}));

const persistenceModuleMock = () => ({
  clearActiveStream,
  ensureThread,
  loadThread,
  loadThreadMessages,
  setActiveMessage,
  setActiveStream,
  setThreadStatus,
  updateCodexThreadState,
  updateCopilotThreadState,
  updateCursorThreadState,
  updateMessageMetadata,
  updateOpenCodeThreadState,
  updateThreadChatSettings,
  updateThreadRepoState,
  updateThreadTitle,
  upsertMessage,
});

mock.module("../persistence", persistenceModuleMock);
mock.module("../persistence.ts", persistenceModuleMock);
mock.module("@/lib/ai/chat/persistence", persistenceModuleMock);

mock.module("../repo/checkpoints", () => ({
  beginThreadRepoCheckpointRun,
  clearThreadRepoCheckpointRun,
  finalizeThreadRepoCheckpointRun,
  getThreadCheckpointAnchorMessageId: mock(() => null),
}));

const sessionServerModuleMock = () => ({
  loadThreadSessionSnapshot,
  serializeThreadStreamEvent,
});

mock.module("../session/server", sessionServerModuleMock);
mock.module("../session/server", sessionServerModuleMock);

mock.module("@/lib/streams", () => ({
  safelyCloseReadableStreamController: mock(() => true),
  safelyEnqueueReadableStreamController: mock(() => true),
  streamContext: {
    createNewResumableStream,
    resumeExistingStream,
  },
}));

mock.module("./workspace", () => ({
  getToolApprovalPolicies,
  getToolPermissionMode,
  getWorkspaceRootPath,
}));

const { runOpenCodeThreadChat } = await import("./opencode");
const { resolveOpenCodeSessionError } =
  await import("./opencode/event-helpers");

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

function createEventQueue() {
  const pending: unknown[] = [];
  const waiters: Array<(value: IteratorResult<unknown>) => void> = [];
  let closed = false;

  return {
    close() {
      closed = true;
      while (waiters.length > 0) {
        waiters.shift()?.({ done: true, value: undefined });
      }
    },
    push(event: unknown) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter({ done: false, value: event });
        return;
      }
      pending.push(event);
    },
    stream: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            const event = pending.shift();
            if (event) {
              return Promise.resolve({ done: false, value: event });
            }
            if (closed) {
              return Promise.resolve({ done: true, value: undefined });
            }
            return new Promise<IteratorResult<unknown>>((resolve) => {
              waiters.push(resolve);
            });
          },
        };
      },
    },
  };
}

const SESSION_ID = "opencode-session-1";

function buildRunRequest(threadId: string, text: string) {
  return {
    message: {
      id: `${threadId}-user`,
      metadata: {},
      parts: [{ text, type: "text" }],
      role: "user",
    },
    modelId: "openai/gpt-5.2",
    threadId,
    trigger: "submit-user-message",
    userId: "user-1",
    workspaceId: "workspace-1",
  } as any;
}

async function flushEvents() {
  for (let tick = 0; tick < 3; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function findLastAssistantUpsert(status: string) {
  return upsertMessage.mock.calls
    .map((call: unknown[]) => call[1] as any)
    .findLast(
      (message: any) =>
        message?.role === "assistant" && message?.metadata?.status === status,
    );
}

describe("runOpenCodeThreadChat", () => {
  beforeEach(() => {
    ensureThread.mockClear();
    clearActiveStream.mockClear();
    loadThread.mockClear();
    loadThreadMessages.mockClear();
    setActiveMessage.mockClear();
    setActiveStream.mockClear();
    setThreadStatus.mockClear();
    updateCodexThreadState.mockClear();
    updateCopilotThreadState.mockClear();
    updateCursorThreadState.mockClear();
    updateMessageMetadata.mockClear();
    updateOpenCodeThreadState.mockClear();
    updateThreadChatSettings.mockClear();
    updateThreadRepoState.mockClear();
    updateThreadTitle.mockClear();
    upsertMessage.mockClear();
    loadThreadSessionSnapshot.mockClear();
    serializeThreadStreamEvent.mockClear();
    createNewResumableStream.mockClear();
    resumeExistingStream.mockClear();
    getToolPermissionMode.mockClear();
    getToolApprovalPolicies.mockClear();
    getWorkspaceRootPath.mockClear();
    beginThreadRepoCheckpointRun.mockClear();
    clearThreadRepoCheckpointRun.mockClear();
    finalizeThreadRepoCheckpointRun.mockClear();
    startOpenCodeSession.mockClear();
    getToolPermissionMode.mockImplementation(async () => "default");
    getWorkspaceRootPath.mockImplementation(async () => "/tmp/workspace");
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession(),
    );
  });

  it("shows a visible startup label before the OpenCode session is ready", async () => {
    const sessionStart =
      createDeferred<ReturnType<typeof createMockOpenCodeSession>>();
    startOpenCodeSession.mockImplementation(() => sessionStart.promise);

    const responsePromise = runOpenCodeThreadChat(
      {
        message: {
          id: "user-1",
          metadata: {},
          parts: [{ text: "Inspect the repo", type: "text" }],
          role: "user",
        },
        modelId: "openai/gpt-5.2",
        threadId: "thread-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as any,
      null,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(upsertMessage.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          status: "pending",
          statusLabel: "Starting OpenCode session...",
        }),
        role: "assistant",
      }),
    );

    sessionStart.resolve(createMockOpenCodeSession());

    const response = await responsePromise;
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("persists compactable assistant failure metadata for OpenCode prompt errors", async () => {
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession({
        promptAsync: async () => {
          throw new Error("OpenCode provider failed\nstack: noisy details");
        },
      }),
    );

    const response = await runOpenCodeThreadChat(
      {
        message: {
          id: "user-error-1",
          metadata: {},
          parts: [{ text: "Inspect the repo", type: "text" }],
          role: "user",
        },
        modelId: "openai/gpt-5.2",
        threadId: "thread-error-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as any,
      null,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const errorMessage = upsertMessage.mock.calls.find(
      (call: unknown[]) => (call[1] as any)?.metadata?.status === "error",
    )?.[1];

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(errorMessage).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          errorMessage: "OpenCode provider failed\nstack: noisy details",
          status: "error",
        }),
        role: "assistant",
      }),
    );
    expect(setThreadStatus).toHaveBeenLastCalledWith("thread-error-1", "idle");
  });

  it("returns the event stream before the OpenCode prompt finishes", async () => {
    const prompt = createDeferred<void>();
    const promptAsync = mock(() => prompt.promise);
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession({
        promptAsync,
      }),
    );

    const response = await runOpenCodeThreadChat(
      {
        message: {
          id: "user-stream-1",
          metadata: {},
          parts: [{ text: "Stream this response", type: "text" }],
          role: "user",
        },
        modelId: "openai/gpt-5.2",
        threadId: "thread-stream-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as any,
      null,
    );

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(promptAsync).toHaveBeenCalledTimes(1);
    expect(setThreadStatus).toHaveBeenLastCalledWith(
      "thread-stream-1",
      "streaming",
    );

    prompt.reject(new Error("OpenCode provider failed after stream returned"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setThreadStatus).toHaveBeenLastCalledWith("thread-stream-1", "idle");
    expect(clearActiveStream).toHaveBeenCalledWith("thread-stream-1");
  });

  it("anchors OpenCode runs to the resolved workspace and finalizes checkpoints on idle", async () => {
    const events = createEventQueue();
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession({
        stream: events.stream,
      }),
    );

    const response = await runOpenCodeThreadChat(
      {
        message: {
          id: "user-checkpoint-1",
          metadata: {},
          parts: [{ text: "Implement the change", type: "text" }],
          role: "user",
        },
        modelId: "openai/gpt-5.2",
        threadId: "thread-checkpoint-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as any,
      null,
    );

    events.push({
      properties: { sessionID: "opencode-session-1" },
      type: "session.idle",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(beginThreadRepoCheckpointRun).toHaveBeenCalledWith({
      projectPath: "/tmp/workspace",
      runId: expect.any(String),
      thread: null,
    });
    expect(finalizeThreadRepoCheckpointRun).toHaveBeenCalledWith({
      assistantMessageId: expect.any(String),
      runId: expect.any(String),
      threadId: "thread-checkpoint-1",
    });
    expect(clearThreadRepoCheckpointRun).not.toHaveBeenCalled();
    expect(startOpenCodeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/tmp/workspace",
        fullAccess: false,
      }),
    );
    expect(updateOpenCodeThreadState).toHaveBeenCalledWith(
      "thread-checkpoint-1",
      expect.objectContaining({ cwd: "/tmp/workspace" }),
    );

    events.close();
  });

  it("maps full permission mode to OpenCode fullAccess and auto-approval", async () => {
    const events = createEventQueue();
    const permissionReply = mock(async () => {});
    getToolPermissionMode.mockImplementation(async () => "full");
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession({
        stream: events.stream,
        permissionReply,
      }),
    );

    await runOpenCodeThreadChat(
      {
        message: {
          id: "user-permission-1",
          metadata: {},
          parts: [{ text: "Run tests", type: "text" }],
          role: "user",
        },
        modelId: "openai/gpt-5.2",
        threadId: "thread-permission-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as any,
      null,
    );

    events.push({
      properties: {
        always: [],
        id: "permission-1",
        metadata: { command: "bun test" },
        patterns: ["bun test"],
        permission: "shell",
        sessionID: "opencode-session-1",
      },
      type: "permission.asked",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startOpenCodeSession).toHaveBeenCalledWith(
      expect.objectContaining({ fullAccess: true }),
    );
    expect(permissionReply).toHaveBeenCalledWith({
      reply: "allow",
      requestID: "permission-1",
    });
    expect(setThreadStatus).not.toHaveBeenCalledWith(
      "thread-permission-1",
      "awaiting_approval",
    );
  });

  it("persists streaming text deltas before full part updates arrive", async () => {
    const events = createEventQueue();
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession({
        stream: events.stream,
      }),
    );

    await runOpenCodeThreadChat(
      {
        message: {
          id: "user-delta-1",
          metadata: {},
          parts: [{ text: "Stream a poem", type: "text" }],
          role: "user",
        },
        modelId: "openai/gpt-5.2",
        threadId: "thread-delta-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as any,
      null,
    );

    events.push({
      properties: {
        info: {
          id: "opencode-assistant-message-1",
          role: "assistant",
        },
        sessionID: "opencode-session-1",
      },
      type: "message.updated",
    });
    events.push({
      properties: {
        delta: "Line one",
        field: "text",
        messageID: "opencode-assistant-message-1",
        partID: "part-1",
        sessionID: "opencode-session-1",
      },
      type: "message.part.delta",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(upsertMessage.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          status: "streaming",
          statusLabel: null,
        }),
        parts: [{ text: "Line one", type: "text" }],
        role: "assistant",
      }),
    );
    expect(serializeThreadStreamEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          parts: [{ text: "Line one", type: "text" }],
          role: "assistant",
        }),
        type: "message.upsert",
      }),
    );
  });

  it("replays a recorded 1.18 event sequence into assistant text and tool parts", async () => {
    const events = createEventQueue();
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession({ stream: events.stream }),
    );

    await runOpenCodeThreadChat(
      buildRunRequest("thread-replay-1", "Run the tests"),
      null,
    );

    // Shapes from @opencode-ai/sdk 1.18.35 types.gen.d.ts: every event now
    // carries an `id`, and heartbeats/status events have no handler.
    for (const event of [
      { id: "evt-1", properties: {}, type: "server.connected" },
      {
        id: "evt-2",
        properties: {
          info: { id: "msg-user", role: "user", sessionID: SESSION_ID },
          sessionID: SESSION_ID,
        },
        type: "message.updated",
      },
      {
        id: "evt-3",
        properties: {
          part: {
            id: "part-user",
            messageID: "msg-user",
            sessionID: SESSION_ID,
            text: "Run the tests",
            type: "text",
          },
          sessionID: SESSION_ID,
          time: 1,
        },
        type: "message.part.updated",
      },
      {
        id: "evt-4",
        properties: {
          info: {
            id: "msg-assistant",
            role: "assistant",
            sessionID: SESSION_ID,
          },
          sessionID: SESSION_ID,
        },
        type: "message.updated",
      },
      {
        id: "evt-5",
        properties: {
          delta: "Running ",
          field: "text",
          messageID: "msg-assistant",
          partID: "part-text",
          sessionID: SESSION_ID,
        },
        type: "message.part.delta",
      },
      {
        id: "evt-6",
        properties: {
          delta: "the tests.",
          field: "text",
          messageID: "msg-assistant",
          partID: "part-text",
          sessionID: SESSION_ID,
        },
        type: "message.part.delta",
      },
      {
        id: "evt-7",
        properties: {
          part: {
            callID: "call-1",
            id: "part-tool",
            messageID: "msg-assistant",
            sessionID: SESSION_ID,
            state: {
              input: { command: "bun test" },
              status: "running",
              time: { start: 1 },
            },
            tool: "bash",
            type: "tool",
          },
          sessionID: SESSION_ID,
          time: 2,
        },
        type: "message.part.updated",
      },
      {
        id: "evt-8",
        properties: {
          part: {
            callID: "call-1",
            id: "part-tool",
            messageID: "msg-assistant",
            sessionID: SESSION_ID,
            state: {
              input: { command: "bun test" },
              metadata: {},
              output: "1 pass",
              status: "completed",
              time: { end: 3, start: 1 },
              title: "bun test",
            },
            tool: "bash",
            type: "tool",
          },
          sessionID: SESSION_ID,
          time: 3,
        },
        type: "message.part.updated",
      },
      { id: "evt-9", properties: {}, type: "server.heartbeat" },
      {
        id: "evt-10",
        properties: { sessionID: SESSION_ID, status: { type: "idle" } },
        type: "session.status",
      },
      {
        id: "evt-11",
        properties: { sessionID: SESSION_ID },
        type: "session.idle",
      },
    ]) {
      events.push(event);
    }
    await flushEvents();

    const completed = findLastAssistantUpsert("completed");
    expect(completed?.parts).toEqual([
      {
        input: { command: "bun test" },
        output: "1 pass",
        state: "output-available",
        toolCallId: "call-1",
        toolName: "opencode_bash",
        type: "dynamic-tool",
      },
      { text: "Running the tests.", type: "text" },
    ]);
    expect(setThreadStatus).toHaveBeenLastCalledWith("thread-replay-1", "idle");
  });

  it("sends promptAsync with the sessionID, parts, agent and variant", async () => {
    const promptAsync = mock(async () => {});
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession({ promptAsync }),
    );

    await runOpenCodeThreadChat(
      {
        ...buildRunRequest("thread-prompt-1", "Plan the change"),
        openCode: { variant: "high" },
        threadMode: "plan",
      } as any,
      null,
    );

    expect(promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "plan",
        parts: [
          expect.objectContaining({
            text: expect.stringContaining("Plan the change"),
            type: "text",
          }),
        ],
        sessionID: SESSION_ID,
        variant: "high",
      }),
    );
  });

  it("surfaces the session.error data.message instead of a generic failure", async () => {
    const events = createEventQueue();
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession({ stream: events.stream }),
    );

    await runOpenCodeThreadChat(
      buildRunRequest("thread-session-error-1", "Inspect the repo"),
      null,
    );
    events.push({
      id: "evt-error",
      properties: {
        error: {
          data: { isRetryable: false, message: "Rate limit exceeded" },
          name: "APIError",
        },
        sessionID: SESSION_ID,
      },
      type: "session.error",
    });
    await flushEvents();

    expect(findLastAssistantUpsert("error")?.metadata).toEqual(
      expect.objectContaining({ errorMessage: "Rate limit exceeded" }),
    );
    expect(setThreadStatus).toHaveBeenLastCalledWith(
      "thread-session-error-1",
      "idle",
    );
  });

  it("treats a MessageAbortedError session.error as a cancellation", async () => {
    const events = createEventQueue();
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession({ stream: events.stream }),
    );

    await runOpenCodeThreadChat(
      buildRunRequest("thread-aborted-1", "Inspect the repo"),
      null,
    );
    events.push({
      id: "evt-aborted",
      properties: {
        error: { data: { message: "Aborted" }, name: "MessageAbortedError" },
        sessionID: SESSION_ID,
      },
      type: "session.error",
    });
    await flushEvents();

    expect(findLastAssistantUpsert("cancelled")).toBeDefined();
    expect(findLastAssistantUpsert("error")).toBeUndefined();
  });

  it("fails the run when the event stream ends before session.idle", async () => {
    const events = createEventQueue();
    const session = createMockOpenCodeSession({ stream: events.stream });
    startOpenCodeSession.mockImplementation(async () => session);

    await runOpenCodeThreadChat(
      buildRunRequest("thread-stream-end-1", "Inspect the repo"),
      null,
    );
    events.close();
    await flushEvents();

    expect(findLastAssistantUpsert("error")?.metadata).toEqual(
      expect.objectContaining({
        errorMessage: "OpenCode event stream ended unexpectedly.",
      }),
    );
    expect(session.server.close).toHaveBeenCalled();
    expect(setThreadStatus).toHaveBeenLastCalledWith(
      "thread-stream-end-1",
      "idle",
    );
  });

  it("fails the run when the OpenCode server exits mid-run", async () => {
    const serverExit = createDeferred<{
      code: number | null;
      signal: string | null;
    }>();
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession({ serverExited: serverExit.promise }),
    );

    await runOpenCodeThreadChat(
      buildRunRequest("thread-server-exit-1", "Inspect the repo"),
      null,
    );
    serverExit.resolve({ code: 1, signal: null });
    await flushEvents();

    expect(findLastAssistantUpsert("error")?.metadata).toEqual(
      expect.objectContaining({
        errorMessage: "OpenCode server exited unexpectedly (code 1).",
      }),
    );
  });

  it("rejects OpenCode questions through question.reject when tools are disabled", async () => {
    const events = createEventQueue();
    const questionReject = mock(async () => {});
    const questionReply = mock(async () => {});
    startOpenCodeSession.mockImplementation(async () =>
      createMockOpenCodeSession({
        questionReject,
        questionReply,
        stream: events.stream,
      }),
    );

    await runOpenCodeThreadChat(
      {
        ...buildRunRequest("thread-question-1", "Ask me something"),
        toolsEnabled: false,
      } as any,
      null,
    );
    events.push({
      id: "evt-question",
      properties: {
        id: "question-1",
        questions: [
          {
            header: "Target",
            options: [{ description: "Main app", label: "app" }],
            question: "Which package?",
          },
        ],
        sessionID: SESSION_ID,
      },
      type: "question.asked",
    });
    await flushEvents();

    expect(questionReject).toHaveBeenCalledWith({ requestID: "question-1" });
    expect(questionReply).not.toHaveBeenCalled();
  });
});

describe("resolveOpenCodeSessionError", () => {
  it("reads data.message from the SDK error union and flags aborts", () => {
    expect(
      resolveOpenCodeSessionError({
        error: {
          data: { message: "Invalid API key", providerID: "openai" },
          name: "ProviderAuthError",
        },
        sessionID: "ses_1",
      }),
    ).toEqual({ aborted: false, message: "Invalid API key" });
    expect(
      resolveOpenCodeSessionError({
        error: { data: {}, name: "MessageOutputLengthError" },
      }),
    ).toEqual({ aborted: false, message: "MessageOutputLengthError" });
    expect(
      resolveOpenCodeSessionError({
        error: { data: { message: "Aborted" }, name: "MessageAbortedError" },
      }),
    ).toEqual({ aborted: true, message: "Aborted" });
  });

  it("falls back to a generic message when there is no error payload", () => {
    expect(resolveOpenCodeSessionError({ sessionID: "ses_1" })).toEqual({
      aborted: false,
      message: "OpenCode run failed.",
    });
    expect(resolveOpenCodeSessionError(undefined)).toEqual({
      aborted: false,
      message: "OpenCode run failed.",
    });
  });
});
