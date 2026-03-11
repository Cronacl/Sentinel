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
} from "@/lib/ai/thread-message-types";

import { createAttachmentDownloadHandler } from "../attachments";
import { buildPersistedAssistantMessage } from "../finalize-assistant";
import { resolveThreadChatModel } from "../model";
import * as persist from "../persistence";
import { createReasoningMetadataTracker } from "../reasoning-metadata";
import { disposeShellSession } from "../shell-session";
import { getSystemPrompt } from "../system-prompt";
import { createThreadAgent } from "../thread-agent";
import { resolveThreadTitleModel } from "../title-model";
import { generateThreadTitle } from "../title";
import { parseRequest } from "./parse-request";
import {
  buildActiveThreadMessages,
  buildModelTranscript,
  getFirstUserText,
  getParentMessageId,
} from "./transcript";
import { getWorkspaceRootPath } from "./workspace";

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
  const shellEnabled = Boolean(workspaceRoot);
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

  const systemPrompt = await getSystemPrompt(request.userId);
  const agent = createThreadAgent({
    attachmentDownload: createAttachmentDownloadHandler(),
    languageModel: resolvedModel.languageModel,
    providerOptions: resolvedModel.providerOptions,
    shellEnabled,
    systemPrompt,
    threadId: request.threadId,
    ...(workspaceRoot ? { workspaceRoot } : {}),
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
