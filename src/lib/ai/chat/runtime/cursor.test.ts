import { beforeEach, describe, expect, it, mock } from "bun:test";

const ensureThread = mock(async () => ({ created: true }));
const clearActiveStream = mock(() => {});
const loadThread = mock(async () => null);
const loadThreadMessages = mock(async () => []);
const setActiveMessage = mock(async () => {});
const setActiveStream = mock(() => {});
const setThreadStatus = mock(() => {});
const upsertMessage = mock((_threadId: string, message: unknown) => message);
const updateCopilotThreadState = mock(() => {});
const updateCursorThreadState = mock(() => {});
const updateMessageMetadata = mock(async () => {});
const updateOpenCodeThreadState = mock(() => {});
const updateThreadChatSettings = mock(async () => {});
const updateThreadRepoState = mock(() => {});
const updateThreadTitle = mock(() => {});
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
const getToolApprovalPolicies = mock(async () => ({}));
const getWorkspaceRootPath = mock(async () => "/tmp/workspace");
const applyCursorSessionConfig = mock(async () => {});
let latestCursorSessionOptions: any = null;
const beginThreadRepoCheckpointRun = mock(async () => true);
const clearThreadRepoCheckpointRun = mock(async () => {});
const finalizeThreadRepoCheckpointRun = mock(async () => "checkpoint-1");
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
  startCursorAcpSession: (options: unknown) => {
    latestCursorSessionOptions = options;
    return startCursorAcpSession(options);
  },
}));

const persistenceModuleMock = () => ({
  clearActiveStream,
  ensureThread,
  loadThread,
  loadThreadMessages,
  setActiveMessage,
  setActiveStream,
  setThreadStatus,
  updateCopilotThreadState,
  updateCursorThreadState: updateCursorThreadState,
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
  serializeThreadStreamEvent: mock(
    (event: unknown) => `event: test\ndata: ${JSON.stringify(event)}\n\n`,
  ),
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
    clearActiveStream.mockClear();
    loadThread.mockClear();
    loadThreadMessages.mockClear();
    setActiveMessage.mockClear();
    setActiveStream.mockClear();
    setThreadStatus.mockClear();
    upsertMessage.mockClear();
    updateCopilotThreadState.mockClear();
    updateCursorThreadState.mockClear();
    updateMessageMetadata.mockClear();
    updateOpenCodeThreadState.mockClear();
    updateThreadChatSettings.mockClear();
    updateThreadRepoState.mockClear();
    updateThreadTitle.mockClear();
    loadThreadSessionSnapshot.mockClear();
    createNewResumableStream.mockClear();
    resumeExistingStream.mockClear();
    getToolPermissionMode.mockClear();
    getToolApprovalPolicies.mockClear();
    getWorkspaceRootPath.mockClear();
    applyCursorSessionConfig.mockClear();
    beginThreadRepoCheckpointRun.mockClear();
    clearThreadRepoCheckpointRun.mockClear();
    finalizeThreadRepoCheckpointRun.mockClear();
    startCursorAcpSession.mockClear();
    getToolPermissionMode.mockImplementation(async () => "default");
    getWorkspaceRootPath.mockImplementation(async () => "/tmp/workspace");
    startCursorAcpSession.mockImplementation(async () => ({
      client: {
        close: mock(() => {}),
        prompt: mock(() => new Promise(() => {})),
      },
      configOptions: {},
      sessionId: "cursor-session-1",
    }));
    latestCursorSessionOptions = null;
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

  it("anchors Cursor runs to the resolved workspace and checkpoint lifecycle", async () => {
    const prompt = mock(async () => {});
    startCursorAcpSession.mockImplementation(async () => ({
      client: {
        close: mock(() => {}),
        prompt,
      },
      configOptions: {},
      sessionId: "cursor-session-1",
    }));

    const response = await runCursorThreadChat(
      {
        message: {
          id: "user-1",
          metadata: {},
          parts: [{ text: "Implement the change", type: "text" }],
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

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(getWorkspaceRootPath).toHaveBeenCalledWith(
      "workspace-1",
      "user-1",
      "thread-1",
    );
    expect(beginThreadRepoCheckpointRun).toHaveBeenCalledWith({
      projectPath: "/tmp/workspace",
      runId: expect.any(String),
      thread: null,
    });
    expect(finalizeThreadRepoCheckpointRun).toHaveBeenCalledWith({
      assistantMessageId: expect.any(String),
      runId: expect.any(String),
      threadId: "thread-1",
    });
    expect(clearThreadRepoCheckpointRun).not.toHaveBeenCalled();
    expect(startCursorAcpSession).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/tmp/workspace" }),
    );
    expect(updateCursorThreadState).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({ cwd: "/tmp/workspace" }),
    );
  });

  it("auto-selects Cursor allow permission option in full mode", async () => {
    getToolPermissionMode.mockImplementation(async () => "full");

    await runCursorThreadChat(
      {
        message: {
          id: "user-1",
          metadata: {},
          parts: [{ text: "Run tests", type: "text" }],
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

    const result = await latestCursorSessionOptions.onRequestPermission({
      options: [
        { kind: "reject", optionId: "deny" },
        { kind: "allow_once", optionId: "allow" },
      ],
      toolCall: {
        kind: "shell",
        title: "Bash",
        toolCallId: "tool-1",
      },
    });

    expect(result).toEqual({
      outcome: {
        outcome: "selected",
        optionId: "allow",
      },
    });
    expect(setThreadStatus).not.toHaveBeenCalledWith(
      "thread-1",
      "awaiting_approval",
    );
  });
});
