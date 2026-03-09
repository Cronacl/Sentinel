import type { UIMessage } from "ai";
import { z } from "zod";

export type ThreadUIDataTypes = {
  "thread-invalidation": {
    target: "detail" | "list" | "all";
    threadId: string;
  };
  "thread-title": {
    threadId: string;
    title: string;
  };
};

const branchOptionSchema = z.object({
  isActive: z.boolean(),
  label: z.string(),
  messageId: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  status: z
    .enum(["pending", "streaming", "completed", "error", "cancelled"])
    .optional(),
});

export const threadMessageMetadataSchema = z
  .object({
    branchId: z.string().optional(),
    branchOptions: z.array(branchOptionSchema).optional(),
    editedFromMessageId: z.string().optional(),
    errorMessage: z.string().optional(),
    finishReason: z.string().optional(),
    isActive: z.boolean().optional(),
    model: z
      .object({
        providerId: z.string().optional(),
        requestedModelId: z.string().optional(),
        responseModelId: z.string().optional(),
      })
      .partial()
      .optional(),
    parentMessageId: z.string().nullable().optional(),
    reasoning: z
      .object({
        activeSinceMs: z.number().nullable().optional(),
        durationMs: z.number().optional(),
        isActive: z.boolean().optional(),
        rawSegmentDurationsMs: z.array(z.number()).optional(),
        segmentDurationsMs: z.array(z.number()).optional(),
      })
      .partial()
      .optional(),
    status: z
      .enum(["pending", "streaming", "completed", "error", "cancelled"])
      .optional(),
    usage: z
      .object({
        outputTokens: z.number().optional(),
        reasoningTokens: z.number().optional(),
        totalTokens: z.number().optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

export type ThreadMessageMetadata = z.infer<
  typeof threadMessageMetadataSchema
>;
export type ThreadUIMessage = UIMessage<
  ThreadMessageMetadata,
  ThreadUIDataTypes
>;

function hasDataUrlPayload(url: string) {
  if (!url.startsWith("data:")) {
    return true;
  }

  const [, payload = ""] = url.split(",", 2);
  return payload.trim().length > 0;
}

function sanitizeThreadMessageParts(parts: unknown) {
  if (!Array.isArray(parts)) {
    return [];
  }

  return parts.filter((part) => {
    if (!part || typeof part !== "object") {
      return false;
    }

    const candidate = part as {
      text?: unknown;
      type?: unknown;
      url?: unknown;
    };

    if (typeof candidate.type !== "string") {
      return false;
    }

    if (candidate.type === "text" || candidate.type === "reasoning") {
      return typeof candidate.text === "string" && candidate.text.length > 0;
    }

    if (candidate.type === "file") {
      return typeof candidate.url === "string" && hasDataUrlPayload(candidate.url);
    }

    return true;
  });
}

export function normalizeThreadMessageMetadata(
  metadata: ThreadMessageMetadata | null | undefined,
): ThreadMessageMetadata {
  return metadata ?? {};
}

export function mergeThreadMessageMetadata(
  current: ThreadMessageMetadata | undefined,
  next: ThreadMessageMetadata,
): ThreadMessageMetadata {
  return {
    ...current,
    ...next,
    model: {
      ...(current?.model ?? {}),
      ...(next.model ?? {}),
    },
    reasoning: {
      ...(current?.reasoning ?? {}),
      ...(next.reasoning ?? {}),
    },
    usage: {
      ...(current?.usage ?? {}),
      ...(next.usage ?? {}),
    },
  };
}

export function normalizeThreadUIMessage(
  message: Omit<ThreadUIMessage, "metadata"> & {
    metadata?: ThreadMessageMetadata | null;
  },
): ThreadUIMessage {
  return {
    ...message,
    metadata: normalizeThreadMessageMetadata(message.metadata),
    parts: sanitizeThreadMessageParts(message.parts) as ThreadUIMessage["parts"],
  };
}

export function normalizeThreadUIMessages(
  messages: Array<
    Omit<ThreadUIMessage, "metadata"> & {
      metadata?: ThreadMessageMetadata | null;
    }
  >,
): ThreadUIMessage[] {
  return messages
    .map(normalizeThreadUIMessage)
    .filter((message) => message.parts.length > 0);
}
