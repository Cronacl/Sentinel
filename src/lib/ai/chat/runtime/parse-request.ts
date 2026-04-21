import {
  normalizeThreadUIMessage,
  normalizeThreadUIMessages,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import { validateThreadUIMessage } from "@/lib/ai/messages/ui";
import { type ThreadPlanAnswer } from "@/lib/plan";
import { CHAT_ENGINES, type ChatEngine } from "@/server/db/enums";
import { repoThreadStateSchema } from "@/lib/ai/chat/engines/types";

import { InvalidThreadChatRequestError } from "../errors";
import type {
  ThreadChatRequest,
  ThreadChatTrigger,
  ThreadToolApprovalResponse,
} from "../types";

export const VALID_TRIGGERS = new Set<ThreadChatTrigger>([
  "submit-user-message",
  "queue-follow-up",
  "steer-follow-up",
  "submit-plan-answer",
  "submit-tool-approval",
  "retry-assistant-message",
  "regenerate-assistant-message",
  "edit-user-message",
  "stop-stream",
]);

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function parseToolApprovalResponse(
  value: unknown,
): ThreadToolApprovalResponse | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const input = value as Record<string, unknown>;
  const id = str(input.id);
  const approved =
    typeof input.approved === "boolean" ? input.approved : undefined;

  if (!id || approved === undefined) {
    return undefined;
  }

  return {
    approved,
    ...(str(input.decision) ? { decision: str(input.decision) } : {}),
    id,
    ...(str(input.reason) ? { reason: str(input.reason) } : {}),
    ...(str(input.response) ? { response: str(input.response) } : {}),
  };
}

function parseOpenCodeOptions(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const input = value as Record<string, unknown>;
  const agent = str(input.agent);
  const variant = str(input.variant);
  if (!agent && !variant) {
    return undefined;
  }

  return {
    ...(agent ? { agent } : {}),
    ...(variant ? { variant } : {}),
  };
}

export async function parseRequest(
  raw: unknown,
  userId: string,
): Promise<ThreadChatRequest> {
  if (!raw || typeof raw !== "object") {
    throw new InvalidThreadChatRequestError();
  }
  const input = raw as Record<string, unknown>;

  const threadId = str(input.id);
  const workspaceId = str(input.workspaceId);
  if (!threadId || !workspaceId) {
    throw new InvalidThreadChatRequestError();
  }

  const trigger: ThreadChatTrigger = VALID_TRIGGERS.has(
    input.trigger as ThreadChatTrigger,
  )
    ? (input.trigger as ThreadChatTrigger)
    : "submit-user-message";

  const messageId = str(input.messageId);
  const modelId = str(input.modelId);
  const engine = CHAT_ENGINES.includes(input.engine as ChatEngine)
    ? (input.engine as ChatEngine)
    : undefined;
  const planQuestionSetId = str(input.planQuestionSetId);
  const rawPlanAnswers = Array.isArray(input.planAnswers)
    ? (input.planAnswers as ThreadPlanAnswer[])
    : undefined;
  const toolApprovalResponse = parseToolApprovalResponse(
    input.toolApprovalResponse,
  );
  const openCode = parseOpenCodeOptions(input.openCode);
  const reasoningEffort = str(input.reasoningEffort) as
    | ThreadChatRequest["reasoningEffort"]
    | undefined;
  const threadMode =
    input.threadMode === "plan" || input.threadMode === "chat"
      ? (input.threadMode as "plan" | "chat")
      : undefined;
  const toolsEnabled =
    typeof input.toolsEnabled === "boolean" ? input.toolsEnabled : undefined;
  const draftRepoState = input.draftRepoState
    ? repoThreadStateSchema.partial().safeParse(input.draftRepoState)
    : null;

  const needsMessage =
    trigger === "submit-user-message" ||
    trigger === "queue-follow-up" ||
    trigger === "steer-follow-up" ||
    trigger === "edit-user-message";
  const needsMessageId =
    trigger !== "submit-user-message" &&
    trigger !== "queue-follow-up" &&
    trigger !== "steer-follow-up" &&
    trigger !== "stop-stream" &&
    trigger !== "submit-tool-approval" &&
    trigger !== "submit-plan-answer";

  if (needsMessageId && !messageId) {
    throw new InvalidThreadChatRequestError();
  }

  const shouldParseMessages =
    trigger === "submit-tool-approval" ||
    trigger === "submit-plan-answer" ||
    trigger === "edit-user-message" ||
    trigger === "retry-assistant-message" ||
    trigger === "regenerate-assistant-message";

  const messages =
    shouldParseMessages && Array.isArray(input.messages)
      ? normalizeThreadUIMessages(
          input.messages as Parameters<typeof normalizeThreadUIMessages>[0],
        )
      : undefined;

  let message: ThreadUIMessage | undefined;
  if (needsMessage && input.message && typeof input.message === "object") {
    message = await validateThreadUIMessage(
      normalizeThreadUIMessage(
        input.message as Parameters<typeof normalizeThreadUIMessage>[0],
      ),
    );
  }
  if (needsMessage && !message) {
    throw new InvalidThreadChatRequestError();
  }

  return {
    ...(draftRepoState?.success ? { draftRepoState: draftRepoState.data } : {}),
    ...(message ? { message } : {}),
    ...(messages ? { messages } : {}),
    ...(engine ? { engine } : {}),
    ...(messageId ? { messageId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(openCode ? { openCode } : {}),
    ...(rawPlanAnswers ? { planAnswers: rawPlanAnswers } : {}),
    ...(planQuestionSetId ? { planQuestionSetId } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    threadId,
    ...(threadMode ? { threadMode } : {}),
    ...(toolsEnabled !== undefined ? { toolsEnabled } : {}),
    ...(toolApprovalResponse ? { toolApprovalResponse } : {}),
    trigger,
    userId,
    workspaceId,
  };
}
