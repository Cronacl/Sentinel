import type { SharedV3ProviderOptions } from "@ai-sdk/provider";

import { createLogger } from "@/lib/logger";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import * as persist from "../persistence";
import {
  applyContextCompaction,
  planContextCompaction,
} from "./context-compaction";

const log = createLogger("ThreadContextCompactionRefresh");

function getCheckpointTimestamp(
  checkpoint: persist.ThreadContextCompactionCheckpoint,
) {
  return checkpoint.updatedAt?.getTime() ?? null;
}

function checkpointsMatch(
  left: persist.ThreadContextCompactionCheckpoint,
  right: persist.ThreadContextCompactionCheckpoint,
) {
  return (
    left.coveredThroughMessageId === right.coveredThroughMessageId &&
    left.summary === right.summary &&
    getCheckpointTimestamp(left) === getCheckpointTimestamp(right)
  );
}

export async function refreshThreadContextCompactionCheckpoint(input: {
  contextWindow?: number | null;
  enabled: boolean;
  fixedWindowSize?: number | null;
  languageModel: unknown;
  onCompactionStart?: () => void | Promise<void>;
  providerOptions?: SharedV3ProviderOptions;
  staleWriteProtection?: boolean;
  threadId: string;
  transcript: ThreadUIMessage[];
  useFixedWindow?: boolean;
  windowPercent: number;
}) {
  const startingCheckpoint = await persist.getThreadContextCompactionCheckpoint(
    input.threadId,
  );
  const result = await applyContextCompaction({
    checkpoint: startingCheckpoint,
    contextWindow: input.contextWindow,
    enabled: input.enabled,
    fixedWindowSize: input.fixedWindowSize,
    languageModel: input.languageModel,
    ...(input.onCompactionStart
      ? { onCompactionStart: input.onCompactionStart }
      : {}),
    ...(input.providerOptions
      ? { providerOptions: input.providerOptions }
      : {}),
    transcript: input.transcript,
    useFixedWindow: input.useFixedWindow,
    windowPercent: input.windowPercent,
  });

  if (!result.updatedCheckpoint) {
    return {
      ...result,
      didPersistCheckpoint: false,
      skippedPersistDueToStaleWrite: false,
      startingCheckpoint,
    };
  }

  if (input.staleWriteProtection) {
    const latestCheckpoint = await persist.getThreadContextCompactionCheckpoint(
      input.threadId,
    );

    if (!checkpointsMatch(latestCheckpoint, startingCheckpoint)) {
      log.debug("Skipping stale background compaction checkpoint write.", {
        latestCheckpointCoveredThroughMessageId:
          latestCheckpoint.coveredThroughMessageId,
        startingCheckpointCoveredThroughMessageId:
          startingCheckpoint.coveredThroughMessageId,
        threadId: input.threadId,
      });
      return {
        ...result,
        didPersistCheckpoint: false,
        skippedPersistDueToStaleWrite: true,
        startingCheckpoint,
      };
    }
  }

  persist.updateThreadContextCompactionCheckpoint(
    input.threadId,
    result.updatedCheckpoint,
  );

  return {
    ...result,
    didPersistCheckpoint: true,
    skippedPersistDueToStaleWrite: false,
    startingCheckpoint,
  };
}

type ContextCompactionRefreshInput = Parameters<
  typeof refreshThreadContextCompactionCheckpoint
>[0];

export async function prepareThreadContextCompactionForGeneration(
  input: ContextCompactionRefreshInput,
) {
  const startingCheckpoint = await persist.getThreadContextCompactionCheckpoint(
    input.threadId,
  );
  const plan = planContextCompaction({
    checkpoint: startingCheckpoint,
    contextWindow: input.contextWindow,
    enabled: input.enabled,
    fixedWindowSize: input.fixedWindowSize,
    transcript: input.transcript,
    useFixedWindow: input.useFixedWindow,
    windowPercent: input.windowPercent,
  });

  if (!plan.shouldGenerateNewSummary) {
    return {
      backgroundRefresh: null,
      mode:
        plan.existingSummary && !plan.checkpointWasInvalid
          ? ("reused" as const)
          : ("none" as const),
      result: {
        checkpointWasInvalid: plan.checkpointWasInvalid,
        didCompact: false,
        didPersistCheckpoint: false,
        inputTokens: plan.exactInputTokens,
        skippedPersistDueToStaleWrite: false,
        startingCheckpoint,
        thresholdTokens: plan.thresholdTokens,
        transcript: plan.transcript,
        updatedCheckpoint: null,
      },
    };
  }

  if (plan.canDeferNewSummary) {
    return {
      backgroundRefresh: refreshThreadContextCompactionCheckpoint({
        ...input,
        staleWriteProtection: true,
      }),
      mode: "deferred" as const,
      result: {
        checkpointWasInvalid: plan.checkpointWasInvalid,
        didCompact: false,
        didPersistCheckpoint: false,
        inputTokens: plan.exactInputTokens,
        skippedPersistDueToStaleWrite: false,
        startingCheckpoint,
        thresholdTokens: plan.thresholdTokens,
        transcript: plan.transcript,
        updatedCheckpoint: null,
      },
    };
  }

  return {
    backgroundRefresh: null,
    mode: "blocking" as const,
    result: await refreshThreadContextCompactionCheckpoint({
      ...input,
      staleWriteProtection: input.staleWriteProtection,
    }),
  };
}
