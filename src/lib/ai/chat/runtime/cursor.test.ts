import { beforeEach, describe, expect, it, mock } from "bun:test";

const ensureThread = mock(async () => ({ created: true }));
const loadThread = mock(async () => null);
const loadThreadMessages = mock(async () => []);
const setActiveStream = mock(() => {});
const setThreadStatus = mock(() => {});
const upsertMessage = mock((_threadId: string, message: unknown) => message);
const updateCursorThreadState = mock(() => {});
const updateOpenCodeThreadState = mock(() => {});
const updateThreadChatSettings = mock(async () => {});
const loadThreadSessionSnapshot = mock(async (threadId: string) => ({
  activeRunId: "run-1",
  chatEngine: "cursor" as const,
  messages: [],
  queuedFollowUps: [],
  threadId,
  threadTitle: "Cursor thread",
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
const applyCursorSessionConfig = mock(async () => {});
const startCursorAcpSession = mock(async () => ({
  client: {
    close: mock(() => {}),
    prompt: mock(() => new Promise(() => {})),
  },
  configOptions: {},
  sessionId: "cursor-session-1",
}));

mock.module("server-only", () => ({}));

mock.module("@/lib/ai/chat/engines/cursor-acp", () => ({
  applyCursorSessionConfig,
  buildCursorThreadState: mock((state: unknown) => state),
  startCursorAcpSession,
}));

const persistenceModuleMock = () => ({
  ensureThread,
  loadThread,
  loadThreadMessages,
  setActiveStream,
  setThreadStatus,
  updateCursorThreadState: updateCursorThreadState,
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

const { runCursorThreadChat } = await import("./cursor");

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

describe("runCursorThreadChat", () => {
  beforeEach(() => {
    ensureThread.mockClear();
    loadThread.mockClear();
    loadThreadMessages.mockClear();
    setActiveStream.mockClear();
    setThreadStatus.mockClear();
    upsertMessage.mockClear();
    updateCursorThreadState.mockClear();
    updateOpenCodeThreadState.mockClear();
    updateThreadChatSettings.mockClear();
    loadThreadSessionSnapshot.mockClear();
    createNewResumableStream.mockClear();
    resumeExistingStream.mockClear();
    getToolPermissionMode.mockClear();
    getWorkspaceRootPath.mockClear();
    applyCursorSessionConfig.mockClear();
    startCursorAcpSession.mockClear();
  });

  it("shows a visible startup label before the Cursor session is ready", async () => {
    const sessionStart = createDeferred<{
      client: { close: () => void; prompt: () => Promise<never> };
      configOptions: Record<string, never>;
      sessionId: string;
    }>();
    startCursorAcpSession.mockImplementation(() => sessionStart.promise);

    const responsePromise = runCursorThreadChat(
      {
        message: {
          id: "user-1",
          metadata: {},
          parts: [{ text: "Inspect the repo", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.2",
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
          statusLabel: "Starting Cursor session...",
        }),
        role: "assistant",
      }),
    );

    sessionStart.resolve({
      client: {
        close: mock(() => {}),
        prompt: mock(() => new Promise(() => {})),
      },
      configOptions: {},
      sessionId: "cursor-session-1",
    });

    const response = await responsePromise;
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });
});
