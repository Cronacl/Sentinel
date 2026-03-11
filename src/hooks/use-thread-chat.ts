"use client";

import { useChat } from "@ai-sdk/react";
import type { ChatOnDataCallback, FileUIPart } from "ai";
import { DefaultChatTransport } from "ai";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { ReasoningEffort } from "@/lib/ai/providers/models";
import {
  getThreadMessageSyncToken,
  normalizeThreadUIMessages,
  type ThreadUIMessage,
  threadMessageMetadataSchema,
} from "@/lib/ai/messages/types";

type UseThreadChatOptions = {
  threadId: string;
  initialMessages?: ThreadUIMessage[];
  workspaceId: string;
  onData?: ChatOnDataCallback<ThreadUIMessage>;
  onFinish?: () => void;
  onError?: (error: Error) => void;
};

type SendThreadMessageInput = {
  files?: FileUIPart[];
  modelId: string;
  reasoningEffort?: ReasoningEffort | null;
  text: string;
};

type EditThreadMessageInput = SendThreadMessageInput & {
  targetMessageId: string;
};

function getLastUserMessage(messages: ThreadUIMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user");
}

function getLastAssistantMessage(messages: ThreadUIMessage[]) {
  return [...messages].reverse().find((message) => message.role === "assistant");
}

function getMessageSyncSignature(messages: ThreadUIMessage[]) {
  return messages.map(getThreadMessageSyncToken).join("||");
}

export function useThreadChat({
  threadId,
  initialMessages = [],
  workspaceId,
  onData,
  onFinish,
  onError,
}: UseThreadChatOptions) {
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ThreadUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({
          id,
          messageId,
          messages,
          trigger,
          body,
        }) => {
          const requestBody = (body ?? {}) as Record<string, unknown>;

          if (trigger === "submit-message") {
            const isToolApprovalSubmit =
              lastAssistantMessageIsCompleteWithApprovalResponses({ messages }) &&
              getLastAssistantMessage(messages)?.id === messages.at(-1)?.id;

            return {
              body: {
                id,
                message:
                  requestBody.trigger === "edit-user-message"
                    ? getLastUserMessage(messages)
                    : getLastUserMessage(messages) ?? messages[messages.length - 1],
                messageId:
                  typeof requestBody.messageId === "string"
                    ? requestBody.messageId
                    : messageId,
                messages,
                modelId:
                  typeof requestBody.modelId === "string"
                    ? requestBody.modelId
                    : undefined,
                reasoningEffort:
                  typeof requestBody.reasoningEffort === "string"
                    ? requestBody.reasoningEffort
                    : undefined,
                trigger:
                  requestBody.trigger === "edit-user-message"
                    ? "edit-user-message"
                    : isToolApprovalSubmit
                      ? "submit-tool-approval"
                    : "submit-user-message",
                workspaceId:
                  typeof requestBody.workspaceId === "string"
                    ? requestBody.workspaceId
                    : workspaceIdRef.current,
              },
            };
          }

          if (trigger === "regenerate-message") {
            return {
              body: {
                id,
                messageId,
                messages,
                trigger:
                  requestBody.trigger === "retry-assistant-message"
                    ? "retry-assistant-message"
                    : "regenerate-assistant-message",
                workspaceId:
                  typeof requestBody.workspaceId === "string"
                    ? requestBody.workspaceId
                    : workspaceIdRef.current,
              },
            };
          }

          return {
            body: {
              ...requestBody,
              id,
              ...(messageId ? { messageId } : {}),
              workspaceId:
                typeof requestBody.workspaceId === "string"
                  ? requestBody.workspaceId
                  : workspaceIdRef.current,
            },
          };
        },
        prepareReconnectToStreamRequest: ({ id }) => ({
          api: `/api/chat/${id}/stream`,
        }),
      }),
    [],
  );

  const normalizedInitialMessages = useMemo(
    () => normalizeThreadUIMessages(initialMessages),
    [initialMessages],
  );
  const initialMessagesSignature = useMemo(
    () => getMessageSyncSignature(normalizedInitialMessages),
    [normalizedInitialMessages],
  );

  const chat = useChat<ThreadUIMessage>({
    id: threadId,
    messages: normalizedInitialMessages,
    messageMetadataSchema: threadMessageMetadataSchema,
    onData,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    transport,
    onFinish,
    onError,
    resume: true,
  });
  const lastSyncedSignatureRef = useRef(initialMessagesSignature);
  const syncedThreadIdRef = useRef(threadId);

  useEffect(() => {
    if (syncedThreadIdRef.current !== threadId) {
      syncedThreadIdRef.current = threadId;
      lastSyncedSignatureRef.current = initialMessagesSignature;
      chat.setMessages(normalizedInitialMessages);
      return;
    }

    if (lastSyncedSignatureRef.current === initialMessagesSignature) {
      return;
    }

    if (chat.status === "submitted" || chat.status === "streaming") {
      return;
    }

    lastSyncedSignatureRef.current = initialMessagesSignature;
    chat.setMessages(normalizedInitialMessages);
  }, [
    chat.setMessages,
    chat.status,
    initialMessagesSignature,
    normalizedInitialMessages,
    threadId,
  ]);

  const sendMessage = useCallback(
    ({ files, modelId, reasoningEffort, text }: SendThreadMessageInput) => {
      return chat.sendMessage(
        {
          ...(files && files.length > 0 ? { files } : {}),
          metadata: {},
          text,
        },
        {
          body: {
            modelId,
            ...(reasoningEffort ? { reasoningEffort } : {}),
            trigger: "submit-user-message",
            workspaceId: workspaceIdRef.current,
          },
        },
      );
    },
    [chat],
  );

  const editMessage = useCallback(
    ({
      files,
      modelId,
      reasoningEffort,
      targetMessageId,
      text,
    }: EditThreadMessageInput) => {
      const fileParts = files ?? [];
      const nextMessage: ThreadUIMessage = {
        id: crypto.randomUUID(),
        metadata: {},
        parts: [
          ...fileParts,
          ...(text ? [{ text, type: "text" as const }] : []),
        ],
        role: "user",
      };
      const targetIndex = chat.messages.findIndex(
        (message) => message.id === targetMessageId,
      );

      if (targetIndex >= 0) {
        chat.setMessages(chat.messages.slice(0, targetIndex));
      }

      return chat.sendMessage(nextMessage, {
        body: {
          messageId: targetMessageId,
          modelId,
          ...(reasoningEffort ? { reasoningEffort } : {}),
          trigger: "edit-user-message",
          workspaceId: workspaceIdRef.current,
        },
      });
    },
    [chat],
  );

  const regenerateMessage = useCallback(
    (messageId: string) => {
      return chat.regenerate({
        body: {
          trigger: "regenerate-assistant-message",
          workspaceId: workspaceIdRef.current,
        },
        messageId,
      });
    },
    [chat],
  );

  const retryMessage = useCallback(
    (messageId: string) => {
      return chat.regenerate({
        body: {
          trigger: "retry-assistant-message",
          workspaceId: workspaceIdRef.current,
        },
        messageId,
      });
    },
    [chat],
  );

  return {
    ...chat,
    editMessage,
    regenerateMessage,
    retryMessage,
    sendMessage,
  };
}
