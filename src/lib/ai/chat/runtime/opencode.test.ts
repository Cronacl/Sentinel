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
const startOpenCodeSession = mock(async () => ({
  client: {
    event: {
      subscribe: mock(async () => ({
        stream: (async function* () {})(),
      })),
    },
    permission: {
      reply: mock(async () => {}),
    },
    question: {
      reject: mock(async () => {}),
      reply: mock(async () => {}),
    },
    session: {
      abort: mock(async () => {}),
      promptAsync: mock(async () => {}),
    },
  },
  server: {
    close: mock(() => {}),
  },
  sessionId: "opencode-session-1",
}));

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
    startOpenCodeSession.mockImplementation(async () => ({
      client: {
        event: {
          subscribe: mock(async () => ({
            stream: (async function* () {})(),
          })),
        },
        permission: {
          reply: mock(async () => {}),
        },
        question: {
          reject: mock(async () => {}),
          reply: mock(async () => {}),
        },
        session: {
          abort: mock(async () => {}),
          promptAsync: mock(async () => {}),
        },
      },
      server: {
        close: mock(() => {}),
      },
      sessionId: "opencode-session-1",
    }));
  });

  it("shows a visible startup label before the OpenCode session is ready", async () => {
    const sessionStart = createDeferred<{
      client: {
        event: { subscribe: () => Promise<{ stream: AsyncIterable<unknown> }> };
        permission: { reply: () => Promise<void> };
        question: { reply: () => Promise<void> };
        session: {
          abort: () => Promise<void>;
          promptAsync: () => Promise<void>;
        };
      };
      server: {
        close: () => void;
      };
      sessionId: string;
    }>();
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

    sessionStart.resolve({
      client: {
        event: {
          subscribe: mock(async () => ({
            stream: (async function* () {})(),
          })),
        },
        permission: {
          reply: mock(async () => {}),
        },
        question: {
          reply: mock(async () => {}),
        },
        session: {
          abort: mock(async () => {}),
          promptAsync: mock(async () => {}),
        },
      },
      server: {
        close: mock(() => {}),
      },
      sessionId: "opencode-session-1",
    });

    const response = await responsePromise;
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("persists compactable assistant failure metadata for OpenCode prompt errors", async () => {
    startOpenCodeSession.mockImplementation(async () => ({
      client: {
        event: {
          subscribe: mock(async () => ({
            stream: (async function* () {})(),
          })),
        },
        permission: {
          reply: mock(async () => {}),
        },
        question: {
          reply: mock(async () => {}),
        },
        session: {
          abort: mock(async () => {}),
          promptAsync: mock(async () => {
            throw new Error("OpenCode provider failed\nstack: noisy details");
          }),
        },
      },
      server: {
        close: mock(() => {}),
      },
      sessionId: "opencode-session-1",
    }));

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
    startOpenCodeSession.mockImplementation(async () => ({
      client: {
        event: {
          subscribe: mock(async () => ({
            stream: (async function* () {})(),
          })),
        },
        permission: {
          reply: mock(async () => {}),
        },
        question: {
          reply: mock(async () => {}),
        },
        session: {
          abort: mock(async () => {}),
          promptAsync,
        },
      },
      server: {
        close: mock(() => {}),
      },
      sessionId: "opencode-session-1",
    }));

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
    startOpenCodeSession.mockImplementation(async () => ({
      client: {
        event: {
          subscribe: mock(async () => ({
            stream: events.stream,
          })),
        },
        permission: {
          reply: mock(async () => {}),
        },
        question: {
          reject: mock(async () => {}),
          reply: mock(async () => {}),
        },
        session: {
          abort: mock(async () => {}),
          promptAsync: mock(async () => {}),
        },
      },
      server: {
        close: mock(() => {}),
      },
      sessionId: "opencode-session-1",
    }));

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
    startOpenCodeSession.mockImplementation(async () => ({
      client: {
        event: {
          subscribe: mock(async () => ({
            stream: events.stream,
          })),
        },
        permission: {
          reply: permissionReply,
        },
        question: {
          reject: mock(async () => {}),
          reply: mock(async () => {}),
        },
        session: {
          abort: mock(async () => {}),
          promptAsync: mock(async () => {}),
        },
      },
      server: {
        close: mock(() => {}),
      },
      sessionId: "opencode-session-1",
    }));

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

    events.close();
  });

  it("persists streaming text deltas before full part updates arrive", async () => {
    const events = createEventQueue();
    startOpenCodeSession.mockImplementation(async () => ({
      client: {
        event: {
          subscribe: mock(async () => ({
            stream: events.stream,
          })),
        },
        permission: {
          reply: mock(async () => {}),
        },
        question: {
          reply: mock(async () => {}),
        },
        session: {
          abort: mock(async () => {}),
          promptAsync: mock(async () => {}),
        },
      },
      server: {
        close: mock(() => {}),
      },
      sessionId: "opencode-session-1",
    }));

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

    events.close();
  });
});
