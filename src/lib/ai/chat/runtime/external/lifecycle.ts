import "server-only";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import { createLogger } from "@/lib/logger";

import { normalizeThreadChatErrorMessage } from "../../errors";
import * as persist from "../../persistence";
import type { ThreadChatRequest } from "../../types";
import {
  clearExternalRuntimeRepoCheckpoint,
  finalizeExternalRuntimeRepoCheckpoint,
} from "../external-runtime";
import {
  emitLatestThreadSnapshot,
  type ThreadEventChannel,
} from "../thread-chat/run-state";

// How an external run ends (design acp-and-agents §1.5, §2.12): the repo
// checkpoint, the final message status, run.finished / run.failed /
// run.cancelled, the stream closed, and then the generic follow-up queue
// (thread-chat/follow-up-queue.ts) drained after the caller returned, so a
// Stop request never waits for the next queued turn to start.

const log = createLogger("ExternalRunLifecycle");

export {
  outcomeFromStopReason,
  type ExternalRunOutcome,
} from "./lifecycle-outcome";

export type ExternalRunControl = {
  assistantId: string;
  eventChannel: ThreadEventChannel;
  finished: boolean;
  runId: string;
  threadId: string;
  userId: string;
  workspaceId: string;
};

export type FinishExternalRunInput = {
  errorMessage?: string | null;
  /** Default message for a failure without one ("Cursor run failed."). */
  failureMessage: string;
  finishReason?: string | null;
  /** Persists the final message with this metadata and returns it. */
  persistMessage: (metadata: {
    errorMessage: string | null;
    finishReason: string | null;
    repoCheckpointId: string | null;
    status: "cancelled" | "completed" | "error";
    statusLabel: string | null;
  }) => ThreadUIMessage;
  status: "cancelled" | "completed" | "error";
  statusLabel?: string | null;
};

export type FinishExternalRunDeps = {
  drain?: (
    request: Pick<ThreadChatRequest, "threadId" | "userId" | "workspaceId">,
  ) => void;
};

/** Ends the run once (later calls are no-ops). */
export async function finishExternalRun(
  control: ExternalRunControl,
  input: FinishExternalRunInput,
  deps: FinishExternalRunDeps = {},
) {
  if (control.finished) {
    return false;
  }
  control.finished = true;

  const errorMessage =
    input.status === "error"
      ? normalizeThreadChatErrorMessage(
          input.errorMessage,
          input.failureMessage,
        )
      : (input.errorMessage ?? null);
  const repoCheckpointId =
    input.status === "completed"
      ? await finalizeExternalRuntimeRepoCheckpoint({
          assistantMessageId: control.assistantId,
          runId: control.runId,
          threadId: control.threadId,
        }).catch(() => null)
      : (await clearExternalRuntimeRepoCheckpoint(control.runId).catch(
          () => undefined,
        ),
        null);

  persist.clearActiveStream(control.threadId);
  persist.setThreadStatus(control.threadId, "idle");

  const message = input.persistMessage({
    errorMessage,
    finishReason: input.finishReason ?? null,
    repoCheckpointId: repoCheckpointId ?? null,
    status: input.status,
    statusLabel: input.statusLabel ?? null,
  });
  control.eventChannel.emit({
    message,
    runId: control.runId,
    type: "message.upsert",
  });
  control.eventChannel.emit({
    messageId: control.assistantId,
    runId: control.runId,
    status: input.status,
    type: "message.status",
  });
  await emitLatestThreadSnapshot(
    control.threadId,
    control.eventChannel,
    control.runId,
  ).catch(() => null);

  if (input.status === "cancelled") {
    control.eventChannel.emit({
      messageId: control.assistantId,
      runId: control.runId,
      threadStatus: "idle",
      type: "run.cancelled",
    });
  } else if (input.status === "error") {
    log.error("external_run_failed", {
      error: errorMessage,
      runId: control.runId,
      threadId: control.threadId,
    });
    control.eventChannel.emit({
      error: errorMessage ?? input.failureMessage,
      messageId: control.assistantId,
      runId: control.runId,
      threadStatus: "idle",
      type: "run.failed",
    });
  } else {
    control.eventChannel.emit({
      runId: control.runId,
      threadStatus: "idle",
      type: "run.finished",
    });
  }
  control.eventChannel.close();

  (deps.drain ?? scheduleFollowUpDrain)({
    threadId: control.threadId,
    userId: control.userId,
    workspaceId: control.workspaceId,
  });
  return true;
}

/**
 * Starts the thread's next queued follow-up through the generic queue (the
 * same path the built-in engine uses: instance, engine and options come from
 * the thread and the follow-up), on the next tick.
 */
export function scheduleFollowUpDrain(
  request: Pick<ThreadChatRequest, "threadId" | "userId" | "workspaceId">,
) {
  setTimeout(() => {
    void (async () => {
      // Loaded lazily: the orchestrator imports the driver registry, which
      // loads this runtime.
      const [{ drainFollowUpQueue }, { runParsedThreadChat }] =
        await Promise.all([
          import("../thread-chat/follow-up-queue"),
          import("../thread-chat/orchestrator"),
        ]);
      await drainFollowUpQueue(request, { runParsedThreadChat });
    })().catch((error: unknown) => {
      log.warn("external_follow_up_drain_failed", {
        error,
        threadId: request.threadId,
      });
    });
  }, 0);
}
