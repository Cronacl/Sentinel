import {
  buildActiveThreadMessages,
  getMessageRecordById,
  getLatestVisibleMessageId,
  type PersistedThreadMessageRecord,
} from "../thread-branches";
import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "../thread-message-types";

import type {
  ChatPersistenceAdapter,
  ThreadChatRequest,
  ThreadConversationState,
} from "./types";

function getFirstUserText(messages: ThreadUIMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");

  return (
    firstUserMessage?.parts.find(
      (
        part,
      ): part is Extract<(typeof firstUserMessage.parts)[number], { type: "text" }> =>
        part.type === "text",
    )?.text ?? null
  );
}

export function deriveThreadTitle(messages: ThreadUIMessage[]) {
  return getFirstUserText(messages)?.slice(0, 100) ?? "New thread";
}

function withBranchMetadata(
  message: ThreadUIMessage,
  metadata: NonNullable<ThreadUIMessage["metadata"]>,
) {
  return {
    ...message,
    metadata: mergeThreadMessageMetadata(message.metadata, metadata),
  };
}

export async function buildConversationState(
  request: ThreadChatRequest,
  persistence: ChatPersistenceAdapter,
): Promise<ThreadConversationState> {
  const existingMessages = await persistence.getThreadMessages(request.threadId);
  const transcript = buildActiveThreadMessages(existingMessages);
  const targetMessage =
    request.messageId != null
      ? existingMessages.find((message) => message.messageId === request.messageId)
      : undefined;

  return {
    existingMessages,
    isNewThread: existingMessages.length === 0,
    request,
    ...(targetMessage ? { targetMessage } : {}),
    transcript,
  };
}

export async function ensureThreadForChat(
  conversation: ThreadConversationState,
  persistence: ChatPersistenceAdapter,
) {
  const baseMessages =
    conversation.transcript.length > 0
      ? conversation.transcript
      : conversation.request.message
        ? [conversation.request.message]
        : [];

  return persistence.ensureThread({
    threadId: conversation.request.threadId,
    title: deriveThreadTitle(baseMessages),
    userId: conversation.request.userId,
    workspaceId: conversation.request.workspaceId,
  });
}

export function buildModelTranscript(conversation: ThreadConversationState) {
  const { request, transcript } = conversation;

  switch (request.trigger) {
    case "submit-user-message":
      return request.message ? [...transcript, request.message] : transcript;
    case "edit-user-message": {
      const targetIndex = transcript.findIndex(
        (message) => message.id === request.messageId,
      );
      if (targetIndex === -1 || !request.message) {
        return transcript;
      }

      return [
        ...transcript.slice(0, targetIndex),
        withBranchMetadata(request.message, {
          branchId: request.message.id,
          editedFromMessageId: request.messageId,
          isActive: true,
          parentMessageId:
            transcript[targetIndex - 1]?.id ??
            getMessageRecordById(
              conversation.existingMessages,
              request.messageId ?? "",
            )?.parentMessageId ??
            null,
          status: "completed",
        }),
      ];
    }
    case "retry-assistant-message":
    case "regenerate-assistant-message": {
      const targetIndex = transcript.findIndex(
        (message) => message.id === request.messageId,
      );
      if (targetIndex === -1) {
        return transcript;
      }

      const keepUntil =
        transcript[targetIndex]?.role === "assistant" ? targetIndex : targetIndex + 1;
      return transcript.slice(0, keepUntil);
    }
    case "stop-stream":
      return transcript;
    default:
      return transcript;
  }
}

export function getFirstConversationUserText(conversation: ThreadConversationState) {
  return (
    getFirstUserText(conversation.transcript) ??
    (conversation.request.message
      ? getFirstUserText([conversation.request.message])
      : null)
  );
}

export function getParentMessageIdForAssistant(
  conversation: ThreadConversationState,
) {
  switch (conversation.request.trigger) {
    case "submit-user-message":
      return (
        conversation.request.message?.id ??
        getLatestVisibleMessageId(conversation.existingMessages)
      );
    case "edit-user-message":
      return conversation.request.message?.id ?? null;
    case "retry-assistant-message":
    case "regenerate-assistant-message":
      return (
        getMessageRecordById(
          conversation.existingMessages,
          conversation.request.messageId ?? "",
        )?.parentMessageId ?? null
      );
    default:
      return null;
  }
}
