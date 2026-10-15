import { validateUIMessages, type UIMessage } from "ai";

import {
  buildActiveThreadMessages,
  type PersistedThreadMessageRecord,
} from "./branches";
import {
  normalizeThreadMessageMetadata,
  normalizeThreadUIMessage,
  normalizeThreadUIMessages,
  type ThreadMessageMetadata,
  type ThreadUIMessage,
  threadMessageMetadataSchema,
} from "./types";

function toJsonValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    return undefined;
  }

  return JSON.parse(serialized) as unknown;
}

function normalizeUnknownThreadUIMessage(message: unknown) {
  if (!message || typeof message !== "object") {
    return message;
  }

  return normalizeThreadUIMessage(
    message as Omit<ThreadUIMessage, "metadata"> & {
      metadata?: ThreadMessageMetadata | null;
    },
  );
}

function normalizeUnknownThreadUIMessages(messages: unknown) {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return normalizeThreadUIMessages(
    messages as Array<
      Omit<ThreadUIMessage, "metadata"> & {
        metadata?: ThreadMessageMetadata | null;
      }
    >,
  );
}

// Approval fields Sentinel stores next to the AI SDK's id/approved/reason.
const THREAD_APPROVAL_FIELDS = ["decision", "response"] as const;

function getPartApproval(part: unknown) {
  if (!part || typeof part !== "object" || !("approval" in part)) {
    return null;
  }

  const { approval } = part as { approval?: unknown };
  return approval && typeof approval === "object"
    ? (approval as Record<string, unknown>)
    : null;
}

function getPartToolCallId(part: unknown) {
  return part && typeof part === "object" && "toolCallId" in part
    ? (part as { toolCallId?: unknown }).toolCallId
    : undefined;
}

/**
 * validateUIMessages parses tool approvals with the AI SDK schema, which
 * drops Sentinel's approval.decision and approval.response. Validation keeps
 * message and part order, so copy them back from the validated input.
 */
function restoreThreadApprovalFields(
  validatedMessages: ThreadUIMessage[],
  sourceMessages: unknown,
) {
  if (!Array.isArray(sourceMessages)) {
    return validatedMessages;
  }

  return validatedMessages.map((message, messageIndex) => {
    const source: unknown = sourceMessages[messageIndex];
    const sourceParts =
      source && typeof source === "object" && "parts" in source
        ? (source as { parts?: unknown }).parts
        : undefined;

    if (!Array.isArray(sourceParts)) {
      return message;
    }

    let restored = false;
    const parts = message.parts.map((part, partIndex) => {
      const sourcePart: unknown = sourceParts[partIndex];
      const approval = getPartApproval(part);
      const sourceApproval = getPartApproval(sourcePart);

      if (
        !approval ||
        !sourceApproval ||
        getPartToolCallId(sourcePart) !== getPartToolCallId(part)
      ) {
        return part;
      }

      const extraFields = Object.fromEntries(
        THREAD_APPROVAL_FIELDS.flatMap((field) =>
          typeof sourceApproval[field] === "string"
            ? [[field, sourceApproval[field]]]
            : [],
        ),
      );

      if (Object.keys(extraFields).length === 0) {
        return part;
      }

      restored = true;
      return { ...part, approval: { ...approval, ...extraFields } };
    });

    return restored
      ? { ...message, parts: parts as ThreadUIMessage["parts"] }
      : message;
  });
}

export async function validateThreadUIMessage(message: unknown) {
  const normalizedMessages = [normalizeUnknownThreadUIMessage(message)];
  const [validatedMessage] = restoreThreadApprovalFields(
    await validateUIMessages<ThreadUIMessage>({
      messages: normalizedMessages,
      metadataSchema: threadMessageMetadataSchema,
    }),
    normalizedMessages,
  );

  if (!validatedMessage) {
    throw new Error("Message validation returned no messages.");
  }

  return validatedMessage;
}

export async function validateThreadUIMessages(messages: unknown) {
  const normalizedMessages = normalizeUnknownThreadUIMessages(messages);
  return restoreThreadApprovalFields(
    await validateUIMessages<ThreadUIMessage>({
      messages: normalizedMessages,
      metadataSchema: threadMessageMetadataSchema,
    }),
    normalizedMessages,
  );
}

export async function mapThreadMessagesToUIMessages(
  messages: PersistedThreadMessageRecord[],
) {
  return validateThreadUIMessages(buildActiveThreadMessages(messages));
}

export function mapThreadMessagesToUIMessagesBestEffort(
  messages: PersistedThreadMessageRecord[],
) {
  return normalizeThreadUIMessages(
    buildActiveThreadMessages(messages) as Array<
      Omit<ThreadUIMessage, "metadata"> & {
        metadata?: ThreadMessageMetadata | null;
      }
    >,
  );
}

export function serializeThreadUIMessage(message: ThreadUIMessage) {
  const normalizedMessage = normalizeThreadUIMessage(message);
  const metadata = toJsonValue(normalizedMessage.metadata);
  const parts = toJsonValue(message.parts);

  if (!parts || !Array.isArray(parts)) {
    throw new Error("UI message parts must serialize to a JSON array.");
  }

  return {
    messageId: message.id,
    metadata: metadata ?? null,
    parts,
    role: message.role,
  };
}
