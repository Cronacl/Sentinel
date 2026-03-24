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
    revision: z.number().int().nonnegative().optional(),
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
    runId: z.string().optional(),
    statusLabel: z.string().nullable().optional(),
    status: z
      .enum(["pending", "streaming", "completed", "error", "cancelled"])
      .optional(),
    usage: z
      .object({
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
        reasoningTokens: z.number().optional(),
        totalTokens: z.number().optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

export type ThreadMessageMetadata = z.infer<typeof threadMessageMetadataSchema>;
export type ThreadUIMessage = UIMessage<
  ThreadMessageMetadata,
  ThreadUIDataTypes
>;

export function getThreadMessageRevision(message: ThreadUIMessage): number {
  return message.metadata?.revision ?? 0;
}

export function getThreadMessageRunId(message: ThreadUIMessage): string | null {
  return message.metadata?.runId ?? null;
}

function getTextFingerprint(text: string) {
  if (!text) {
    return "0::";
  }

  const head = text.slice(0, 24);
  const tail = text.length > 24 ? text.slice(-24) : "";
  return `${text.length}:${head}:${tail}`;
}

function getValueFingerprint(value: unknown) {
  if (value == null) {
    return "";
  }

  try {
    return getTextFingerprint(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function getPartSyncToken(part: ThreadUIMessage["parts"][number]) {
  switch (part.type) {
    case "text":
    case "reasoning":
      return [
        part.type,
        part.state ?? "",
        getTextFingerprint(part.text),
        getValueFingerprint(part.providerMetadata),
      ].join(":");
    case "file":
      return [
        part.type,
        part.filename ?? "",
        part.mediaType,
        getTextFingerprint(part.url),
        getValueFingerprint(part.providerMetadata),
      ].join(":");
    case "dynamic-tool":
      return [
        part.type,
        part.toolCallId,
        part.toolName,
        part.state,
        getValueFingerprint(
          "providerMetadata" in part ? part.providerMetadata : undefined,
        ),
      ].join(":");
    default:
      return [
        part.type,
        "toolCallId" in part ? String(part.toolCallId) : "",
        "state" in part ? String(part.state) : "",
        getValueFingerprint(
          "callProviderMetadata" in part
            ? part.callProviderMetadata
            : undefined,
        ),
        getValueFingerprint(
          "providerMetadata" in part ? part.providerMetadata : undefined,
        ),
      ].join(":");
  }
}

function hasDataUrlPayload(url: string) {
  if (!url.startsWith("data:")) {
    return true;
  }

  const [, payload = ""] = url.split(",", 2);
  return payload.trim().length > 0;
}

function fixOutputErrorPart(part: Record<string, unknown>) {
  if (
    part.state === "output-error" &&
    part.output !== undefined &&
    part.errorText === undefined
  ) {
    const output = part.output as Record<string, unknown> | undefined;
    let errorText = "Tool execution failed";
    if (output && typeof output === "object") {
      if (typeof output.output === "string" && output.output.length > 0) {
        errorText = output.output;
      } else if (typeof output.error === "string" && output.error.length > 0) {
        errorText = output.error;
      } else if (
        typeof output.status === "string" &&
        output.status !== "completed"
      ) {
        errorText = `Tool execution ${output.status}`;
      }
    }
    const { output: _removed, ...rest } = part;
    return { ...rest, errorText };
  }
  return part;
}

function sanitizeThreadMessageParts(parts: unknown) {
  if (!Array.isArray(parts)) {
    return [];
  }

  return parts
    .filter((part) => {
      if (!part || typeof part !== "object") {
        return false;
      }

      const candidate = part as {
        providerMetadata?: unknown;
        text?: unknown;
        type?: unknown;
        url?: unknown;
      };

      if (typeof candidate.type !== "string") {
        return false;
      }

      if (candidate.type === "text" || candidate.type === "reasoning") {
        return (
          typeof candidate.text === "string" &&
          (candidate.text.length > 0 || candidate.providerMetadata != null)
        );
      }

      if (candidate.type === "file") {
        return (
          typeof candidate.url === "string" && hasDataUrlPayload(candidate.url)
        );
      }

      return true;
    })
    .map((part) => fixOutputErrorPart(part as Record<string, unknown>));
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
    parts: sanitizeThreadMessageParts(
      message.parts,
    ) as ThreadUIMessage["parts"],
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

function isModelContentPart(part: ThreadUIMessage["parts"][number]): boolean {
  const type = part.type;
  if (type.startsWith("data-") || type.startsWith("source-")) return false;
  return true;
}

/**
 * Prepare messages for model consumption by stripping parts that have no model
 * representation (data-*, source-*) and ensuring every message retains at
 * least one model-facing part. Messages that would become empty after
 * stripping are removed entirely.
 */
export function prepareMessagesForModel(
  messages: ThreadUIMessage[],
): ThreadUIMessage[] {
  return messages
    .map((message) => {
      const modelParts = message.parts.filter(isModelContentPart);
      if (modelParts.length === message.parts.length) return message;
      if (modelParts.length === 0) return null;
      return { ...message, parts: modelParts } as ThreadUIMessage;
    })
    .filter((message): message is ThreadUIMessage => message != null);
}

export function getThreadMessageSyncToken(message: ThreadUIMessage) {
  const metadata = message.metadata;

  return [
    message.id,
    message.role,
    metadata?.status ?? "",
    metadata?.branchId ?? "",
    metadata?.editedFromMessageId ?? "",
    metadata?.isActive ? "1" : "0",
    metadata?.errorMessage ?? "",
    metadata?.finishReason ?? "",
    metadata?.revision ?? "",
    metadata?.runId ?? "",
    metadata?.usage?.inputTokens ?? "",
    metadata?.usage?.totalTokens ?? "",
    metadata?.usage?.reasoningTokens ?? "",
    metadata?.reasoning?.durationMs ?? "",
    metadata?.reasoning?.activeSinceMs ?? "",
    metadata?.branchOptions
      ?.map(
        (option) =>
          `${option.messageId}:${option.role}:${option.label}:${option.isActive ? "1" : "0"}:${option.status ?? ""}`,
      )
      .join(",") ?? "",
    message.parts.map(getPartSyncToken).join("|"),
  ].join("::");
}
