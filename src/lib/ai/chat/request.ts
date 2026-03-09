import {
  normalizeThreadUIMessage,
  type ThreadUIMessage,
} from "../thread-message-types";
import { validateThreadUIMessage } from "../ui-messages";

import { InvalidThreadChatRequestError } from "./errors";
import type { ThreadChatRequest, ThreadChatRequestBody } from "./types";

function getNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getTrigger(value: unknown): ThreadChatRequest["trigger"] {
  switch (value) {
    case "submit-user-message":
    case "retry-assistant-message":
    case "regenerate-assistant-message":
    case "edit-user-message":
    case "stop-stream":
      return value;
    default:
      return "submit-user-message";
  }
}

async function parseOptionalMessage(rawMessage: unknown) {
  if (!rawMessage || typeof rawMessage !== "object") {
    return undefined;
  }

  return validateThreadUIMessage(
    normalizeThreadUIMessage(
      rawMessage as Omit<ThreadUIMessage, "metadata"> & {
        metadata?: ThreadUIMessage["metadata"] | null;
      },
    ),
  );
}

export async function parseThreadChatRequest(
  rawInput: unknown,
  { userId }: Pick<ThreadChatRequest, "userId">,
): Promise<ThreadChatRequest> {
  if (!rawInput || typeof rawInput !== "object") {
    throw new InvalidThreadChatRequestError();
  }

  const input = rawInput as Partial<ThreadChatRequestBody>;
  const threadId = getNonEmptyString(input.id);
  const workspaceId = getNonEmptyString(input.workspaceId);
  const trigger = getTrigger(input.trigger);
  const messageId = getNonEmptyString(input.messageId) ?? undefined;
  const modelId = getNonEmptyString(input.modelId) ?? undefined;
  const message = await parseOptionalMessage(input.message);

  if (!threadId || !workspaceId) {
    throw new InvalidThreadChatRequestError();
  }

  if (
    (trigger === "submit-user-message" || trigger === "edit-user-message") &&
    !message
  ) {
    throw new InvalidThreadChatRequestError();
  }

  if (trigger === "edit-user-message" && !messageId) {
    throw new InvalidThreadChatRequestError();
  }

  if (
    (trigger === "retry-assistant-message" ||
      trigger === "regenerate-assistant-message" ||
      trigger === "stop-stream") &&
    !messageId
  ) {
    throw new InvalidThreadChatRequestError();
  }

  return {
    ...(message ? { message } : {}),
    ...(messageId ? { messageId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
    threadId,
    trigger,
    userId,
    workspaceId,
  };
}
