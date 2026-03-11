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
} from "./message-types";

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

export async function validateThreadUIMessage(message: unknown) {
  const [validatedMessage] = await validateUIMessages<ThreadUIMessage>({
    messages: [normalizeUnknownThreadUIMessage(message)],
    metadataSchema: threadMessageMetadataSchema,
  });

  if (!validatedMessage) {
    throw new Error("Message validation returned no messages.");
  }

  return validatedMessage;
}

export async function validateThreadUIMessages(messages: unknown) {
  return validateUIMessages<ThreadUIMessage>({
    messages: normalizeUnknownThreadUIMessages(messages),
    metadataSchema: threadMessageMetadataSchema,
  });
}

export async function mapThreadMessagesToUIMessages(
  messages: PersistedThreadMessageRecord[],
) {
  return validateThreadUIMessages(buildActiveThreadMessages(messages));
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
