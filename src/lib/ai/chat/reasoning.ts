import type {
  ThreadMessageMetadata,
  ThreadUIMessage,
} from "../message-types";
import { mergeThreadMessageMetadata } from "../message-types";

import type { ThreadChatClock } from "./types";

type ReasoningStreamPart = {
  finishReason?: string;
  id?: string;
  response?: {
    modelId?: string | null;
  };
  totalUsage?: {
    outputTokenDetails?: {
      reasoningTokens?: number;
    };
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  };
  type: string;
};

function buildMergedReasoningDurations(messages: ThreadUIMessage[]) {
  const responseMessage = [...messages].reverse().find((message) => {
    return message.role === "assistant";
  });

  if (!responseMessage) return undefined;

  const rawDurations =
    responseMessage.metadata?.reasoning?.rawSegmentDurationsMs ?? [];
  if (rawDurations.length === 0) return undefined;

  const mergedDurations: number[] = [];
  let rawIndex = 0;
  let partIndex = 0;

  while (partIndex < responseMessage.parts.length) {
    const part = responseMessage.parts[partIndex];
    if (!part) {
      partIndex += 1;
      continue;
    }

    if (part.type !== "reasoning") {
      partIndex += 1;
      continue;
    }

    let mergedDuration = 0;
    while (
      partIndex < responseMessage.parts.length &&
      responseMessage.parts[partIndex]?.type === "reasoning"
    ) {
      mergedDuration += rawDurations[rawIndex] ?? 0;
      rawIndex += 1;
      partIndex += 1;
    }

    mergedDurations.push(mergedDuration);
  }

  return mergedDurations;
}

export type ReasoningMetadataTracker = {
  finalize(
    messages: ThreadUIMessage[],
    responseMessage: ThreadUIMessage,
  ): ThreadUIMessage[];
  getMessageMetadata(part: ReasoningStreamPart): ThreadMessageMetadata | undefined;
};

export function createReasoningMetadataTracker({
  clock,
  providerId,
  requestedModelId,
}: {
  clock: ThreadChatClock;
  providerId: string;
  requestedModelId: string;
}): ReasoningMetadataTracker {
  const reasoningStartTimes = new Map<string, number>();
  const rawReasoningDurationsMs: number[] = [];
  let accumulatedReasoningDurationMs = 0;

  return {
    finalize(messages, responseMessage) {
      const mergedDurations = buildMergedReasoningDurations(messages);

      return messages.map((message) => {
        if (message.id !== responseMessage.id) {
          return message;
        }

        return {
          ...message,
          metadata: mergeThreadMessageMetadata(message.metadata, {
            reasoning: {
              ...(mergedDurations ? { segmentDurationsMs: mergedDurations } : {}),
            },
          }),
        };
      });
    },

    getMessageMetadata(part) {
      if (part.type === "reasoning-start") {
        const now = clock.now();
        if (!part.id) {
          return undefined;
        }

        reasoningStartTimes.set(part.id, now);

        return {
          reasoning: {
            activeSinceMs: now,
            durationMs: accumulatedReasoningDurationMs,
            isActive: true,
            rawSegmentDurationsMs: [...rawReasoningDurationsMs],
          },
        };
      }

      if (part.type === "reasoning-end") {
        if (!part.id) {
          return undefined;
        }

        const startedAt = reasoningStartTimes.get(part.id);
        if (startedAt !== undefined) {
          const durationMs = Math.max(0, clock.now() - startedAt);
          accumulatedReasoningDurationMs += durationMs;
          rawReasoningDurationsMs.push(durationMs);
          reasoningStartTimes.delete(part.id);
        }

        return {
          reasoning: {
            activeSinceMs: null,
            durationMs: accumulatedReasoningDurationMs,
            isActive: false,
            rawSegmentDurationsMs: [...rawReasoningDurationsMs],
          },
        };
      }

      if (part.type === "finish-step") {
        return {
          model: {
            providerId,
            requestedModelId,
            responseModelId: part.response?.modelId ?? undefined,
          },
        };
      }

      if (part.type === "finish") {
        if (!part.totalUsage) {
          return undefined;
        }

        if (reasoningStartTimes.size > 0) {
          for (const [, startedAt] of reasoningStartTimes) {
            const durationMs = Math.max(0, clock.now() - startedAt);
            accumulatedReasoningDurationMs += durationMs;
            rawReasoningDurationsMs.push(durationMs);
          }
          reasoningStartTimes.clear();
        }

        return {
          finishReason: part.finishReason,
          model: {
            providerId,
            requestedModelId,
          },
          reasoning: {
            activeSinceMs: null,
            durationMs: accumulatedReasoningDurationMs,
            isActive: false,
            rawSegmentDurationsMs: [...rawReasoningDurationsMs],
          },
          usage: {
            outputTokens: part.totalUsage.outputTokens,
            reasoningTokens:
              part.totalUsage.outputTokenDetails?.reasoningTokens ??
              part.totalUsage.reasoningTokens,
            totalTokens: part.totalUsage.totalTokens,
          },
        };
      }

      return undefined;
    },
  };
}
