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

const composerPathEntrySchema = z.object({
  absolutePath: z.string(),
  kind: z.enum(["file", "directory"]),
  label: z.string(),
  relativePath: z.string(),
});

const composerSkillEntrySchema = z.object({
  directory: z.string().optional(),
  engine: z.enum(["sentinel", "codex", "claude"]),
  name: z.string(),
  scope: z.enum(["global", "workspace"]).optional(),
  sourceKind: z.enum(["sentinel", "agents", "claude", "codex"]).optional(),
  target: z.enum(["sentinel", "codex", "claude"]).optional(),
});

const composerContextSchema = z
  .object({
    paths: z.array(composerPathEntrySchema).default([]),
    skills: z.array(composerSkillEntrySchema).default([]),
  })
  .optional();

export const threadMessageMetadataSchema = z
  .object({
    branchId: z.string().optional(),
    branchOptions: z.array(branchOptionSchema).optional(),
    composerContext: composerContextSchema,
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
        contextWindow: z.number().optional(),
        inputTokens: z.number().optional(),
        maxOutputTokens: z.number().optional(),
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

function getComposerContextFingerprint(
  composerContext: ThreadMessageMetadata["composerContext"] | undefined,
) {
  if (!composerContext) {
    return "";
  }

  const paths = (composerContext.paths ?? [])
    .map(
      (entry) =>
        `${entry.kind}:${entry.label}:${entry.relativePath}:${entry.absolutePath}`,
    )
    .join("|");
  const skills = (composerContext.skills ?? [])
    .map(
      (entry) =>
        `${entry.name}:${entry.engine}:${entry.scope ?? ""}:${entry.sourceKind ?? ""}:${entry.target ?? ""}:${entry.directory ?? ""}`,
    )
    .join("|");

  return `${paths}::${skills}`;
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
        getValueFingerprint("approval" in part ? part.approval : undefined),
        getValueFingerprint("input" in part ? part.input : undefined),
        getValueFingerprint("output" in part ? part.output : undefined),
        "errorText" in part ? String(part.errorText ?? "") : "",
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

function sanitizeDynamicToolPart(part: Record<string, unknown>) {
  if (part.type !== "dynamic-tool") {
    return part;
  }

  const next = { ...part };
  const toolCallId =
    typeof next.toolCallId === "string" ? next.toolCallId : undefined;
  const approval =
    next.approval && typeof next.approval === "object"
      ? (next.approval as Record<string, unknown>)
      : null;
  const approvalId =
    typeof approval?.id === "string" ? approval.id : toolCallId;

  switch (next.state) {
    case "approval-requested":
      delete next.output;
      delete next.errorText;
      if (approvalId) {
        next.approval = {
          ...(typeof approval?.decision === "string"
            ? { decision: approval.decision }
            : {}),
          id: approvalId,
          ...(typeof approval?.reason === "string"
            ? { reason: approval.reason }
            : {}),
          ...(typeof approval?.response === "string"
            ? { response: approval.response }
            : {}),
        };
      } else {
        delete next.approval;
      }
      return next;
    case "approval-responded":
      delete next.output;
      delete next.errorText;
      if (approvalId) {
        next.approval = {
          ...(typeof approval?.approved === "boolean"
            ? { approved: approval.approved }
            : {}),
          ...(typeof approval?.decision === "string"
            ? { decision: approval.decision }
            : {}),
          ...(typeof approval?.response === "string"
            ? { response: approval.response }
            : {}),
          ...(typeof approval?.reason === "string"
            ? { reason: approval.reason }
            : {}),
          id: approvalId,
        };
      } else {
        delete next.approval;
      }
      return next;
    case "input-available":
    case "input-streaming":
      delete next.output;
      delete next.errorText;
      delete next.approval;
      return next;
    case "output-available":
      delete next.errorText;
      delete next.approval;
      return next;
    case "output-error":
      delete next.output;
      delete next.approval;
      return next;
    case "output-denied":
      delete next.output;
      delete next.errorText;
      if (approvalId) {
        next.approval = {
          approved: false,
          ...(typeof approval?.decision === "string"
            ? { decision: approval.decision }
            : {}),
          id: approvalId,
          ...(typeof approval?.reason === "string"
            ? { reason: approval.reason }
            : {}),
          ...(typeof approval?.response === "string"
            ? { response: approval.response }
            : {}),
        };
      } else {
        delete next.approval;
      }
      return next;
    default:
      return next;
  }
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
    .map((part) =>
      sanitizeDynamicToolPart(
        fixOutputErrorPart(part as Record<string, unknown>),
      ),
    );
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
    metadata?.usage?.contextWindow ?? "",
    metadata?.usage?.inputTokens ?? "",
    metadata?.usage?.maxOutputTokens ?? "",
    metadata?.usage?.totalTokens ?? "",
    metadata?.usage?.reasoningTokens ?? "",
    metadata?.reasoning?.durationMs ?? "",
    metadata?.reasoning?.activeSinceMs ?? "",
    getComposerContextFingerprint(metadata?.composerContext),
    metadata?.branchOptions
      ?.map(
        (option) =>
          `${option.messageId}:${option.role}:${option.label}:${option.isActive ? "1" : "0"}:${option.status ?? ""}`,
      )
      .join(",") ?? "",
    message.parts.map(getPartSyncToken).join("|"),
  ].join("::");
}
