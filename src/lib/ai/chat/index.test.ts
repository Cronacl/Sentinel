// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const aiTestState = ((globalThis as any).__sentinelAiTestState ??= {
  agentConfig: null,
});

const aiState = {
  assistantResponseMessage: {
    id: "assistant-response",
    metadata: {},
    parts: [{ text: "Assistant response", type: "text" }],
    role: "assistant",
  },
  streamChunks: [],
};

const createAgentUIStream = mock(async () => ({ kind: "agent-ui-stream" }));
const createUIMessageStream = mock(({ execute, onFinish }) => {
  const writer = {
    merge: mock(() => {}),
    write: mock((chunk) => {
      aiState.streamChunks.push(chunk);
    }),
  };

  const done = (async () => {
    await execute({ writer });
    await onFinish?.({ responseMessage: aiState.assistantResponseMessage });
  })();

  return { done, writer };
});
const createUIMessageStreamResponse = mock(async ({ headers, stream }) => {
  await stream.done;
  return new Response("ok", { headers, status: 200 });
});
const generateId = mock(() => "stream-id");
const smoothStream = mock(() => undefined);
const stepCountIs = mock(() => ({ kind: "stop-when" }));
const tool = mock((config) => config);

class MockToolLoopAgent {
  constructor(config) {
    aiTestState.agentConfig = config;
  }
}

const attachmentDownloadHandler = { kind: "download-handler" };
const createAttachmentDownloadHandler = mock(() => attachmentDownloadHandler);

const resolvedChatModel = {
  languageModel: { kind: "chat-model" },
  providerId: "openai",
  providerOptions: { openai: { reasoningEffort: "high" } },
  requestedModelId: "openai:gpt-5.2",
  responseModelId: "gpt-5.2",
};
const resolveThreadChatModel = mock(async () => resolvedChatModel);

const resolvedTitleModel = {
  languageModel: { kind: "title-model" },
  providerId: "openai",
  requestedModelId: "openai:gpt-4.1-nano",
  responseModelId: "gpt-4.1-nano",
};
const resolveThreadTitleModel = mock(async () => resolvedTitleModel);
const generateThreadTitle = mock(async () => "Fast title");
const getSystemPrompt = mock(async () => "System prompt");

const buildPersistedAssistantMessage = mock(
  ({ assistantId, finalAssistant, placeholder }) =>
    finalAssistant
      ? { ...finalAssistant, id: assistantId }
      : { ...placeholder, id: assistantId },
);

const tracker = {
  finalize: mock((messages, responseMessage) => [...messages, responseMessage]),
  getMessageMetadata: mock(() => ({})),
};
const createReasoningMetadataTracker = mock(() => tracker);

const buildActiveThreadMessages = mock((records) => records);
const getLatestVisibleMessageId = mock(() => null);
const getMessageRecordById = mock(() => undefined);
const validateThreadUIMessage = mock(async (message) => message);
const validateThreadUIMessages = mock(async (messages) => messages);

const loadThreadMessages = mock(async () => []);
const ensureThread = mock(async () => ({ created: true }));
const updateThreadChatSettings = mock(() => {});
const upsertMessage = mock(() => {});
const setActiveMessage = mock(async () => {});
const clearActiveStream = mock(() => {});
const updateThreadTitle = mock(() => {});
const setActiveStream = mock(() => {});
const updateMessageMetadata = mock(async () => {});

const createNewResumableStream = mock(async () => {});
const findWorkspace = mock(async () => ({ rootPath: "/tmp/workspace-1" }));
const findUser = mock(async () => ({ permissionMode: "default" }));

mock.module("ai", () => ({
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  smoothStream,
  stepCountIs,
  tool,
  ToolLoopAgent: MockToolLoopAgent,
}));

mock.module("./attachments", () => ({
  createAttachmentDownloadHandler,
}));

mock.module("./model", () => ({
  resolveThreadChatModel,
}));

mock.module("./title-model", () => ({
  resolveThreadTitleModel,
}));

mock.module("./title", () => ({
  generateThreadTitle,
}));

mock.module("./system-prompt", () => ({
  getSystemPrompt,
}));

mock.module("./finalize-assistant", () => ({
  buildPersistedAssistantMessage,
}));

mock.module("./reasoning-metadata", () => ({
  createReasoningMetadataTracker,
}));

mock.module("../thread-branches", () => ({
  buildActiveThreadMessages,
  getLatestVisibleMessageId,
  getMessageRecordById,
}));

mock.module("../ui-messages", () => ({
  validateThreadUIMessage,
  validateThreadUIMessages,
}));

mock.module("./persistence", () => ({
  clearActiveStream,
  ensureThread,
  loadThreadMessages,
  setActiveMessage,
  setActiveStream,
  updateMessageMetadata,
  updateThreadChatSettings,
  updateThreadTitle,
  upsertMessage,
}));

mock.module("@/lib/streams", () => ({
  streamContext: {
    createNewResumableStream,
  },
}));

mock.module("@/server/db", () => ({
  db: {
    query: {
      users: {
        findFirst: findUser,
      },
      workspaces: {
        findFirst: findWorkspace,
      },
    },
  },
}));

mock.module("@/server/db/schema", () => ({
  users: {
    id: "user.id",
  },
  workspaces: {
    id: "workspace.id",
    isArchived: "workspace.isArchived",
    userId: "workspace.userId",
  },
}));

const { runThreadChat } = await import("./index");

function createUserMessage(text: string) {
  return {
    id: "user-message-1",
    metadata: {},
    parts: [{ text, type: "text" }],
    role: "user",
  };
}

function createAssistantApprovalMessage() {
  return {
    id: "assistant-existing",
    metadata: {
      branchId: "branch-1",
      parentMessageId: "user-message-1",
      status: "completed",
    },
    parts: [
      {
        approval: { id: "approval-1" },
        input: { command: "pwd", rationale: "Confirm workspace path" },
        state: "approval-responded",
        toolCallId: "tool-call-1",
        type: "tool-shell_command",
      },
    ],
    role: "assistant",
  };
}

function createPersistedUserMessage(text: string) {
  return {
    createdAt: new Date("2026-03-10T10:00:00.000Z"),
    id: "db-user-message-1",
    messageId: "user-message-1",
    metadata: { isActive: true, status: "completed" },
    parts: [{ text, type: "text" }],
    role: "user",
    updatedAt: new Date("2026-03-10T10:00:00.000Z"),
  };
}

function createPersistedAssistantToolMessage() {
  return {
    createdAt: new Date("2026-03-10T10:00:01.000Z"),
    id: "assistant-tool-1",
    messageId: "assistant-tool-1",
    metadata: {
      branchId: "user-message-1",
      isActive: true,
      parentMessageId: "user-message-1",
      status: "completed",
    },
    parts: [
      {
        input: { command: "pwd", rationale: "Confirm workspace path" },
        output: {
          cwd: "/tmp/workspace-1",
          durationMs: 24,
          exitCode: 0,
          phase: "completed",
          stderr: "",
          stdout: "/tmp/workspace-1",
          truncated: false,
        },
        state: "output-available",
        toolCallId: "tool-call-regenerate",
        type: "tool-shell_command",
      },
      { text: "Workspace confirmed", type: "text" },
    ],
    role: "assistant",
    updatedAt: new Date("2026-03-10T10:00:01.000Z"),
  };
}

function createSubmitRequest({
  message = createUserMessage("Summarize the refactor"),
  messages,
  messageId,
  modelId = "openai:gpt-5.2",
  reasoningEffort = "high",
  trigger = "submit-user-message",
} = {}) {
  return {
    id: "thread-1",
    message,
    ...(messages ? { messages } : {}),
    ...(messageId ? { messageId } : {}),
    modelId,
    reasoningEffort,
    trigger,
    workspaceId: "workspace-1",
  };
}

function createRetryRequest(
  trigger: "retry-assistant-message" | "regenerate-assistant-message",
) {
  return {
    id: "thread-1",
    messageId: "assistant-1",
    messages: [createPersistedUserMessage("Existing conversation")],
    modelId: "openai:gpt-5.2",
    workspaceId: "workspace-1",
    trigger,
  };
}

beforeEach(() => {
  aiTestState.agentConfig = null;
  aiState.streamChunks = [];
  aiState.assistantResponseMessage = {
    id: "assistant-response",
    metadata: {},
    parts: [{ text: "Assistant response", type: "text" }],
    role: "assistant",
  };

  loadThreadMessages.mockImplementation(async () => []);
  resolveThreadTitleModel.mockImplementation(async () => resolvedTitleModel);
  generateThreadTitle.mockImplementation(async () => "Fast title");
  findUser.mockImplementation(async () => ({ permissionMode: "default" }));
  findWorkspace.mockImplementation(async () => ({ rootPath: "/tmp/workspace-1" }));
});

afterEach(() => {
  mock.clearAllMocks();
  mock.restore();
});

describe("runThreadChat title generation", () => {
  it("uses the provider-specific fast title model and keeps thread chat settings on the selected model", async () => {
    const response = await runThreadChat(createSubmitRequest(), "user-1");

    expect(response.status).toBe(200);
    expect(resolveThreadTitleModel).toHaveBeenCalledWith({
      providerId: "openai",
      userId: "user-1",
    });
    expect(generateThreadTitle).toHaveBeenCalledTimes(1);
    expect(generateThreadTitle.mock.calls[0][0]).toEqual({
      firstUserText: "Summarize the refactor",
      model: resolvedTitleModel,
    });
    expect(updateThreadChatSettings).toHaveBeenCalledWith("thread-1", {
      modelId: "openai:gpt-5.2",
      reasoningEffort: "high",
    });
    expect(updateThreadTitle).toHaveBeenCalledWith("thread-1", "Fast title");
    expect(aiTestState.agentConfig?.instructions).toContain(
      "Default directory: /tmp/workspace-1",
    );
    expect(aiTestState.agentConfig?.instructions).toContain("Permission mode: default");
    expect(aiTestState.agentConfig?.tools).toHaveProperty("list");
    expect(aiTestState.agentConfig?.tools).toHaveProperty("grep");
    expect(aiTestState.agentConfig?.tools).toHaveProperty("shell_command");
  });

  it("skips title generation for non-new threads", async () => {
    loadThreadMessages.mockImplementation(async () => [
      createPersistedUserMessage("Existing conversation"),
    ]);

    await runThreadChat(createSubmitRequest(), "user-1");

    expect(resolveThreadTitleModel).not.toHaveBeenCalled();
    expect(generateThreadTitle).not.toHaveBeenCalled();
    expect(updateThreadTitle).not.toHaveBeenCalled();
  });

  it("skips title generation for retry, regenerate, and edit flows", async () => {
    await runThreadChat(createRetryRequest("retry-assistant-message"), "user-1");
    await runThreadChat(
      createRetryRequest("regenerate-assistant-message"),
      "user-1",
    );
    await runThreadChat(
      createSubmitRequest({
        message: createUserMessage("Edited prompt"),
        messageId: "user-message-1",
        trigger: "edit-user-message",
      }),
      "user-1",
    );

    expect(resolveThreadTitleModel).not.toHaveBeenCalled();
    expect(generateThreadTitle).not.toHaveBeenCalled();
    expect(updateThreadTitle).not.toHaveBeenCalled();
  });

  it("keeps the fallback title when the first user text is empty", async () => {
    await runThreadChat(
      createSubmitRequest({
        message: {
          id: "user-message-1",
          metadata: {},
          parts: [{ text: "   ", type: "text" }],
          role: "user",
        },
      }),
      "user-1",
    );

    expect(ensureThread).toHaveBeenCalledWith(
      "thread-1",
      "user-1",
      "workspace-1",
      "   ",
    );
    expect(resolveThreadTitleModel).not.toHaveBeenCalled();
    expect(generateThreadTitle).not.toHaveBeenCalled();
    expect(updateThreadTitle).not.toHaveBeenCalled();
  });
});

describe("runThreadChat approvals and lifecycle", () => {
  it("reuses the existing assistant id for approval continuation", async () => {
    const assistantMessage = createAssistantApprovalMessage();
    const responseMessage = {
      ...assistantMessage,
      parts: [
        ...assistantMessage.parts,
        { text: "Approved command result", type: "text" },
      ],
    };
    aiState.assistantResponseMessage = responseMessage;

    const request = {
      id: "thread-1",
      messages: [createUserMessage("inspect workspace"), assistantMessage],
      trigger: "submit-tool-approval",
      workspaceId: "workspace-1",
    };

    const response = await runThreadChat(request, "user-1");

    expect(response.status).toBe(200);
    expect(createAgentUIStream).toHaveBeenCalledWith(
      expect.objectContaining({
        generateMessageId: expect.any(Function),
        uiMessages: request.messages,
      }),
    );
    expect(setActiveMessage).toHaveBeenCalledWith("thread-1", "assistant-existing");
    expect(buildPersistedAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: "assistant-existing",
      }),
    );
  });

  it("disposes shell sessions when the stream is stopped", async () => {
    const response = await runThreadChat(
      {
        id: "thread-1",
        messageId: "assistant-1",
        trigger: "stop-stream",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(response.status).toBe(204);
    expect(updateMessageMetadata).toHaveBeenCalledWith("thread-1", "assistant-1", {
      errorMessage: "Generation stopped.",
      status: "cancelled",
    });
  });

  it("disables shell tooling when the workspace root is unavailable", async () => {
    findWorkspace.mockImplementation(async () => ({ rootPath: null }));

    await runThreadChat(createSubmitRequest(), "user-1");

    expect(aiTestState.agentConfig?.tools).toBeUndefined();
    expect(aiTestState.agentConfig?.instructions).toContain(
      "Tool execution is currently unavailable because there is no selected workspace root.",
    );
  });

  it("regenerates tool-bearing assistant messages from persisted transcript instead of stale client messages", async () => {
    const persistedUser = createPersistedUserMessage("Inspect the workspace");
    const persistedAssistant = createPersistedAssistantToolMessage();

    loadThreadMessages.mockImplementation(async () => [
      persistedUser,
      persistedAssistant,
    ]);
    getMessageRecordById.mockImplementation(() => ({
      parentMessageId: "user-message-1",
    }));

    const staleClientMessages = [
      createUserMessage("Inspect the workspace"),
      {
        id: "assistant-tool-1",
        metadata: {
          branchId: "user-message-1",
          parentMessageId: "user-message-1",
          status: "completed",
        },
        parts: [
          {
            approval: { id: "approval-stale" },
            input: { command: "pwd", rationale: "Confirm workspace path" },
            state: "approval-requested",
            toolCallId: "tool-call-regenerate",
            type: "tool-shell_command",
          },
        ],
        role: "assistant",
      },
    ];

    await runThreadChat(
      {
        id: "thread-1",
        messageId: "assistant-tool-1",
        messages: staleClientMessages,
        trigger: "regenerate-assistant-message",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(createAgentUIStream).toHaveBeenCalledWith(
      expect.objectContaining({
        originalMessages: [persistedUser],
        uiMessages: [persistedUser],
      }),
    );
  });
});
