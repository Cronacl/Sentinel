import type { ThreadSessionSnapshot } from "@/lib/ai/chat/session-types";
import type { RouterOutputs } from "@/trpc/react";
import {
  isThreadRouteHandoffFresh,
  type ThreadRouteHandoffState,
} from "./thread-route-handoff";

type ThreadDetails = RouterOutputs["threads"]["get"];

function shouldPreferLiveSnapshot(
  baseThread: ThreadDetails,
  liveSnapshot: ThreadSessionSnapshot,
) {
  return (
    liveSnapshot.messages.length > baseThread.messages.length ||
    liveSnapshot.queuedFollowUps.length > baseThread.queuedFollowUps.length ||
    (liveSnapshot.activeRunId != null &&
      liveSnapshot.activeRunId !== baseThread.thread.activeRunId) ||
    ((liveSnapshot.threadStatus === "streaming" ||
      liveSnapshot.threadStatus === "awaiting_approval") &&
      liveSnapshot.threadStatus !== baseThread.thread.status) ||
    (liveSnapshot.threadTitle !== baseThread.thread.title &&
      liveSnapshot.messages.length >= baseThread.messages.length)
  );
}

export function resolveThreadRouteData(
  baseThread: ThreadDetails | undefined,
  liveSnapshot: ThreadSessionSnapshot | null,
): ThreadDetails | undefined {
  if (!baseThread) {
    return undefined;
  }

  if (!liveSnapshot || !shouldPreferLiveSnapshot(baseThread, liveSnapshot)) {
    return baseThread;
  }

  return {
    messages: liveSnapshot.messages,
    queuedFollowUps: liveSnapshot.queuedFollowUps,
    thread: {
      ...baseThread.thread,
      activeRunId: liveSnapshot.activeRunId,
      chatEngine: liveSnapshot.chatEngine,
      status: liveSnapshot.threadStatus,
      title: liveSnapshot.threadTitle,
    },
    workspace: baseThread.workspace,
  };
}

export function resolveThreadRouteComposerUiState(
  baseThread: ThreadDetails | undefined,
  handoff: ThreadRouteHandoffState | null,
  now = Date.now(),
) {
  if (!baseThread || !handoff) {
    return null;
  }

  if (
    handoff.threadId !== baseThread.thread.id ||
    !isThreadRouteHandoffFresh(handoff, now)
  ) {
    return null;
  }

  return handoff;
}
