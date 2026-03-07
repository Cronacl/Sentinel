import { validateUIMessages, type UIMessage } from "ai";

import { Prisma } from "@/../generated/prisma";

type PersistedThreadMessageRecord = {
  createdAt: Date;
  id: string;
  messageId: string;
  metadata: Prisma.JsonValue | null;
  parts: Prisma.JsonValue;
  role: "system" | "user" | "assistant";
  updatedAt: Date;
};

function toInputJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    return undefined;
  }

  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

export async function validateThreadUIMessage(message: unknown) {
  const [validatedMessage] = await validateUIMessages({
    messages: [message],
  });

  if (!validatedMessage) {
    throw new Error("Message validation returned no messages.");
  }

  return validatedMessage;
}

export async function validateThreadUIMessages(messages: unknown) {
  return validateUIMessages({
    messages,
  });
}

export async function mapThreadMessagesToUIMessages(
  messages: PersistedThreadMessageRecord[],
) {
  return validateThreadUIMessages(
    messages.map((message) => ({
      id: message.messageId,
      ...(message.metadata === null ? {} : { metadata: message.metadata }),
      parts: message.parts,
      role: message.role,
    })),
  );
}

export function serializeThreadUIMessage(message: UIMessage) {
  const metadata = toInputJsonValue(message.metadata);
  const parts = toInputJsonValue(message.parts);

  if (!parts || !Array.isArray(parts)) {
    throw new Error("UI message parts must serialize to a JSON array.");
  }

  return {
    messageId: message.id,
    ...(message.metadata === undefined
      ? {}
      : { metadata: metadata ?? Prisma.JsonNull }),
    parts,
    role: message.role,
  };
}
