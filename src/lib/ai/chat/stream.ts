import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";

import {
  mergeThreadMessageMetadata,
  normalizeThreadUIMessages,
  type ThreadUIMessage,
} from "../thread-message-types";

import { createAttachmentDownloadHandler } from "./attachments";
import type { ReasoningMetadataTracker } from "./reasoning-metadata";
import { generateThreadTitle } from "./title";
import {
  buildModelTranscript,
  getFirstConversationUserText,
  getParentMessageIdForAssistant,
} from "./thread";
import type {
  ChatPersistenceAdapter,
  ResolvedThreadChatModel,
  ThreadConversationState,
} from "./types";

function createAssistantPlaceholderMessage({
  conversation,
  messageId,
  resolvedModel,
}: {
  conversation: ThreadConversationState;
  messageId: string;
  resolvedModel: ResolvedThreadChatModel;
}): ThreadUIMessage {
  const parentMessageId = getParentMessageIdForAssistant(conversation);
  const branchId =
    conversation.request.trigger === "edit-user-message"
      ? conversation.request.message?.id
      : parentMessageId ?? messageId;

  return {
    id: messageId,
    metadata: {
      branchId,
      isActive: true,
      model: {
        providerId: resolvedModel.providerId,
        requestedModelId: resolvedModel.requestedModelId,
      },
      parentMessageId,
      status: "pending",
    },
    parts: [{ text: " ", type: "text" }],
    role: "assistant",
  };
}

async function persistUserOperationState(
  conversation: ThreadConversationState,
  persistence: ChatPersistenceAdapter,
) {
  const { request } = conversation;

  if (!request.message) {
    return;
  }

  if (request.trigger === "submit-user-message") {
    const parentMessageId =
      conversation.transcript.at(-1)?.id ??
      conversation.targetMessage?.messageId ??
      null;

    const message = {
      ...request.message,
      metadata: mergeThreadMessageMetadata(request.message.metadata, {
        branchId: request.message.id,
        isActive: true,
        parentMessageId,
        status: "completed",
      }),
    };

    await persistence.upsertThreadMessage({
      message,
      threadId: request.threadId,
    });
    await persistence.setActiveMessage({
      messageId: message.id,
      threadId: request.threadId,
    });
    return;
  }

  if (request.trigger === "edit-user-message") {
    const parentMessageId =
      conversation.request.messageId != null
        ? conversation.transcript.find(
            (message) => message.id === conversation.request.messageId,
          )?.metadata?.parentMessageId ?? null
        : null;

    const message = {
      ...request.message,
      metadata: mergeThreadMessageMetadata(request.message.metadata, {
        branchId: request.message.id,
        editedFromMessageId: request.messageId,
        isActive: true,
        parentMessageId,
        status: "completed",
      }),
    };

    await persistence.upsertThreadMessage({
      message,
      threadId: request.threadId,
    });
    await persistence.setActiveMessage({
      messageId: message.id,
      threadId: request.threadId,
    });
  }
}

export async function createThreadChatResponse({
  conversation,
  persistence,
  resolvedModel,
  tracker,
}: {
  conversation: ThreadConversationState;
  persistence: ChatPersistenceAdapter;
  resolvedModel: ResolvedThreadChatModel;
  tracker: ReasoningMetadataTracker;
}) {
  if (conversation.request.trigger === "stop-stream") {
    if (conversation.request.messageId) {
      await persistence.updateThreadMessageMetadata({
        messageId: conversation.request.messageId,
        metadata: {
          errorMessage: "Generation stopped.",
          status: "cancelled",
        },
        threadId: conversation.request.threadId,
      });
    }

    return new Response(null, { status: 204 });
  }

  await persistUserOperationState(conversation, persistence);

  const assistantMessageId = crypto.randomUUID();
  const placeholderMessage = createAssistantPlaceholderMessage({
    conversation,
    messageId: assistantMessageId,
    resolvedModel,
  });

  await persistence.upsertThreadMessage({
    message: placeholderMessage,
    threadId: conversation.request.threadId,
  });
  await persistence.setActiveMessage({
    messageId: assistantMessageId,
    threadId: conversation.request.threadId,
  });

  const modelTranscript = buildModelTranscript(conversation);
  let streamErrorMessage: string | undefined;

  const result = streamText({
    model: resolvedModel.languageModel as Parameters<typeof streamText>[0]["model"],
    experimental_download: createAttachmentDownloadHandler(),
    messages: await convertToModelMessages(modelTranscript),
    onError: ({ error }) => {
      streamErrorMessage =
        error instanceof Error ? error.message : String(error ?? "Unknown error");
    },
    ...(resolvedModel.providerOptions
      ? { providerOptions: resolvedModel.providerOptions }
      : {}),
  });

  const stream = createUIMessageStream<ThreadUIMessage>({
    execute: ({ writer }) => {
      writer.merge(
        result.toUIMessageStream({
          generateMessageId: () => assistantMessageId,
          messageMetadata: ({ part }) => tracker.getMessageMetadata(part),
          sendReasoning: true,
          sendSources: true,
        }),
      );

      const firstUserText = getFirstConversationUserText(conversation);
      if (!conversation.isNewThread || !firstUserText?.trim()) {
        return;
      }

      return (async () => {
        const title = await generateThreadTitle({
          firstUserText,
          model: resolvedModel,
        }).catch(() => null);

        if (!title) {
          return;
        }

        await persistence.updateThreadTitle({
          threadId: conversation.request.threadId,
          title,
        });

        writer.write({
          data: {
            threadId: conversation.request.threadId,
            title,
          },
          transient: true,
          type: "data-thread-title",
        });
        writer.write({
          data: {
            target: "all",
            threadId: conversation.request.threadId,
          },
          transient: true,
          type: "data-thread-invalidation",
        });
      })();
    },
    onFinish: async ({
      finishReason,
      isAborted,
      messages,
      responseMessage,
    }) => {
      const [finalAssistantMessage] = normalizeThreadUIMessages(
        tracker.finalize(
          [
            ...modelTranscript,
            responseMessage as ThreadUIMessage,
          ] as ThreadUIMessage[],
          responseMessage as ThreadUIMessage,
        ),
      ).slice(-1);

      const mergedResponse = finalAssistantMessage ?? placeholderMessage;
      const status = streamErrorMessage
        ? "error"
        : isAborted
          ? "cancelled"
          : finishReason === "error"
            ? "error"
            : "completed";

      await persistence.upsertThreadMessage({
        message: {
          ...mergedResponse,
          id: assistantMessageId,
          metadata: mergeThreadMessageMetadata(mergedResponse.metadata, {
            ...(streamErrorMessage ? { errorMessage: streamErrorMessage } : {}),
            finishReason: finishReason ?? mergedResponse.metadata?.finishReason,
            isActive: true,
            status,
          }),
        },
        threadId: conversation.request.threadId,
      });
    },
    originalMessages: modelTranscript,
  });

  return createUIMessageStreamResponse({ stream });
}
