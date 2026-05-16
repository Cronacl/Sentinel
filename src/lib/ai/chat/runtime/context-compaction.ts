import { generateText } from "ai";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";

import {
  getLatestCompletedAssistantInputTokens,
  resolveConfiguredContextWindow,
} from "@/lib/ai/chat/context/context-window";
import type { ThreadContextCompactionCheckpoint } from "@/lib/ai/chat/persistence";
import {
  prepareMessagesForModel,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";

const RAW_TAIL_MESSAGE_COUNT = 2;
const STRIPPED_TAIL_MESSAGE_COUNT = 4;
const MIN_OLDER_MESSAGES_TO_COMPACT = 1;
const SUMMARY_MESSAGE_PREFIX = "context-compaction-summary";
const STRIPPED_MESSAGE_PREFIX = "context-compaction-stripped";
const SUMMARY_MAX_CHARS_PER_MESSAGE = 6_000;

function truncate(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit).trimEnd()}\n...[truncated]`;
}

function stringifyValue(value: unknown, limit: number) {
  if (value == null) {
    return "";
  }

  try {
    return truncate(JSON.stringify(value, null, 2), limit);
  } catch {
    return truncate(String(value), limit);
  }
}

function summarizePartForPrompt(part: ThreadUIMessage["parts"][number]) {
  if (part.type === "text" || part.type === "reasoning") {
    return `${part.type.toUpperCase()}:\n${truncate(
      part.text,
      SUMMARY_MAX_CHARS_PER_MESSAGE,
    )}`;
  }

  if (part.type === "file") {
    return `FILE: ${part.filename ?? "attachment"} (${part.mediaType})`;
  }

  const candidate = part as Record<string, unknown>;
  const toolName =
    candidate.toolName ??
    (typeof part.type === "string" && part.type.startsWith("tool-")
      ? part.type.slice("tool-".length)
      : part.type);

  return [
    `TOOL: ${String(toolName)}`,
    candidate.state ? `State: ${String(candidate.state)}` : null,
    candidate.input
      ? `Input:\n${stringifyValue(candidate.input, 2_500)}`
      : null,
    candidate.output
      ? `Output:\n${stringifyValue(candidate.output, 3_500)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function serializeMessagesForPrompt(messages: ThreadUIMessage[]) {
  return messages
    .map((message, index) =>
      [
        `Message ${index + 1} (${message.role})`,
        ...message.parts.map(summarizePartForPrompt),
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}

function buildSyntheticSummaryMessage(
  summary: string,
  coveredThroughMessageId: string,
): ThreadUIMessage {
  return {
    id: `${SUMMARY_MESSAGE_PREFIX}:${coveredThroughMessageId}`,
    metadata: { status: "completed" },
    parts: [
      {
        text: [
          "Context compaction summary",
          "This is the condensed, authoritative summary of earlier transcript history. Use it instead of the older messages it replaces.",
          "",
          summary.trim(),
        ].join("\n"),
        type: "text",
      },
    ],
    role: "system",
  };
}

function buildSyntheticStrippedMessage(
  message: ThreadUIMessage,
): ThreadUIMessage | null {
  const parts: ThreadUIMessage["parts"] = [];

  for (const part of message.parts) {
    if (part.type === "text") {
      parts.push({
        text: part.text,
        type: "text" as const,
      });
      continue;
    }

    if (part.type === "file") {
      parts.push({
        filename: part.filename,
        mediaType: part.mediaType,
        type: "file" as const,
        url: part.url,
      });
      continue;
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return {
    id: `${STRIPPED_MESSAGE_PREFIX}:${message.id}`,
    metadata: { status: "completed" },
    parts,
    role: message.role,
  };
}

function splitCompactionBuckets(messages: ThreadUIMessage[]) {
  const rawTail = messages.slice(-RAW_TAIL_MESSAGE_COUNT);
  const compacted = messages.slice(0, -RAW_TAIL_MESSAGE_COUNT);
  const strippedTail = compacted.slice(-STRIPPED_TAIL_MESSAGE_COUNT);

  return {
    compacted,
    rawTail,
    strippedTail,
  };
}

function sanitizeSummary(text: string) {
  return text
    .replace(/<\/?summary>/gi, "")
    .replace(/^\s*```(?:markdown)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function buildSummaryPrompt(
  existingSummary: string | null,
  messages: ThreadUIMessage[],
) {
  return [
    "You are updating a continuation summary for a long-running coding assistant conversation.",
    "The goal is to preserve everything needed to continue the task at high quality while dropping verbose transcript history and bulky tool output.",
    "Write a concise but complete markdown summary with these sections:",
    "1. Task and constraints",
    "2. Current state and completed work",
    "3. Important technical discoveries and decisions",
    "4. Files, commands, tool outcomes, and artifacts that matter",
    "5. Open questions, blockers, approvals, and next steps",
    "6. User preferences or style constraints to preserve",
    "Prefer durable facts over speculation. Preserve decisions, rationale, and unresolved work. Omit filler and repetitive logs.",
    "Return only the updated summary text.",
    "",
    existingSummary
      ? `Existing summary to merge forward:\n${existingSummary}`
      : "There is no prior summary yet.",
    "",
    "Older transcript to fold into the continuation summary:",
    serializeMessagesForPrompt(messages),
  ].join("\n");
}

export async function generateCompactionSummary({
  existingSummary,
  languageModel,
  messages,
  providerOptions,
}: {
  existingSummary: string | null;
  languageModel: unknown;
  messages: ThreadUIMessage[];
  providerOptions?: SharedV3ProviderOptions;
}) {
  const result = await generateText({
    model: languageModel as Parameters<typeof generateText>[0]["model"],
    ...(providerOptions ? { providerOptions } : {}),
    maxOutputTokens: 2_000,
    prompt: buildSummaryPrompt(existingSummary, messages),
    temperature: 0,
  });

  return sanitizeSummary(result.text);
}

export type ContextCompactionPlan = ReturnType<typeof planContextCompaction>;

export function planContextCompaction(input: {
  checkpoint: ThreadContextCompactionCheckpoint;
  contextWindow?: number | null;
  enabled: boolean;
  fixedWindowSize?: number | null;
  transcript: ThreadUIMessage[];
  useFixedWindow?: boolean;
  windowPercent: number;
}) {
  const preparedTranscript = prepareMessagesForModel(input.transcript);
  const exactInputTokens =
    getLatestCompletedAssistantInputTokens(preparedTranscript);
  const configuredContextWindow = resolveConfiguredContextWindow({
    contextWindow: input.contextWindow,
    fixedWindowSize: input.fixedWindowSize,
    useFixedWindow: input.useFixedWindow,
  });
  const thresholdTokens = Math.floor(
    configuredContextWindow * (input.windowPercent / 100),
  );

  const cutoffMessageId = input.checkpoint.coveredThroughMessageId ?? null;
  const cutoffIndex = cutoffMessageId
    ? preparedTranscript.findIndex((message) => message.id === cutoffMessageId)
    : -1;
  const checkpointWasInvalid = Boolean(cutoffMessageId) && cutoffIndex === -1;
  const existingSummary =
    !checkpointWasInvalid && input.checkpoint.summary?.trim()
      ? input.checkpoint.summary.trim()
      : null;
  const remainingMessages =
    cutoffIndex >= 0
      ? preparedTranscript.slice(cutoffIndex + 1)
      : preparedTranscript;
  const withExistingSummary =
    existingSummary && cutoffMessageId
      ? [
          buildSyntheticSummaryMessage(existingSummary, cutoffMessageId),
          ...remainingMessages,
        ]
      : remainingMessages;

  const base = {
    checkpointWasInvalid,
    configuredContextWindow,
    exactInputTokens,
    existingSummary,
    preparedTranscript,
    remainingMessages,
    thresholdTokens,
    transcript: withExistingSummary,
  };

  if (!input.enabled) {
    return {
      ...base,
      canDeferNewSummary: false,
      compactedMessages: [],
      coveredThroughMessageId: null,
      shouldGenerateNewSummary: false,
    };
  }

  if (
    exactInputTokens == null ||
    exactInputTokens < thresholdTokens ||
    remainingMessages.length <= RAW_TAIL_MESSAGE_COUNT
  ) {
    return {
      ...base,
      canDeferNewSummary: false,
      compactedMessages: [],
      coveredThroughMessageId: null,
      shouldGenerateNewSummary: false,
    };
  }

  const {
    compacted: compactedMessages,
    rawTail: preservedRecentMessages,
    strippedTail: strippedCompactedMessages,
  } = splitCompactionBuckets(remainingMessages);
  const coveredThroughMessageId =
    compactedMessages.at(-1)?.id ?? cutoffMessageId;

  if (
    compactedMessages.length < MIN_OLDER_MESSAGES_TO_COMPACT ||
    !coveredThroughMessageId
  ) {
    return {
      ...base,
      canDeferNewSummary: false,
      compactedMessages,
      coveredThroughMessageId: null,
      shouldGenerateNewSummary: false,
    };
  }

  return {
    ...base,
    canDeferNewSummary:
      exactInputTokens != null && exactInputTokens < configuredContextWindow,
    compactedMessages,
    coveredThroughMessageId,
    preservedRecentMessages,
    shouldGenerateNewSummary: true,
    strippedCompactedMessages,
  };
}

export async function applyContextCompaction(input: {
  checkpoint: ThreadContextCompactionCheckpoint;
  contextWindow?: number | null;
  enabled: boolean;
  fixedWindowSize?: number | null;
  languageModel: unknown;
  onCompactionStart?: () => void | Promise<void>;
  providerOptions?: SharedV3ProviderOptions;
  transcript: ThreadUIMessage[];
  useFixedWindow?: boolean;
  windowPercent: number;
}) {
  const plan = planContextCompaction(input);

  if (!plan.shouldGenerateNewSummary || !plan.coveredThroughMessageId) {
    return {
      checkpointWasInvalid: plan.checkpointWasInvalid,
      didCompact: false,
      inputTokens: plan.exactInputTokens,
      thresholdTokens: plan.thresholdTokens,
      transcript: plan.transcript,
      updatedCheckpoint: null,
    };
  }

  await input.onCompactionStart?.();
  const summary = await generateCompactionSummary({
    existingSummary: plan.existingSummary,
    languageModel: input.languageModel,
    messages: plan.compactedMessages,
    ...(input.providerOptions
      ? { providerOptions: input.providerOptions }
      : {}),
  });
  const strippedTailMessages = plan.strippedCompactedMessages
    .map(buildSyntheticStrippedMessage)
    .filter((message): message is ThreadUIMessage => message != null);

  const compactedTranscript = [
    buildSyntheticSummaryMessage(summary, plan.coveredThroughMessageId),
    ...strippedTailMessages,
    ...plan.preservedRecentMessages,
  ];

  return {
    checkpointWasInvalid: plan.checkpointWasInvalid,
    didCompact: true,
    inputTokens: plan.exactInputTokens,
    thresholdTokens: plan.thresholdTokens,
    transcript: compactedTranscript,
    updatedCheckpoint: {
      coveredThroughMessageId: plan.coveredThroughMessageId,
      summary,
    },
  };
}
