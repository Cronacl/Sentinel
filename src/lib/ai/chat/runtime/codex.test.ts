import { beforeEach, describe, expect, it, mock } from "bun:test";

import { PLAN_MODE_DEVELOPER_INSTRUCTIONS } from "./plan-mode-instructions";

const upsertMessage = mock(() => {});
const setActiveMessage = mock(async () => {});
const clearActiveStream = mock(() => {});
const sessionSnapshotState = {
  activeRunId: "run-1" as string | null,
  threadStatus: "streaming" as "idle" | "streaming" | "awaiting_approval",
  threadTitle: "Codex Thread",
};
const setThreadStatus = mock(
  (_threadId: string, status: "idle" | "streaming" | "awaiting_approval") => {
    sessionSnapshotState.threadStatus = status;
  },
);
const setActiveStream = mock((_threadId: string, streamId: string) => {
  sessionSnapshotState.activeRunId = streamId;
});
const loadThread = mock(async () => ({ chatEngineState: null }));
const loadThreadMessages = mock(async () => []);
const updateThreadRepoState = mock(() => {});
const updateThreadChatSettings = mock(async () => {});
const updateCodexThreadState = mock((..._args: unknown[]) => {});
const ensureThread = mock(async (..._args: unknown[]) => ({ created: true }));
const updateClaudeThreadState = mock(() => {});
const updateCopilotThreadState = mock(() => {});
const updateThreadTitle = mock((_threadId: string, title: string) => {
  sessionSnapshotState.threadTitle = title;
});
const updateMessageMetadata = mock(async () => {});
const beginThreadRepoCheckpointRun = mock(async () => {});
const loadThreadSessionSnapshot = mock(async (threadId: string) => ({
  activeRunId: sessionSnapshotState.activeRunId,
  chatEngine: "codex",
  messages: [],
  queuedFollowUps: [],
  threadId,
  threadTitle: sessionSnapshotState.threadTitle,
  threadStatus: sessionSnapshotState.threadStatus,
}));
let codexSubscriptionHandler: ((event: any) => void) | null = null;

const codexManager = {
  getDefaultModel: mock(
    (): {
      defaultReasoningEffort: string;
      id: string;
      model: string;
    } | null => null,
  ),
  getKnownModel: mock(
    (
      _modelId?: string | null,
    ): {
      defaultReasoningEffort: string;
      id: string;
      model: string;
    } | null => null,
  ),
  getServerVersion: mock(() => "0.160.1"),
  respondToApproval: mock(
    async (
      _approvalId?: string,
      _decision?: string,
    ): Promise<{ declinedReason: string | null }> => ({
      declinedReason: null,
    }),
  ),
  respondToUserInput: mock(async () => {}),
  declineServerRequest: mock((_requestId: string) => true),
  resumeThread: mock(async (threadId: string) => ({
    cwd: "/tmp/workspace",
    model: "gpt-5.4",
    modelProvider: "openai",
    reasoningEffort: null,
    thread: {
      cliVersion: "1.0.0",
      id: threadId,
    },
  })),
  startThread: mock(async () => ({
    cwd: "/tmp/workspace",
    model: "gpt-5.4",
    modelProvider: "openai",
    reasoningEffort: null,
    thread: {
      cliVersion: "1.0.0",
      id: "codex-thread-1",
    },
  })),
  startTurn: mock(async () => ({
    turn: {
      id: "turn-1",
      items: [],
    },
  })),
  steerTurn: mock(async () => ({ turnId: "turn-1" })),
  subscribe: mock((handler: (event: any) => void) => {
    codexSubscriptionHandler = handler;
    return mock(() => {});
  }),
  supportsCollaborationMode: mock(() => true),
};

const debugLogs: Array<{ data: unknown; message: string }> = [];

mock.module("server-only", () => ({}));

mock.module("@/lib/logger", () => ({
  createLogger: () => ({
    debug: (message: string, data?: unknown) => {
      debugLogs.push({ data, message });
    },
    error() {},
    info() {},
    warn() {},
  }),
}));

const getCodexAppServerManager = mock((_instance?: unknown) => codexManager);

mock.module("@/lib/ai/chat/engines/codex-app-server", () => ({
  getCodexAppServerManager,
}));

const persistenceModuleMock = () => ({
  clearActiveStream,
  ensureThread,
  loadThread,
  loadThreadMessages,
  setActiveMessage,
  setActiveStream,
  setThreadStatus,
  updateClaudeThreadState: updateClaudeThreadState,
  updateCopilotThreadState: updateCopilotThreadState,
  updateCodexThreadState: updateCodexThreadState,
  updateMessageMetadata,
  updateThreadChatSettings,
  updateThreadTitle,
  updateThreadRepoState,
  upsertMessage,
});

mock.module("../persistence", persistenceModuleMock);
mock.module("../persistence.ts", persistenceModuleMock);
mock.module("@/lib/ai/chat/persistence", persistenceModuleMock);

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

mock.module("./workspace", () => ({
  getToolApprovalPolicies: mock(async () => ({})),
  getToolPermissionMode: mock(async () => "default"),
  getWorkspaceRootPath: mock(async () => "/tmp/workspace"),
}));

const { runCodexThreadChat } = await import("./codex");
const { makeFakeInstance } = await import("../engines/contract/testing");
const { getEngineUsageLimitsStore } =
  await import("../engines/platform/usage/limits-store");
const { UNATTENDED_DECLINE_MESSAGE } = await import("./unattended");

async function emitCodexEvent(event: {
  id?: string;
  method: string;
  params?: Record<string, unknown>;
  type?: string;
}) {
  if (!codexSubscriptionHandler) {
    throw new Error("Codex subscription handler is not registered.");
  }

  codexSubscriptionHandler({
    type: "event",
    ...event,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function getLatestAssistantMessage() {
  const assistantCalls = upsertMessage.mock.calls.filter(
    (call: unknown[]) =>
      typeof call[1] === "object" &&
      call[1] !== null &&
      "role" in (call[1] as Record<string, unknown>) &&
      (call[1] as { role?: unknown }).role === "assistant",
  );

  return assistantCalls.at(-1)?.[1] as
    | {
        metadata?: Record<string, unknown>;
        parts: Array<Record<string, unknown>>;
        role: "assistant";
      }
    | undefined;
}

function toDataUrl(content: string, mediaType: string) {
  return `data:${mediaType};base64,${Buffer.from(content).toString("base64")}`;
}

describe("runCodexThreadChat editing", () => {
  beforeEach(() => {
    beginThreadRepoCheckpointRun.mockClear();
    clearActiveStream.mockClear();
    loadThread.mockClear();
    loadThreadMessages.mockClear();
    loadThreadSessionSnapshot.mockClear();
    sessionSnapshotState.activeRunId = "run-1";
    sessionSnapshotState.threadStatus = "streaming";
    sessionSnapshotState.threadTitle = "Codex Thread";
    setActiveMessage.mockClear();
    setActiveStream.mockClear();
    setThreadStatus.mockClear();
    updateCodexThreadState.mockClear();
    updateMessageMetadata.mockClear();
    updateThreadChatSettings.mockClear();
    updateThreadTitle.mockClear();
    updateThreadRepoState.mockClear();
    upsertMessage.mockClear();
    codexManager.getDefaultModel.mockReset();
    codexManager.getDefaultModel.mockImplementation(() => null);
    codexManager.getKnownModel.mockReset();
    codexManager.getKnownModel.mockImplementation(() => null);
    codexManager.respondToApproval.mockClear();
    codexManager.respondToUserInput.mockClear();
    codexManager.resumeThread.mockClear();
    codexManager.startThread.mockClear();
    codexManager.startTurn.mockClear();
    codexManager.steerTurn.mockClear();
    codexManager.subscribe.mockClear();
    codexManager.supportsCollaborationMode.mockReset();
    codexManager.supportsCollaborationMode.mockImplementation(() => true);
    codexSubscriptionHandler = null;
    debugLogs.length = 0;
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

    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-2-edit",
          metadata: {},
          parts: [{ text: "revised second", type: "text" }],
          role: "user",
        },
        messageId: "user-2",
        modelId: "gpt-5.4",
        threadId: "thread-1",
        trigger: "edit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: {
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
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-1",
          metadata: {},
          parts: [{ text: "Plan the rollout", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-2",
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
    expect(updateThreadChatSettings).toHaveBeenCalledWith("thread-2", {
      engine: "codex",
      mode: "plan",
      modelId: "gpt-5.4",
      reasoningEffort: null,
    });
    expect(codexManager.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        collaborationMode: {
          mode: "plan",
          settings: expect.objectContaining({
            developer_instructions: PLAN_MODE_DEVELOPER_INSTRUCTIONS,
            model: "gpt-5.4",
            reasoning_effort: "medium",
          }),
        },
      }),
    );
  });

  it("persists a normalized error message when a Codex turn fails", async () => {
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-failed-1",
          metadata: {},
          parts: [{ text: "Trigger a failure", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-failed-1",
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

    await emitCodexEvent({
      method: "turn/completed",
      params: {
        turn: {
          error: {},
          id: "turn-1",
          items: [],
          status: "failed",
        },
      },
    });

    expect(updateMessageMetadata).toHaveBeenCalledWith(
      "thread-failed-1",
      expect.any(String),
      expect.objectContaining({
        errorMessage: "Codex turn failed.",
        status: "error",
      }),
    );
    expect(getLatestAssistantMessage()?.metadata).toEqual(
      expect.objectContaining({
        errorMessage: "Codex turn failed.",
        status: "error",
      }),
    );
    expect(setThreadStatus).toHaveBeenLastCalledWith("thread-failed-1", "idle");
  });

  it("converts non-image attachments into text input instead of rejecting them", async () => {
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-file-1",
          metadata: {},
          parts: [
            {
              filename: "README.md",
              mediaType: "text/markdown",
              type: "file",
              url: toDataUrl("# Hello\n\nThis is a readme.\n", "text/markdown"),
            },
            { text: "summarize this", type: "text" },
          ],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-file-1",
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
    expect(codexManager.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.arrayContaining([
          expect.objectContaining({
            text: "summarize this",
            type: "text",
          }),
          expect.objectContaining({
            text: expect.stringContaining("Document: README.md"),
            type: "text",
          }),
          expect.objectContaining({
            text: expect.stringContaining("# Hello"),
            type: "text",
          }),
        ]),
      }),
    );
  });

  it("bootstraps placeholder Codex threads with a title before the first snapshot", async () => {
    sessionSnapshotState.threadTitle = "New thread";

    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-title-1",
          metadata: {},
          parts: [{ text: "Fix codex sidebar title", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-title-1",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: null,
        mode: "chat",
        status: "idle",
        title: "New thread",
      } as any,
    );

    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(updateThreadTitle).toHaveBeenCalledWith(
      "thread-title-1",
      "Fix Codex Sidebar Title",
    );
    expect(payload).toMatchObject({
      snapshot: {
        threadId: "thread-title-1",
        threadTitle: "Fix Codex Sidebar Title",
      },
    });
  });

  it("starts a fresh Codex thread when switching from plan mode to chat mode", async () => {
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-implement-1",
          metadata: {},
          parts: [{ text: "Implement Plan", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-chat-handoff",
        threadMode: "chat",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      {
        chatEngineState: {
          approvalPolicy: "default",
          cliVersion: "1.0.0",
          codexThreadId: "codex-thread-plan-existing",
          cwd: "/tmp/workspace",
          modelId: "gpt-5.4",
          modelProvider: "openai",
          pendingTurnId: null,
          reasoningEffort: null,
          sandboxMode: "workspace-write",
        },
        mode: "plan",
        status: "idle",
      } as any,
    );

    expect(response.status).toBe(202);
    expect(codexManager.resumeThread).not.toHaveBeenCalled();
    expect(codexManager.startThread).toHaveBeenCalledTimes(1);
    expect(codexManager.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        collaborationMode: {
          mode: "default",
          settings: expect.objectContaining({
            developer_instructions: expect.any(String),
            model: "gpt-5.4",
            reasoning_effort: "medium",
          }),
        },
        threadId: "codex-thread-1",
      }),
    );
    expect(updateThreadChatSettings).toHaveBeenCalledWith(
      "thread-chat-handoff",
      {
        engine: "codex",
        mode: "chat",
        modelId: "gpt-5.4",
        reasoningEffort: null,
      },
    );
  });

  it("sends collaborationMode once, without the old error-text retry", async () => {
    codexManager.startTurn.mockImplementationOnce(async () => {
      throw new Error(
        "turn/start.collaborationMode requires experimentalApi capability",
      );
    });

    await expect(
      runCodexThreadChat(
        {
          message: {
            id: "user-3",
            metadata: {},
            parts: [{ text: "hey", type: "text" }],
            role: "user",
          },
          modelId: "gpt-5.4",
          threadId: "thread-3",
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
      ),
    ).rejects.toThrow("experimentalApi");

    expect(codexManager.startTurn).toHaveBeenCalledTimes(1);
  });

  it("uses the plan-mode preamble instead of collaborationMode on app-servers below 0.156", async () => {
    codexManager.supportsCollaborationMode.mockImplementation(() => false);

    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-3b",
          metadata: {},
          parts: [{ text: "hey", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-3b",
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
    expect(codexManager.startTurn).toHaveBeenCalledTimes(1);
    expect(codexManager.startTurn).toHaveBeenCalledWith(
      expect.not.objectContaining({
        collaborationMode: expect.anything(),
      }),
    );
    expect(codexManager.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining("<proposed_plan>"),
            type: "text",
          }),
        ]),
      }),
    );

    await emitCodexEvent({
      method: "item/agentMessage/delta",
      params: {
        delta: "<proposed_plan>\n# Fallback Plan\n\nShip it\n</proposed_plan>",
        itemId: "agent-plan-1",
      },
    });

    expect(getLatestAssistantMessage()?.parts).toEqual([
      expect.objectContaining({
        input: { kind: "plan" },
        output: expect.objectContaining({
          steps: null,
          text: "# Fallback Plan\n\nShip it",
        }),
        state: "output-available",
        toolCallId: "agent-plan-1:proposed-plan:0",
        toolName: "codex_plan",
        type: "dynamic-tool",
      }),
    ]);
  });

  it("defaults collaborationMode to Codex's model/list default model and effort", async () => {
    codexManager.startThread.mockImplementationOnce(async () => ({
      cwd: "/tmp/workspace",
      model: null as unknown as string,
      modelProvider: "openai",
      reasoningEffort: null,
      thread: { cliVersion: "0.160.1", id: "codex-thread-default" },
    }));
    const listedDefault = {
      defaultReasoningEffort: "high",
      id: "gpt-6.1-sol",
      model: "gpt-6.1-sol",
    };
    codexManager.getDefaultModel.mockImplementation(() => listedDefault);
    codexManager.getKnownModel.mockImplementation((modelId?: string | null) =>
      modelId === "gpt-6.1-sol" ? listedDefault : null,
    );

    await runCodexThreadChat(
      {
        message: {
          id: "user-default-model",
          metadata: {},
          parts: [{ text: "hey", type: "text" }],
          role: "user",
        },
        threadId: "thread-default-model",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );

    expect(codexManager.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        collaborationMode: {
          mode: "default",
          settings: expect.objectContaining({
            model: "gpt-6.1-sol",
            reasoning_effort: "high",
          }),
        },
      }),
    );
  });

  it("falls back to the static Codex default model when nothing names one", async () => {
    codexManager.startThread.mockImplementationOnce(async () => ({
      cwd: "/tmp/workspace",
      model: null as unknown as string,
      modelProvider: "openai",
      reasoningEffort: null,
      thread: { cliVersion: "0.160.1", id: "codex-thread-static" },
    }));

    await runCodexThreadChat(
      {
        message: {
          id: "user-static-model",
          metadata: {},
          parts: [{ text: "hey", type: "text" }],
          role: "user",
        },
        threadId: "thread-static-model",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );

    expect(codexManager.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        collaborationMode: expect.objectContaining({
          settings: expect.objectContaining({
            model: "gpt-6-astra",
            reasoning_effort: "medium",
          }),
        }),
      }),
    );
  });

  it("keeps surrounding prose as text when promoting fallback proposed_plan blocks", async () => {
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-4",
          metadata: {},
          parts: [{ text: "Draft the plan", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-4",
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

    await emitCodexEvent({
      method: "item/agentMessage/delta",
      params: {
        delta:
          "A quick note before the plan.\n\n<proposed_plan>\n# Plan\n\nDo the thing\n</proposed_plan>\n\nFollow-up after the plan.",
        itemId: "agent-plan-2",
      },
    });

    expect(getLatestAssistantMessage()?.parts).toEqual([
      {
        text: "A quick note before the plan.\n\n",
        type: "text",
      },
      expect.objectContaining({
        input: { kind: "plan" },
        output: expect.objectContaining({
          steps: null,
          text: "# Plan\n\nDo the thing",
        }),
        state: "output-available",
        toolCallId: "agent-plan-2:proposed-plan:0",
        toolName: "codex_plan",
        type: "dynamic-tool",
      }),
      {
        text: "\n\nFollow-up after the plan.",
        type: "text",
      },
    ]);
  });

  it("keeps incomplete fallback proposed_plan blocks streaming until the close tag arrives", async () => {
    const response = await runCodexThreadChat(
      {
        message: {
          id: "user-5",
          metadata: {},
          parts: [{ text: "Plan this incrementally", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5.4",
        threadId: "thread-5",
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

    await emitCodexEvent({
      method: "item/agentMessage/delta",
      params: {
        delta: "Lead-in text\n<proposed_plan>\n# Streaming Plan\n\nPartial",
        itemId: "agent-plan-3",
      },
    });

    expect(getLatestAssistantMessage()?.parts).toEqual([
      {
        text: "Lead-in text\n",
        type: "text",
      },
      expect.objectContaining({
        input: { kind: "plan" },
        output: expect.objectContaining({
          steps: null,
          text: "# Streaming Plan\n\nPartial",
        }),
        state: "input-streaming",
        toolCallId: "agent-plan-3:proposed-plan:0",
        toolName: "codex_plan",
        type: "dynamic-tool",
      }),
    ]);

    await emitCodexEvent({
      method: "item/agentMessage/delta",
      params: {
        delta: "\nMore details\n</proposed_plan>\nTrailing note",
        itemId: "agent-plan-3",
      },
    });

    expect(getLatestAssistantMessage()?.parts).toEqual([
      {
        text: "Lead-in text\n",
        type: "text",
      },
      expect.objectContaining({
        input: { kind: "plan" },
        output: expect.objectContaining({
          steps: null,
          text: "# Streaming Plan\n\nPartial\nMore details",
        }),
        state: "output-available",
        toolCallId: "agent-plan-3:proposed-plan:0",
        toolName: "codex_plan",
        type: "dynamic-tool",
      }),
      {
        text: "\nTrailing note",
        type: "text",
      },
    ]);
  });
});

async function startCodexRun(threadId: string) {
  const response = await runCodexThreadChat(
    {
      message: {
        id: `${threadId}-user`,
        metadata: {},
        parts: [{ text: "Do the thing", type: "text" }],
        role: "user",
      },
      modelId: "gpt-6-astra",
      threadId,
      trigger: "submit-user-message",
      userId: "user-1",
      workspaceId: "workspace-1",
    },
    { chatEngineState: null, mode: "chat", status: "idle" } as any,
  );
  expect(response.status).toBe(202);
  return (await response.json()) as { activeRunId: string };
}

function findPart(toolName: string) {
  return getLatestAssistantMessage()?.parts.find(
    (part) => part.toolName === toolName,
  ) as Record<string, any> | undefined;
}

describe("runCodexThreadChat 0.160 protocol mapping", () => {
  beforeEach(() => {
    loadThread.mockClear();
    setThreadStatus.mockClear();
    updateMessageMetadata.mockClear();
    updateThreadTitle.mockClear();
    upsertMessage.mockClear();
    codexManager.getDefaultModel.mockImplementation(() => null);
    codexManager.getKnownModel.mockImplementation(() => null);
    codexManager.respondToApproval.mockClear();
    codexManager.respondToUserInput.mockClear();
    codexManager.startThread.mockClear();
    codexManager.startTurn.mockClear();
    codexManager.steerTurn.mockClear();
    codexManager.supportsCollaborationMode.mockImplementation(() => true);
    codexSubscriptionHandler = null;
    debugLogs.length = 0;
  });

  it("replays a 0.160 turn into parts, plan steps, title and usage", async () => {
    await startCodexRun("thread-replay");

    // Recorded from the rust-v0.160.1 notification shapes.
    const replay: Array<{ method: string; params: Record<string, unknown> }> = [
      {
        method: "item/started",
        params: {
          item: { id: "rs-1", summary: [], type: "reasoning" },
          startedAtMs: 1,
          threadId: "codex-thread-1",
          turnId: "turn-1",
        },
      },
      {
        method: "item/reasoning/summaryPartAdded",
        params: {
          itemId: "rs-1",
          summaryIndex: 0,
          threadId: "codex-thread-1",
          turnId: "turn-1",
        },
      },
      {
        method: "item/reasoning/summaryTextDelta",
        params: {
          delta: "Checking the repo",
          itemId: "rs-1",
          summaryIndex: 0,
          threadId: "codex-thread-1",
          turnId: "turn-1",
        },
      },
      {
        method: "turn/plan/updated",
        params: {
          explanation: "Two steps",
          plan: [
            { status: "completed", step: "Read" },
            { status: "inProgress", step: "Write" },
          ],
          threadId: "codex-thread-1",
          turnId: "turn-1",
        },
      },
      {
        method: "item/completed",
        params: {
          completedAtMs: 2,
          item: {
            arguments: { q: "x" },
            error: { message: "MCP server crashed" },
            id: "mcp-1",
            server: "docs",
            status: "failed",
            tool: "search",
            type: "mcpToolCall",
          },
          threadId: "codex-thread-1",
          turnId: "turn-1",
        },
      },
      {
        method: "item/completed",
        params: {
          completedAtMs: 3,
          item: {
            arguments: { a: 1 },
            contentItems: [{ text: "ok", type: "inputText" }],
            id: "dyn-1",
            status: "completed",
            success: true,
            tool: "lookup",
            type: "dynamicToolCall",
          },
          threadId: "codex-thread-1",
          turnId: "turn-1",
        },
      },
      {
        method: "item/completed",
        params: {
          completedAtMs: 4,
          item: {
            id: "img-1",
            result: "iVBORw0KGgo-base64",
            revisedPrompt: "a cat",
            savedPath: "/tmp/cat.png",
            status: "completed",
            type: "imageGeneration",
          },
          threadId: "codex-thread-1",
          turnId: "turn-1",
        },
      },
      {
        method: "item/agentMessage/delta",
        params: {
          delta: "Done.",
          itemId: "msg-1",
          threadId: "codex-thread-1",
          turnId: "turn-1",
        },
      },
      {
        method: "thread/name/updated",
        params: { threadId: "codex-thread-1", threadName: "Fix the thing" },
      },
      {
        method: "thread/tokenUsage/updated",
        params: {
          threadId: "codex-thread-1",
          tokenUsage: {
            last: {
              cachedInputTokens: 1_000,
              inputTokens: 12_000,
              outputTokens: 300,
              reasoningOutputTokens: 100,
              totalTokens: 12_300,
            },
            modelContextWindow: 400_000,
            total: {
              cachedInputTokens: 5_000,
              inputTokens: 40_000,
              outputTokens: 900,
              reasoningOutputTokens: 200,
              totalTokens: 40_900,
            },
          },
          turnId: "turn-1",
        },
      },
      {
        method: "thread/tokenUsage/updated",
        params: {
          threadId: "codex-thread-1",
          tokenUsage: {
            last: {
              cachedInputTokens: 12_000,
              inputTokens: 12_500,
              outputTokens: 200,
              reasoningOutputTokens: 50,
              totalTokens: 12_700,
            },
            modelContextWindow: 400_000,
            total: {
              cachedInputTokens: 17_000,
              inputTokens: 52_500,
              outputTokens: 1_100,
              reasoningOutputTokens: 250,
              totalTokens: 53_600,
            },
          },
          turnId: "turn-1",
        },
      },
      {
        method: "thread/realtime/started",
        params: { threadId: "codex-thread-1" },
      },
      {
        method: "turn/completed",
        params: {
          threadId: "codex-thread-1",
          turn: { error: null, id: "turn-1", status: "completed" },
        },
      },
    ];

    for (const event of replay) {
      await emitCodexEvent(event);
    }

    const message = getLatestAssistantMessage();
    expect(message?.metadata).toEqual(
      expect.objectContaining({
        status: "completed",
        usage: {
          contextWindow: 400_000,
          inputTokens: 12_500,
          outputTokens: 500,
          reasoningTokens: 150,
          totalTokens: 13_000,
        },
      }),
    );
    expect(message?.parts[0]).toEqual({
      text: "Checking the repo",
      type: "reasoning",
    });
    expect(findPart("codex_mcp_tool_call")).toMatchObject({
      errorText: "MCP server crashed",
      state: "output-error",
    });
    expect(findPart("codex_dynamic_tool_call")).toMatchObject({
      input: { arguments: { a: 1 }, namespace: null, tool: "lookup" },
      state: "output-available",
    });
    const image = findPart("codex_image_generation");
    expect(image).toMatchObject({
      output: { savedPath: "/tmp/cat.png", status: "completed" },
      state: "output-available",
    });
    expect(JSON.stringify(image)).not.toContain("base64");
    expect(message?.parts.at(-1)).toEqual({ text: "Done.", type: "text" });
    expect(updateThreadTitle).toHaveBeenCalledWith(
      "thread-replay",
      "Fix the thing",
    );
    expect(debugLogs).toContainEqual({
      data: expect.objectContaining({ method: "thread/realtime/started" }),
      message: "unhandled_notification",
    });
    expect(setThreadStatus).toHaveBeenLastCalledWith("thread-replay", "idle");
  });

  it("renders turn/plan/updated `plan` steps on proposed plans", async () => {
    await startCodexRun("thread-plan-steps");

    await emitCodexEvent({
      method: "turn/plan/updated",
      params: {
        plan: [{ status: "inProgress", step: "Draft" }],
        threadId: "codex-thread-1",
        turnId: "turn-1",
      },
    });
    await emitCodexEvent({
      method: "item/completed",
      params: {
        item: { id: "plan-1", text: "# Plan", type: "plan" },
        threadId: "codex-thread-1",
        turnId: "turn-1",
      },
    });

    expect(findPart("codex_plan")?.output).toEqual({
      steps: [{ status: "inProgress", step: "Draft" }],
      text: "# Plan",
    });
  });

  it("surfaces item/tool/requestUserInput questions and routes the answer", async () => {
    await startCodexRun("thread-user-input");

    await emitCodexEvent({
      id: "req-7",
      method: "item/tool/requestUserInput",
      params: {
        isBlocking: true,
        itemId: "ask-1",
        questions: [
          {
            header: "Approach",
            id: "approach",
            options: [
              { description: "Small patch", label: "Patch" },
              { description: "Start over", label: "Rewrite" },
            ],
            question: "How should I fix it?",
          },
        ],
        threadId: "codex-thread-1",
        turnId: "turn-1",
      },
      type: "user-input-request",
    });

    const part = findPart("codex_user_input");
    expect(part).toMatchObject({
      approval: { id: "req-7" },
      input: {
        prompt:
          "Approach: How should I fix it?\n  1. Patch - Small patch\n  2. Rewrite - Start over",
        questions: [expect.objectContaining({ id: "approach" })],
        requestId: "req-7",
      },
      state: "approval-requested",
    });
    expect(setThreadStatus).toHaveBeenCalledWith(
      "thread-user-input",
      "awaiting_approval",
    );

    await runCodexThreadChat(
      {
        messages: [
          {
            id: "assistant-x",
            metadata: {},
            parts: [
              {
                ...part,
                approval: { approved: true, id: "req-7", response: "2" },
              } as any,
            ],
            role: "assistant",
          },
        ],
        threadId: "thread-user-input",
        trigger: "submit-tool-approval",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as any,
      {
        chatEngineState: { codex: { codexThreadId: "codex-thread-1" } },
        mode: "chat",
        status: "awaiting_approval",
      } as any,
    );

    expect(codexManager.respondToUserInput).toHaveBeenCalledWith("req-7", "2");
  });

  it("surfaces permission and MCP elicitation requests as approvals", async () => {
    await startCodexRun("thread-permissions");

    await emitCodexEvent({
      id: "51",
      method: "item/permissions/requestApproval",
      params: {
        cwd: "/tmp/workspace",
        itemId: "perm-item",
        permissions: { network: { enabled: true } },
        reason: "Needs network",
        startedAtMs: 1,
        threadId: "codex-thread-1",
        turnId: "turn-1",
      },
      type: "approval-request",
    });
    await emitCodexEvent({
      id: "52",
      method: "mcpServer/elicitation/request",
      params: {
        message: "Allow docs to read your files?",
        mode: "form",
        requestedSchema: { properties: {}, type: "object" },
        serverName: "docs",
        threadId: "codex-thread-1",
        turnId: "turn-1",
      },
      type: "approval-request",
    });

    expect(findPart("codex_permissions_request")).toMatchObject({
      approval: { id: "51" },
      input: {
        cwd: "/tmp/workspace",
        permissions: { network: { enabled: true } },
        reason: "Needs network",
      },
      state: "approval-requested",
    });
    expect(findPart("codex_mcp_elicitation")).toMatchObject({
      approval: { id: "52" },
      input: { message: "Allow docs to read your files?", serverName: "docs" },
      state: "approval-requested",
    });

    await runCodexThreadChat(
      {
        messages: [
          {
            id: "assistant-y",
            metadata: {},
            parts: [
              {
                ...findPart("codex_permissions_request"),
                approval: { approved: false, id: "51" },
              } as any,
            ],
            role: "assistant",
          },
        ],
        threadId: "thread-permissions",
        trigger: "submit-tool-approval",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as any,
      {
        chatEngineState: { codex: { codexThreadId: "codex-thread-1" } },
        mode: "chat",
        status: "awaiting_approval",
      } as any,
    );

    expect(codexManager.respondToApproval).toHaveBeenCalledWith(
      "51",
      "decline",
    );
    expect(findPart("codex_permissions_request")).toMatchObject({
      state: "output-denied",
    });

    // Codex resolved the elicitation on its own (e.g. the turn ended).
    await emitCodexEvent({
      method: "serverRequest/resolved",
      params: { requestId: 52, threadId: "codex-thread-1" },
    });
    const elicitation = findPart("codex_mcp_elicitation");
    expect(elicitation?.state).toBe("output-denied");
    // The AI SDK requires {approved:false} on output-denied parts.
    expect(elicitation?.approval).toEqual({ approved: false, id: "52" });
  });

  it("shows an MCP form accept that Codex was told to decline as denied", async () => {
    await startCodexRun("thread-elicitation-form");

    await emitCodexEvent({
      id: "53",
      method: "mcpServer/elicitation/request",
      params: {
        message: "Confirm the deploy",
        mode: "form",
        requestedSchema: {
          properties: { confirm: { type: "boolean" } },
          required: ["confirm"],
          type: "object",
        },
        serverName: "deploy",
        threadId: "codex-thread-1",
        turnId: "turn-1",
      },
      type: "approval-request",
    });

    const reason =
      "Sentinel cannot fill in this MCP form yet, so the request was declined.";
    codexManager.respondToApproval.mockImplementationOnce(async () => ({
      declinedReason: reason,
    }));

    await runCodexThreadChat(
      {
        messages: [
          {
            id: "assistant-z",
            metadata: {},
            parts: [
              {
                ...findPart("codex_mcp_elicitation"),
                approval: { approved: true, id: "53" },
                state: "approval-responded",
              } as any,
            ],
            role: "assistant",
          },
        ],
        threadId: "thread-elicitation-form",
        trigger: "submit-tool-approval",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as any,
      {
        chatEngineState: { codex: { codexThreadId: "codex-thread-1" } },
        mode: "chat",
        status: "awaiting_approval",
      } as any,
    );

    expect(codexManager.respondToApproval).toHaveBeenCalledWith("53", "accept");
    expect(findPart("codex_mcp_elicitation")).toMatchObject({
      approval: { approved: false, id: "53", reason },
      state: "output-denied",
    });

    // Codex then resolves the request; the part stays denied.
    await emitCodexEvent({
      method: "serverRequest/resolved",
      params: { requestId: 53, threadId: "codex-thread-1" },
    });
    expect(findPart("codex_mcp_elicitation")?.state).toBe("output-denied");
  });

  it("answers secret request_user_input questions without persisting the answer", async () => {
    await startCodexRun("thread-secret-input");

    await emitCodexEvent({
      id: "req-9",
      method: "item/tool/requestUserInput",
      params: {
        itemId: "ask-2",
        questions: [
          {
            header: "Token",
            id: "token",
            isSecret: true,
            question: "Paste the deploy token",
          },
        ],
        threadId: "codex-thread-1",
        turnId: "turn-1",
      },
      type: "user-input-request",
    });

    const part = findPart("codex_user_input");
    expect(part?.input.questions[0].isSecret).toBe(true);
    upsertMessage.mockClear();

    await runCodexThreadChat(
      {
        messages: [
          {
            id: "assistant-secret",
            metadata: {},
            parts: [
              {
                ...part,
                approval: { approved: true, id: "req-9", response: "s3cr3t" },
                state: "approval-responded",
              } as any,
            ],
            role: "assistant",
          },
        ],
        threadId: "thread-secret-input",
        trigger: "submit-tool-approval",
        userId: "user-1",
        workspaceId: "workspace-1",
      } as any,
      {
        chatEngineState: { codex: { codexThreadId: "codex-thread-1" } },
        mode: "chat",
        status: "awaiting_approval",
      } as any,
    );

    expect(codexManager.respondToUserInput).toHaveBeenCalledWith(
      "req-9",
      "s3cr3t",
    );
    expect(upsertMessage.mock.calls.length).toBeGreaterThan(0);
    expect(JSON.stringify(upsertMessage.mock.calls)).not.toContain("s3cr3t");
    expect(findPart("codex_user_input")).toMatchObject({
      output: { response: null },
      state: "output-available",
    });
  });

  it("shows a command approval that arrives before item/started", async () => {
    await startCodexRun("thread-early-approval");

    await emitCodexEvent({
      id: "61",
      method: "item/commandExecution/requestApproval",
      params: {
        command: "npm test",
        cwd: "/tmp/workspace",
        itemId: "cmd-early",
        startedAtMs: 1,
        threadId: "codex-thread-1",
        turnId: "turn-1",
      },
      type: "approval-request",
    });

    expect(findPart("codex_command_execution")).toMatchObject({
      approval: { id: "61" },
      input: expect.objectContaining({ command: "npm test" }),
      state: "approval-requested",
      toolCallId: "cmd-early",
    });

    await emitCodexEvent({
      method: "serverRequest/resolved",
      params: { requestId: 61, threadId: "codex-thread-1" },
    });
    expect(findPart("codex_command_execution")?.approval).toBeUndefined();
  });

  it("steers the active turn with expectedTurnId", async () => {
    await startCodexRun("thread-steer");

    const response = await runCodexThreadChat(
      {
        message: {
          id: "steer-user",
          metadata: {},
          parts: [{ text: "also update docs", type: "text" }],
          role: "user",
        },
        modelId: "gpt-6-astra",
        threadId: "thread-steer",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "streaming" } as any,
    );

    expect(response.status).toBe(204);
    expect(codexManager.steerTurn).toHaveBeenCalledWith({
      expectedTurnId: "turn-1",
      input: [
        expect.objectContaining({ text: "also update docs", type: "text" }),
      ],
      threadId: "codex-thread-1",
    });
  });
});

describe("runCodexThreadChat instances and unattended runs", () => {
  beforeEach(() => {
    ensureThread.mockClear();
    getCodexAppServerManager.mockClear();
    setThreadStatus.mockClear();
    updateCodexThreadState.mockClear();
    upsertMessage.mockClear();
    codexManager.declineServerRequest.mockClear();
    codexManager.getDefaultModel.mockImplementation(() => null);
    codexManager.getKnownModel.mockImplementation(() => null);
    codexManager.respondToApproval.mockClear();
    codexManager.respondToUserInput.mockClear();
    codexManager.startThread.mockClear();
    codexManager.startTurn.mockClear();
    codexManager.supportsCollaborationMode.mockImplementation(() => true);
    codexSubscriptionHandler = null;
  });

  function userMessage(threadId: string) {
    return {
      id: `${threadId}-user`,
      metadata: {},
      parts: [{ text: "Do the thing", type: "text" as const }],
      role: "user" as const,
    };
  }

  it("binds a new thread to its instance and runs that instance's app-server", async () => {
    const instance = makeFakeInstance({
      continuationKey: "codex:home:/tmp/codex-work",
      driver: "codex",
      id: "codex-work",
    });

    const response = await runCodexThreadChat(
      {
        message: userMessage("thread-instance"),
        modelId: "gpt-6-astra",
        threadId: "thread-instance",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
      instance,
    );

    expect(response.status).toBe(202);
    expect(ensureThread.mock.calls[0]?.at(-1)).toBe("codex-work");
    expect(getCodexAppServerManager).toHaveBeenCalled();
    for (const call of getCodexAppServerManager.mock.calls) {
      expect(call[0]).toBe(instance);
    }
    expect(updateCodexThreadState).toHaveBeenCalledWith(
      "thread-instance",
      expect.objectContaining({ codexThreadId: "codex-thread-1" }),
      instance,
    );
  });

  const priorRecords = [
    {
      createdAt: new Date(1),
      id: "db-user-1",
      messageId: "user-1",
      metadata: {},
      parts: [{ text: "Add a cache", type: "text" }],
      role: "user",
      updatedAt: new Date(1),
    },
    {
      createdAt: new Date(2),
      id: "db-assistant-1",
      messageId: "assistant-1",
      metadata: { parentMessageId: "user-1" },
      parts: [{ text: "The cache is in place.", type: "text" }],
      role: "assistant",
      updatedAt: new Date(2),
    },
  ];

  function threadOnHome(home: string) {
    return {
      chatEngineState: {
        codex: {
          codexThreadId: "codex-thread-old-home",
          continuationKey: `codex:home:${home}`,
          cwd: "/tmp/workspace",
          instanceId: "codex-work",
          modelId: "gpt-6-astra",
        },
      },
      mode: "chat",
      status: "idle",
    } as any;
  }

  function firstTurnText() {
    const input = (codexManager.startTurn.mock.calls[0] as any)?.[0]?.input as
      Array<{ text?: string; type: string }> | undefined;
    return (input ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
  }

  it("replays the conversation into a fresh Codex thread when the instance's home changed", async () => {
    loadThreadMessages.mockResolvedValueOnce(priorRecords as any);
    codexManager.resumeThread.mockClear();
    const instance = makeFakeInstance({
      continuationKey: "codex:home:/tmp/new-home",
      driver: "codex",
      id: "codex-work",
    });

    const response = await runCodexThreadChat(
      {
        message: { ...userMessage("thread-moved"), id: "user-2" },
        modelId: "gpt-6-astra",
        threadId: "thread-moved",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      threadOnHome("/tmp/old-home"),
      instance,
    );

    expect(response.status).toBe(202);
    expect(codexManager.resumeThread).not.toHaveBeenCalled();
    expect(codexManager.startThread).toHaveBeenCalledTimes(1);
    const text = firstTurnText();
    expect(text).toContain("<conversation_history>");
    expect(text).toContain(
      "USER: Add a cache\n\nASSISTANT: The cache is in place.",
    );
    expect(text.endsWith("New message:\n\nDo the thing")).toBe(true);
  });

  it("puts the plan preamble before the replayed history on app-servers without collaboration mode", async () => {
    loadThreadMessages.mockResolvedValueOnce(priorRecords as any);
    codexManager.supportsCollaborationMode.mockImplementation(() => false);

    await runCodexThreadChat(
      {
        message: { ...userMessage("thread-moved-plan"), id: "user-2" },
        modelId: "gpt-6-astra",
        threadId: "thread-moved-plan",
        threadMode: "plan",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { ...threadOnHome("/tmp/old-home"), mode: "plan" },
      makeFakeInstance({
        continuationKey: "codex:home:/tmp/new-home",
        driver: "codex",
        id: "codex-work",
      }),
    );

    const text = firstTurnText();
    expect(
      text.indexOf("Native Codex collaboration mode is unavailable"),
    ).toBeGreaterThan(-1);
    expect(
      text.indexOf("Native Codex collaboration mode is unavailable"),
    ).toBeLessThan(text.indexOf("<conversation_history>"));
    // The history introduces the user's own words, with nothing between.
    expect(text.endsWith("New message:\n\nDo the thing")).toBe(true);
  });

  it("replays the conversation into the fresh Codex thread a mode change starts", async () => {
    loadThreadMessages.mockResolvedValueOnce(priorRecords as any);
    codexManager.resumeThread.mockClear();

    await runCodexThreadChat(
      {
        message: { ...userMessage("thread-implement"), id: "user-2" },
        modelId: "gpt-6-astra",
        threadId: "thread-implement",
        threadMode: "chat",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { ...threadOnHome("/tmp/old-home"), mode: "plan" },
      makeFakeInstance({
        continuationKey: "codex:home:/tmp/old-home",
        driver: "codex",
        id: "codex-work",
      }),
    );

    expect(codexManager.resumeThread).not.toHaveBeenCalled();
    expect(codexManager.startThread).toHaveBeenCalledTimes(1);
    const text = firstTurnText();
    expect(text).toContain(
      "<conversation_history>\nUSER: Add a cache\n\nASSISTANT: The cache is in place.\n</conversation_history>",
    );
    expect(text.endsWith("New message:\n\nDo the thing")).toBe(true);
  });

  it("resumes the Codex thread without replaying when the home is unchanged", async () => {
    loadThreadMessages.mockResolvedValueOnce(priorRecords as any);
    codexManager.resumeThread.mockClear();

    await runCodexThreadChat(
      {
        message: { ...userMessage("thread-kept"), id: "user-2" },
        modelId: "gpt-6-astra",
        threadId: "thread-kept",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      threadOnHome("/tmp/old-home"),
      makeFakeInstance({
        continuationKey: "codex:home:/tmp/old-home",
        driver: "codex",
        id: "codex-work",
      }),
    );

    expect(codexManager.resumeThread).toHaveBeenCalledWith(
      "codex-thread-old-home",
    );
    expect(firstTurnText()).toBe("Do the thing");
  });

  it("declines approvals and questions at once when nobody can answer", async () => {
    const response = await runCodexThreadChat(
      {
        interactive: false,
        message: userMessage("thread-unattended"),
        modelId: "gpt-6-astra",
        threadId: "thread-unattended",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      { chatEngineState: null, mode: "chat", status: "idle" } as any,
    );
    expect(response.status).toBe(202);

    await emitCodexEvent({
      id: "61",
      method: "item/permissions/requestApproval",
      params: {
        cwd: "/tmp/workspace",
        itemId: "perm-item",
        permissions: { network: { enabled: true } },
        reason: "Needs network",
        threadId: "codex-thread-1",
        turnId: "turn-1",
      },
      type: "approval-request",
    });
    await emitCodexEvent({
      id: "62",
      method: "item/tool/requestUserInput",
      params: {
        itemId: "ask-1",
        questions: [
          {
            header: "Approach",
            id: "approach",
            options: [{ description: "Small patch", label: "Patch" }],
            question: "How should I fix it?",
          },
        ],
        threadId: "codex-thread-1",
        turnId: "turn-1",
      },
      type: "user-input-request",
    });

    expect(codexManager.declineServerRequest.mock.calls).toEqual([
      ["61"],
      ["62"],
    ]);
    expect(codexManager.respondToApproval).not.toHaveBeenCalled();
    expect(codexManager.respondToUserInput).not.toHaveBeenCalled();
    expect(findPart("codex_permissions_request")).toMatchObject({
      state: "output-denied",
    });
    expect(JSON.stringify(findPart("codex_permissions_request"))).toContain(
      UNATTENDED_DECLINE_MESSAGE,
    );
    expect(findPart("codex_user_input")?.state).not.toBe("approval-requested");
    expect(setThreadStatus).not.toHaveBeenCalledWith(
      "thread-unattended",
      "awaiting_approval",
    );
  });
});

describe("runCodexThreadChat usage limits", () => {
  beforeEach(() => {
    codexManager.getDefaultModel.mockImplementation(() => null);
    codexManager.getKnownModel.mockImplementation(() => null);
    codexManager.supportsCollaborationMode.mockImplementation(() => true);
    codexSubscriptionHandler = null;
  });

  it("hands account/rateLimits/updated to the instance's usage limits", async () => {
    const instance = makeFakeInstance({ driver: "codex", id: "codex-work" });
    await runCodexThreadChat(
      {
        message: {
          id: "thread-usage-user",
          metadata: {},
          parts: [{ text: "Do the thing", type: "text" }],
          role: "user",
        },
        threadId: "thread-usage",
        trigger: "submit-user-message",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      null,
      instance,
    );

    await emitCodexEvent({
      method: "account/rateLimits/updated",
      params: {
        rateLimits: {
          limitId: "codex",
          primary: {
            resetsAt: 1_790_000_000,
            usedPercent: 42,
            windowDurationMins: 300,
          },
        },
      },
      type: "notification",
    });
    // Another allowance (Spark) never replaces the main windows.
    await emitCodexEvent({
      method: "account/rateLimits/updated",
      params: {
        rateLimits: { limitId: "spark", primary: { usedPercent: 99 } },
      },
      type: "notification",
    });

    expect(
      getEngineUsageLimitsStore().peek("user-1", "codex-work")?.windows,
    ).toEqual([
      {
        id: "primary",
        kind: "session",
        label: "Session",
        resetsAt: new Date(1_790_000_000_000).toISOString(),
        usedPercent: 42,
        windowDurationMins: 300,
      },
    ]);
    expect(getEngineUsageLimitsStore().peek("user-1", "codex")).toBeNull();
  });
});
