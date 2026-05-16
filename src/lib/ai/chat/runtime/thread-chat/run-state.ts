import {
  safelyCloseReadableStreamController,
  safelyEnqueueReadableStreamController,
  streamContext,
} from "@/lib/streams";

import * as persist from "../../persistence";
import {
  loadThreadSessionSnapshot,
  serializeThreadStreamEvent,
} from "../../session/server";
import type { ThreadStreamEvent } from "../../session/types";

export type ThreadEventChannel = Awaited<
  ReturnType<typeof createThreadEventChannel>
>;

export type ActiveRunControl = {
  abortController: AbortController;
  cancelled: boolean;
  eventChannel: ThreadEventChannel;
};

// Process-local controls mirror resumable streams so stop/steer actions can
// interrupt an in-flight Sentinel run without changing the HTTP stream contract.
export const activeRunControls = new Map<string, ActiveRunControl>();

export async function streamStillOwnsThread(
  threadId: string,
  streamId: string | null,
) {
  if (!streamId) {
    return true;
  }

  const currentThread = await persist.loadThread(threadId);
  if (!currentThread) {
    return true;
  }

  return currentThread?.activeStreamId === streamId;
}

export async function createThreadEventChannel(runId: string) {
  let controller: ReadableStreamDefaultController<string> | null = null;
  let closed = false;

  await streamContext.createNewResumableStream(
    runId,
    () =>
      new ReadableStream<string>({
        start(nextController) {
          controller = nextController;
        },
      }),
  );

  return {
    close() {
      if (closed) {
        return;
      }

      closed = true;
      safelyCloseReadableStreamController(controller);
      controller = null;
    },
    emit(event: ThreadStreamEvent) {
      if (closed) {
        return;
      }

      const didEnqueue = safelyEnqueueReadableStreamController(
        controller,
        serializeThreadStreamEvent(event),
      );

      if (!didEnqueue) {
        closed = true;
        controller = null;
      }
    },
  };
}

export async function emitLatestThreadSnapshot(
  threadId: string,
  eventChannel: ThreadEventChannel,
  runId?: string,
) {
  const snapshot = await loadThreadSessionSnapshot(threadId);
  if (!snapshot) {
    return null;
  }

  eventChannel.emit({
    snapshot,
    type: "thread.snapshot",
  });

  if (runId) {
    eventChannel.emit({
      queuedFollowUps: snapshot.queuedFollowUps,
      runId,
      type: "queue.snapshot",
    });
  }

  return snapshot;
}
