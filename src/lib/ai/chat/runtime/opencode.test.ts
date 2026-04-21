import { beforeEach, describe, expect, it, mock } from "bun:test";

const ensureThread = mock(async () => ({ created: true }));
const loadThread = mock(async () => null);
const loadThreadMessages = mock(async () => []);
const setActiveStream = mock(() => {});
const setThreadStatus = mock(() => {});
const updateCursorThreadState = mock(() => {});
const updateOpenCodeThreadState = mock(() => {});
const updateThreadChatSettings = mock(async () => {});
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
const getWorkspaceRootPath = mock(async () => "/tmp/workspace");
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
      reply: mock(async () => {}),
    },
    session: {
      abort: mock(async () => {}),
      promptAsync: mock(async () => {}),
    },
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
  ensureThread,
  loadThread,
  loadThreadMessages,
  setActiveStream,
  setThreadStatus,
  updateCursorThreadState,
  updateOpenCodeThreadState,
  updateThreadChatSettings,
  upsertMessage,
});

mock.module("../persistence", persistenceModuleMock);
mock.module("../persistence.ts", persistenceModuleMock);
mock.module("@/lib/ai/chat/persistence", persistenceModuleMock);

mock.module("../repo-checkpoints", () => ({
  getThreadCheckpointAnchorMessageId: mock(() => null),
}));

const sessionServerModuleMock = () => ({
  loadThreadSessionSnapshot,
  serializeThreadStreamEvent: mock(
    (event: unknown) => `event: test\ndata: ${JSON.stringify(event)}\n\n`,
  ),
});

mock.module("../session-server", sessionServerModuleMock);
mock.module("../session-server.ts", sessionServerModuleMock);

mock.module("@/lib/streams", () => ({
  safelyCloseReadableStreamController: mock(() => true),
  safelyEnqueueReadableStreamController: mock(() => true),
  streamContext: {
    createNewResumableStream,
    resumeExistingStream,
  },
}));

mock.module("./workspace", () => ({
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

describe("runOpenCodeThreadChat", () => {
  beforeEach(() => {
    ensureThread.mockClear();
    loadThread.mockClear();
    loadThreadMessages.mockClear();
    setActiveStream.mockClear();
    setThreadStatus.mockClear();
    updateCursorThreadState.mockClear();
    updateOpenCodeThreadState.mockClear();
    updateThreadChatSettings.mockClear();
    upsertMessage.mockClear();
    loadThreadSessionSnapshot.mockClear();
    createNewResumableStream.mockClear();
    resumeExistingStream.mockClear();
    getToolPermissionMode.mockClear();
    getWorkspaceRootPath.mockClear();
    startOpenCodeSession.mockClear();
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
      sessionId: "opencode-session-1",
    });

    const response = await responsePromise;
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });
});
