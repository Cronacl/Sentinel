import type { SharedV3ProviderOptions } from "@ai-sdk/provider";

import { createLogger } from "@/lib/logger";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import * as persist from "../persistence";
import { applyContextCompaction } from "./context-compaction";

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
