import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";

import type { ThreadMode, ThreadPlanAnswer } from "@/lib/plan";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

type PrepareThreadChatRequestBodyInput = {
  body?: Record<string, unknown>;
  id: string;
  messageId?: string;
  messages: ThreadUIMessage[];
  trigger: "submit-message" | "regenerate-message";
  workspaceId: string;
};

function getLastUserMessage(messages: ThreadUIMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user");
}

function getLastAssistantMessage(messages: ThreadUIMessage[]) {
  return [...messages].reverse().find((message) => message.role === "assistant");
}

function getThreadMode(value: unknown): ThreadMode | undefined {
  return value === "chat" || value === "plan" ? value : undefined;
}

function getPlanAnswers(value: unknown): ThreadPlanAnswer[] | undefined {
  return Array.isArray(value) ? (value as ThreadPlanAnswer[]) : undefined;
}

export function prepareThreadChatRequestBody({
  body,
  id,
  messageId,
  messages,
  trigger,
  workspaceId,
}: PrepareThreadChatRequestBodyInput) {
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
        ...(isToolApprovalSubmit ? { messages } : {}),
        modelId:
          typeof requestBody.modelId === "string"
            ? requestBody.modelId
            : undefined,
        reasoningEffort:
          typeof requestBody.reasoningEffort === "string"
            ? requestBody.reasoningEffort
            : undefined,
        threadMode: getThreadMode(requestBody.threadMode),
        trigger:
          requestBody.trigger === "edit-user-message"
            ? "edit-user-message"
            : isToolApprovalSubmit
              ? "submit-tool-approval"
              : "submit-user-message",
        workspaceId:
          typeof requestBody.workspaceId === "string"
            ? requestBody.workspaceId
            : workspaceId,
      },
    };
  }

  if (requestBody.trigger === "submit-plan-answer") {
    return {
      body: {
        id,
        messageId,
        messages,
        planAnswers: getPlanAnswers(requestBody.planAnswers),
        planQuestionSetId:
          typeof requestBody.planQuestionSetId === "string"
            ? requestBody.planQuestionSetId
            : undefined,
        threadMode: getThreadMode(requestBody.threadMode),
        trigger: "submit-plan-answer",
        workspaceId:
          typeof requestBody.workspaceId === "string"
            ? requestBody.workspaceId
            : workspaceId,
      },
    };
  }

  return {
    body: {
      id,
      messageId,
      messages,
      threadMode: getThreadMode(requestBody.threadMode),
      trigger:
        requestBody.trigger === "retry-assistant-message"
          ? "retry-assistant-message"
          : "regenerate-assistant-message",
      workspaceId:
        typeof requestBody.workspaceId === "string"
          ? requestBody.workspaceId
          : workspaceId,
    },
  };
}
