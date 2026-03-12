import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  smoothStream,
} from "ai";

import { streamContext } from "@/lib/streams";
import {
  mergeThreadMessageMetadata,
  normalizeThreadUIMessages,
  prepareMessagesForModel,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";

import { createAttachmentDownloadHandler } from "./attachments";
import { buildPersistedAssistantMessage } from "./finalize";
import { resolveThreadChatModel } from "../model";
import * as persist from "../persistence";
import { createReasoningMetadataTracker } from "./reasoning";
import { disposeShellSession } from "../tools/shell";
import { getSystemPrompt } from "./system-prompt";
import { createThreadAgent } from "../agent";
import {
  autosaveConversationMemories,
  buildMemoryPromptLines,
  extractLatestUserText,
  retrieveRelevantMemories,
} from "@/lib/memory/service";
import { resolveThreadTitleModel } from "../title/model";
import { generateThreadTitle } from "../title/generate";
import { parseRequest } from "./parse-request";
import {
  buildActiveThreadMessages,
  buildModelTranscript,
  getFirstUserText,
  getParentMessageId,
} from "./transcript";
import {
  getSearchProviderRuntime,
  getSearchSettings,
  getMemorySettings,
  getToolApprovalPolicies,
  getToolPermissionMode,
  getWebFetchSettings,
  getWorkspaceRootPath,
} from "./workspace";

export async function runThreadChat(rawInput: unknown, userId: string) {
  const request = await parseRequest(rawInput, userId);

  if (request.trigger === "stop-stream") {
    if (request.messageId) {
      await persist.updateMessageMetadata(request.threadId, request.messageId, {
        errorMessage: "Generation stopped.",
        status: "cancelled",
      });
    }
    await disposeShellSession(request.threadId);
    persist.clearActiveStream(request.threadId);
    return new Response(null, { status: 204 });
  }

  const allRecords = await persist.loadThreadMessages(request.threadId);
  const transcript = buildActiveThreadMessages(allRecords);
  const isNewThread = allRecords.length === 0;
  const targetMessage = request.messageId
    ? allRecords.find((m) => m.messageId === request.messageId)
    : undefined;
  const modelTranscript = buildModelTranscript(request, transcript, allRecords);

  const baseMessages =
    modelTranscript.length > 0
      ? modelTranscript
      : request.message
        ? [request.message]
        : [];
  const fallbackTitle =
    getFirstUserText(baseMessages)?.slice(0, 100) ?? "New thread";
  await persist.ensureThread(
    request.threadId,
    request.userId,
    request.workspaceId,
    fallbackTitle,
  );

  if (request.modelId) {
    persist.updateThreadChatSettings(request.threadId, {
      modelId: request.modelId,
      reasoningEffort: request.reasoningEffort ?? null,
    });
  }

  if (
    request.message &&
    (request.trigger === "submit-user-message" ||
      request.trigger === "edit-user-message")
  ) {
    const parentMessageId =
      request.trigger === "submit-user-message"
        ? (transcript.at(-1)?.id ?? targetMessage?.messageId ?? null)
        : (transcript.find((m) => m.id === request.messageId)?.metadata
            ?.parentMessageId ?? null);

    const userMsg: ThreadUIMessage = {
      ...request.message,
      metadata: mergeThreadMessageMetadata(request.message.metadata, {
        branchId: request.message.id,
        isActive: true,
        parentMessageId,
        status: "completed",
        ...(request.trigger === "edit-user-message" && request.messageId
          ? { editedFromMessageId: request.messageId }
          : {}),
      }),
    };

    persist.upsertMessage(request.threadId, userMsg);
    await persist.setActiveMessage(request.threadId, userMsg.id);
  }

  persist.clearActiveStream(request.threadId);

  const resolvedModel = await resolveThreadChatModel(request, targetMessage);
  const workspaceRoot = await getWorkspaceRootPath(
    request.workspaceId,
    request.userId,
  );
  const permissionMode = await getToolPermissionMode(request.userId);
  const memorySettings = await getMemorySettings(request.userId);
  const searchSettings = await getSearchSettings(request.userId);
  const searchProviders = await getSearchProviderRuntime(request.userId);
  const toolApprovalPolicies = await getToolApprovalPolicies(request.userId);
  const webFetchSettings = await getWebFetchSettings(request.userId);
  const toolsEnabled = Boolean(workspaceRoot);
  const continuationAssistant =
    request.trigger === "submit-tool-approval"
      ? [...modelTranscript]
          .reverse()
          .find((message) => message.role === "assistant")
      : undefined;

  const resolvedTitlePromise =
    isNewThread && request.trigger === "submit-user-message"
      ? (() => {
          const text = getFirstUserText(baseMessages);
          if (!text?.trim()) {
            return null;
          }

          return (async () => {
            const titleModel = await resolveThreadTitleModel({
              providerId: resolvedModel.providerId,
              userId: request.userId,
            });

            return generateThreadTitle({
              firstUserText: text,
              model: titleModel,
            });
          })();
        })()
      : null;

  const assistantId = continuationAssistant?.id ?? crypto.randomUUID();
  const parentId = getParentMessageId(request, allRecords);
  const placeholder: ThreadUIMessage = continuationAssistant
    ? {
        ...continuationAssistant,
        metadata: mergeThreadMessageMetadata(continuationAssistant.metadata, {
          isActive: true,
          model: {
            providerId: resolvedModel.providerId,
            requestedModelId: resolvedModel.requestedModelId,
          },
          parentMessageId:
            continuationAssistant.metadata?.parentMessageId ?? parentId,
          status: "pending",
        }),
      }
    : {
        id: assistantId,
        role: "assistant",
        parts: [{ text: " ", type: "text" }],
        metadata: {
          branchId:
            request.trigger === "edit-user-message"
              ? request.message?.id
              : (parentId ?? assistantId),
          isActive: true,
          model: {
            providerId: resolvedModel.providerId,
            requestedModelId: resolvedModel.requestedModelId,
          },
          parentMessageId: parentId,
          status: "pending",
        },
      };

  persist.upsertMessage(request.threadId, placeholder);
  await persist.setActiveMessage(request.threadId, assistantId);

  const memoryQuery = extractLatestUserText(baseMessages);
  const retrievedMemories = await retrieveRelevantMemories({
    query: memoryQuery,
    settings: memorySettings,
    userId: request.userId,
    workspaceId: request.workspaceId,
  }).catch(() => []);
  const systemPrompt = await getSystemPrompt(request.userId, {
    memory: buildMemoryPromptLines(retrievedMemories),
  });
  const agent = createThreadAgent({
    attachmentDownload: createAttachmentDownloadHandler(),
    ...(workspaceRoot ? { defaultDirectory: workspaceRoot } : {}),
    languageModel: resolvedModel.languageModel,
    memorySettings,
    permissionMode,
    providerOptions: resolvedModel.providerOptions,
    searchProviders,
    searchSettings,
    sourceMessageId: parentId,
    systemPrompt,
    threadId: request.threadId,
    userId: request.userId,
    toolApprovalPolicies,
    toolsEnabled,
    webFetchSettings,
    workspaceId: request.workspaceId,
  });

  const tracker = createReasoningMetadataTracker({
    clock: { now: () => Date.now() },
    providerId: resolvedModel.providerId,
    requestedModelId: resolvedModel.requestedModelId,
  });

  const agentMessages = prepareMessagesForModel(modelTranscript);
  let streamErrorMessage: string | undefined;

  const stream = createUIMessageStream({
    originalMessages: modelTranscript,
    execute: async ({ writer }) => {
      const result = await createAgentUIStream({
        agent,
        experimental_transform: smoothStream({ chunking: "line" }),
        generateMessageId: () => assistantId,
        messageMetadata: ({ part }) => tracker.getMessageMetadata(part),
        onError: (error) => {
          streamErrorMessage =
            error instanceof Error
              ? error.message
              : String(error ?? "Unknown error");
          return streamErrorMessage;
        },
        originalMessages: modelTranscript as never,
        sendReasoning: true,
        sendSources: true,
        uiMessages: agentMessages as never,
      });
      writer.merge(result as ReadableStream<any>);

      if (resolvedTitlePromise) {
        const title = await resolvedTitlePromise.catch(() => null);
        if (title) {
          persist.updateThreadTitle(request.threadId, title);
          writer.write({
            type: "data-thread-title",
            data: { threadId: request.threadId, title },
          });
          writer.write({
            type: "data-thread-invalidation",
            data: { target: "all", threadId: request.threadId },
          });
        }
      }
    },
    onFinish: async ({ responseMessage }) => {
      const finalized = tracker.finalize(
        [...modelTranscript, responseMessage as ThreadUIMessage],
        responseMessage as ThreadUIMessage,
      );
      const [finalAssistant] = normalizeThreadUIMessages(finalized).slice(-1);
      persist.upsertMessage(
        request.threadId,
        buildPersistedAssistantMessage({
          assistantId,
          ...(streamErrorMessage ? { errorMessage: streamErrorMessage } : {}),
          finalAssistant,
          placeholder,
        }),
      );

      if (!streamErrorMessage) {
        void autosaveConversationMemories({
          messages: [...modelTranscript, responseMessage as ThreadUIMessage],
          model: resolvedModel.languageModel,
          providerOptions: resolvedModel.providerOptions,
          settings: memorySettings,
          sourceMessageId: assistantId,
          threadId: request.threadId,
          userId: request.userId,
          workspaceId: request.workspaceId,
        });
      }

      persist.clearActiveStream(request.threadId);
    },
  });

  return createUIMessageStreamResponse({
    headers: {
      "Content-Encoding": "none",
    },
    stream,
    async consumeSseStream({ stream: sseStream }) {
      const streamId = generateId();
      persist.setActiveStream(request.threadId, streamId);
      try {
        await streamContext.createNewResumableStream(streamId, () => sseStream);
      } catch (error) {
        persist.clearActiveStream(request.threadId);
        throw error;
      }
    },
  });
}
