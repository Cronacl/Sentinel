"use client";

import { useChat } from "@ai-sdk/react";
import type { ChatOnDataCallback, FileUIPart } from "ai";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";

import type { ReasoningEffort } from "@/lib/ai/models";
import {
  getThreadMessageSyncToken,
  normalizeThreadUIMessages,
  type ThreadUIMessage,
  threadMessageMetadataSchema,
} from "@/lib/ai/thread-message-types";

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

function getMessageIndex(messages: ThreadUIMessage[], messageId: string) {
  return messages.findIndex((message) => message.id === messageId);
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
            return {
              body: {
                id,
                message:
                  requestBody.trigger === "edit-user-message"
                    ? getLastUserMessage(messages)
                    : messages[messages.length - 1],
                messageId:
                  typeof requestBody.messageId === "string"
                    ? requestBody.messageId
                    : messageId,
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
    transport,
    onFinish,
    onError,
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
      const targetIndex = getMessageIndex(chat.messages, messageId);
      const nextVisibleMessages =
        targetIndex >= 0 ? chat.messages.slice(0, targetIndex) : chat.messages;

      const request = chat.regenerate({
        body: {
          trigger: "regenerate-assistant-message",
          workspaceId: workspaceIdRef.current,
        },
        messageId,
      });

      if (targetIndex >= 0) {
        flushSync(() => {
          chat.setMessages(nextVisibleMessages);
        });
      }

      return request;
    },
    [chat],
  );

  const retryMessage = useCallback(
    (messageId: string) => {
      const targetIndex = getMessageIndex(chat.messages, messageId);
      const nextVisibleMessages =
        targetIndex >= 0 ? chat.messages.slice(0, targetIndex) : chat.messages;

      const request = chat.regenerate({
        body: {
          trigger: "retry-assistant-message",
          workspaceId: workspaceIdRef.current,
        },
        messageId,
      });

      if (targetIndex >= 0) {
        flushSync(() => {
          chat.setMessages(nextVisibleMessages);
        });
      }

      return request;
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
