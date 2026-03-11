import {
  normalizeThreadUIMessage,
  normalizeThreadUIMessages,
  type ThreadUIMessage,
} from "@/lib/ai/thread-message-types";
import {
  validateThreadUIMessage,
  validateThreadUIMessages,
} from "@/lib/ai/ui-messages";

import { InvalidThreadChatRequestError } from "../errors";
import type { ThreadChatRequest, ThreadChatTrigger } from "../types";

export const VALID_TRIGGERS = new Set<ThreadChatTrigger>([
  "submit-user-message",
  "submit-tool-approval",
  "retry-assistant-message",
  "regenerate-assistant-message",
  "edit-user-message",
  "stop-stream",
]);

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
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
  const reasoningEffort = str(input.reasoningEffort) as
    | ThreadChatRequest["reasoningEffort"]
    | undefined;

  const needsMessage =
    trigger === "submit-user-message" || trigger === "edit-user-message";
  const needsMessageId =
    trigger !== "submit-user-message" && trigger !== "submit-tool-approval";

  if (needsMessageId && !messageId) {
    throw new InvalidThreadChatRequestError();
  }

  const messages = Array.isArray(input.messages)
    ? await validateThreadUIMessages(
        normalizeThreadUIMessages(
          input.messages as Parameters<typeof normalizeThreadUIMessages>[0],
        ),
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
    ...(message ? { message } : {}),
    ...(messages ? { messages } : {}),
    ...(messageId ? { messageId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    threadId,
    trigger,
    userId,
    workspaceId,
  };
}
