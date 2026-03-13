"use client";

import { Chat, useChat } from "@ai-sdk/react";
import type { ChatOnDataCallback, FileUIPart } from "ai";
import { DefaultChatTransport } from "ai";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ThreadMode, ThreadPlanAnswer } from "@/lib/plan";
import {
  getThreadMessageSyncToken,
  normalizeThreadUIMessages,
  type ThreadUIMessage,
  threadMessageMetadataSchema,
} from "@/lib/ai/messages/types";

import {
  getChatInstance,
  scheduleChatInstanceCleanup,
  setChatInstance,
} from "./chat-instance-registry";
import { prepareThreadChatRequestBody } from "./thread-chat-transport";

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
  threadMode?: ThreadMode;
};

type EditThreadMessageInput = SendThreadMessageInput & {
  targetMessageId: string;
};

type AnswerPlanQuestionsInput = {
  answers: ThreadPlanAnswer[];
  assistantMessageId: string;
  questionSetId: string;
};

type InternalChatRequestOptions = {
  body?: object;
  headers?: Headers | Record<string, string>;
  messageId?: string;
  metadata?: unknown;
  trigger: "regenerate-message" | "resume-stream" | "submit-message";
};

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
        }) =>
          prepareThreadChatRequestBody({
            body: body as Record<string, unknown> | undefined,
            id,
            messageId,
            messages,
            trigger,
            workspaceId: workspaceIdRef.current,
          }),
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

  const chatInstanceRef = useRef<Chat<ThreadUIMessage> | null>(null);

  if (!chatInstanceRef.current || chatInstanceRef.current.id !== threadId) {
    const existing = getChatInstance(threadId);
    if (existing) {
      chatInstanceRef.current = existing;
    } else {
      chatInstanceRef.current = new Chat<ThreadUIMessage>({
        id: threadId,
        messages: normalizedInitialMessages,
        messageMetadataSchema: threadMessageMetadataSchema,
        onData,
        onError,
        onFinish,
        sendAutomaticallyWhen:
          lastAssistantMessageIsCompleteWithApprovalResponses,
        transport,
      });
      setChatInstance(threadId, chatInstanceRef.current);
    }
  }

  const chatInstance = chatInstanceRef.current;
  const internalChat = chatInstance as unknown as {
    makeRequest?: (options: InternalChatRequestOptions) => Promise<void>;
    onData?: ChatOnDataCallback<ThreadUIMessage>;
    onError?: (error: Error) => void;
    onFinish?: (() => void) | undefined;
    sendAutomaticallyWhen?: (options: {
      messages: ThreadUIMessage[];
    }) => boolean | PromiseLike<boolean>;
  };

  internalChat.onData = onData;
  internalChat.onError = onError;
  internalChat.onFinish = onFinish;
  internalChat.sendAutomaticallyWhen =
    lastAssistantMessageIsCompleteWithApprovalResponses;

  const chat = useChat<ThreadUIMessage>({
    chat: chatInstance,
    resume: true,
  });
  const lastSyncedSignatureRef = useRef(initialMessagesSignature);
  const syncedThreadIdRef = useRef(threadId);

  useEffect(() => {
    if (syncedThreadIdRef.current !== threadId) {
      syncedThreadIdRef.current = threadId;
      lastSyncedSignatureRef.current = initialMessagesSignature;
      if (chat.status !== "submitted" && chat.status !== "streaming") {
        chat.setMessages(normalizedInitialMessages);
      }
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

  useEffect(() => {
    return () => {
      scheduleChatInstanceCleanup(threadId);
    };
  }, [threadId]);

  const sendMessage = useCallback(
    ({
      files,
      modelId,
      reasoningEffort,
      text,
      threadMode,
    }: SendThreadMessageInput) => {
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
            ...(threadMode ? { threadMode } : {}),
            trigger: "submit-user-message",
            workspaceId: workspaceIdRef.current,
          },
        },
      );
    },
    [chat],
  );

  const answerPlanQuestions = useCallback(
    ({ answers, assistantMessageId, questionSetId }: AnswerPlanQuestionsInput) => {
      const nextMessages = chat.messages.map((message) => {
        if (message.id !== assistantMessageId) {
          return message;
        }

        return {
          ...message,
          parts: message.parts.map((part) => {
            const isAskQuestionPart =
              part.type === "tool-ask_question" ||
              (part.type === "dynamic-tool" && part.toolName === "ask_question");

            if (
              !isAskQuestionPart ||
              part.state !== "output-available" ||
              !("output" in part) ||
              !part.output ||
              typeof part.output !== "object" ||
              !("questionSetId" in part.output) ||
              part.output.questionSetId !== questionSetId
            ) {
              return part;
            }

            return {
              ...part,
              output: {
                ...part.output,
                answers,
                status: "answered",
              },
            };
          }),
        };
      });

      chat.setMessages(nextMessages);

      return internalChat.makeRequest?.({
        body: {
          planAnswers: answers,
          planQuestionSetId: questionSetId,
          threadMode: "plan",
          trigger: "submit-plan-answer",
          workspaceId: workspaceIdRef.current,
        },
        messageId: assistantMessageId,
        trigger: "regenerate-message",
      });
    },
    [chat, internalChat],
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
    answerPlanQuestions,
    editMessage,
    regenerateMessage,
    retryMessage,
    sendMessage,
  };
}
