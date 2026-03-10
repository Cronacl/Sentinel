// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const aiState = {
  assistantResponseMessage: {
    id: "assistant-response",
    metadata: {},
    parts: [{ text: "Assistant response", type: "text" }],
    role: "assistant",
  },
  modelMessages: [],
  streamChunks: [],
};

const convertToModelMessages = mock(async () => aiState.modelMessages);
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
const streamText = mock(() => ({
  toUIMessageStream: () => ({ kind: "ui-stream" }),
}));

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

const buildPersistedAssistantMessage = mock(
  ({ assistantId, finalAssistant, placeholder }) =>
    finalAssistant
      ? { ...finalAssistant, id: assistantId }
      : { ...placeholder, id: assistantId },
);

const tracker = {
  finalize: mock((messages, responseMessage) => [
    ...messages,
    responseMessage,
  ]),
  getMessageMetadata: mock(() => ({})),
};
const createReasoningMetadataTracker = mock(() => tracker);

const buildActiveThreadMessages = mock((records) => records);
const getLatestVisibleMessageId = mock(() => null);
const getMessageRecordById = mock(() => undefined);
const validateThreadUIMessage = mock(async (message) => message);

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

mock.module("ai", () => ({
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  smoothStream,
  streamText,
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

const { runThreadChat } = await import("./index");

function createUserMessage(text: string) {
  return {
    id: "user-message-1",
    metadata: {},
    parts: [{ text, type: "text" }],
    role: "user",
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

function createSubmitRequest({
  message = createUserMessage("Summarize the refactor"),
  messageId,
  modelId = "openai:gpt-5.2",
  reasoningEffort = "high",
  trigger = "submit-user-message",
}: {
  message?: ReturnType<typeof createUserMessage>;
  messageId?: string;
  modelId?: string;
  reasoningEffort?: string;
  trigger?: "submit-user-message" | "edit-user-message";
} = {}) {
  return {
    id: "thread-1",
    message,
    ...(messageId ? { messageId } : {}),
    modelId,
    reasoningEffort,
    trigger,
    userId: "ignored-by-handler",
    workspaceId: "workspace-1",
  };
}

function createRetryRequest(trigger: "retry-assistant-message" | "regenerate-assistant-message") {
  return {
    id: "thread-1",
    messageId: "assistant-1",
    modelId: "openai:gpt-5.2",
    workspaceId: "workspace-1",
    trigger,
  };
}

beforeEach(() => {
  aiState.modelMessages = [];
  aiState.streamChunks = [];
  aiState.assistantResponseMessage = {
    id: "assistant-response",
    metadata: {},
    parts: [{ text: "Assistant response", type: "text" }],
    role: "assistant",
  };

  resolvedChatModel.languageModel = { kind: "chat-model" };
  resolvedChatModel.providerId = "openai";
  resolvedChatModel.providerOptions = { openai: { reasoningEffort: "high" } };
  resolvedChatModel.requestedModelId = "openai:gpt-5.2";
  resolvedChatModel.responseModelId = "gpt-5.2";

  resolvedTitleModel.languageModel = { kind: "title-model" };
  resolvedTitleModel.providerId = "openai";
  resolvedTitleModel.providerOptions = undefined;
  resolvedTitleModel.requestedModelId = "openai:gpt-4.1-nano";
  resolvedTitleModel.responseModelId = "gpt-4.1-nano";

  loadThreadMessages.mockImplementation(async () => []);
  resolveThreadTitleModel.mockImplementation(async () => resolvedTitleModel);
  generateThreadTitle.mockImplementation(async () => "Fast title");
});

afterEach(() => {
  mock.clearAllMocks();
});

describe("runThreadChat title generation", () => {
  it("uses the provider-specific fast title model and keeps thread chat settings on the selected model", async () => {
    const response = await runThreadChat(
      createSubmitRequest(),
      "user-1",
    );

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
    expect(generateThreadTitle.mock.calls[0][0].model.requestedModelId).toBe(
      "openai:gpt-4.1-nano",
    );
    expect(generateThreadTitle.mock.calls[0][0].model.requestedModelId).not.toBe(
      resolvedChatModel.requestedModelId,
    );
    expect(generateThreadTitle.mock.calls[0][0].model.providerOptions).toBe(
      undefined,
    );
    expect(updateThreadChatSettings).toHaveBeenCalledTimes(1);
    expect(updateThreadChatSettings).toHaveBeenCalledWith("thread-1", {
      modelId: "openai:gpt-5.2",
      reasoningEffort: "high",
    });
    expect(updateThreadTitle).toHaveBeenCalledWith("thread-1", "Fast title");
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
