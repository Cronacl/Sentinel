import { normalizeThreadMode } from "@/lib/plan";

import * as persist from "../../persistence";
import { loadThreadSessionSnapshot } from "../../session/server";
import { disposeShellSession } from "../../tools/shell";
import type { ThreadChatRequest } from "../../types";
import {
  resolveThreadEngine,
  stopThreadEngine,
  type LoadedThread,
} from "./engine-dispatcher";
import { getFirstUserText } from "../transcript";
import { activeRunControls } from "./run-state";

export type ParsedThreadChatRunner = (
  rawInput: unknown,
  userId: string,
  options?: { detached?: boolean },
) => Promise<Response>;

type FollowUpRuntime = {
  runParsedThreadChat: ParsedThreadChatRunner;
};

// The queue gets the parsed runner injected so queued turns can recurse without
// this module importing the orchestrator and creating a runtime cycle.
export async function handleStopStream(
  request: ThreadChatRequest,
  runtime: FollowUpRuntime,
): Promise<Response> {
  const thread = await persist.loadThread(request.threadId);
  const activeRunId = thread?.activeStreamId ?? null;
  const activeRunControl = activeRunId
    ? activeRunControls.get(activeRunId)
    : undefined;

  if (request.messageId) {
    await persist.updateMessageMetadata(request.threadId, request.messageId, {
      errorMessage: "Generation stopped.",
      statusLabel: null,
      status: "cancelled",
    });
  }

  if (activeRunControl && !activeRunControl.cancelled) {
    activeRunControl.cancelled = true;
    activeRunControl.abortController.abort(new Error("Generation stopped."));
  }

  await disposeShellSession(request.threadId);
  persist.clearActiveStream(request.threadId);
  persist.setThreadStatus(request.threadId, "idle");

  if (activeRunId && activeRunControl) {
    const snapshot = await loadThreadSessionSnapshot(request.threadId);
    if (snapshot) {
      activeRunControl.eventChannel.emit({
        snapshot,
        type: "thread.snapshot",
      });
    }
    activeRunControl.eventChannel.emit({
      ...(request.messageId ? { messageId: request.messageId } : {}),
      runId: activeRunId,
      threadStatus: "idle",
      type: "run.cancelled",
    });
    activeRunControl.eventChannel.close();
    activeRunControls.delete(activeRunId);
  }

  await drainFollowUpQueue(request, runtime);
  return new Response(null, { status: 204 });
}

export async function handleFollowUpAction(
  request: ThreadChatRequest,
  existingThread: LoadedThread,
  position: "front" | "tail",
  runtime: FollowUpRuntime,
): Promise<Response> {
  if (!request.message || !request.modelId) {
    throw new Error("Queued follow-ups require a message payload and model.");
  }

  const threadMode = normalizeThreadMode(
    request.threadMode ?? existingThread?.mode,
  );
  const fallbackTitle =
    getFirstUserText([request.message])?.slice(0, 100) ?? "New thread";

  await persist.ensureThread(
    request.threadId,
    request.userId,
    request.workspaceId,
    fallbackTitle,
    threadMode,
    existingThread?.chatEngine ?? request.engine ?? "sentinel",
  );

  const payload = {
    id: request.message.id,
    modelId: request.modelId,
    parts: request.message.parts,
    reasoningEffort: request.reasoningEffort ?? null,
    threadId: request.threadId,
    threadMode,
  } as const;

  if (position === "front") {
    persist.enqueueThreadFollowUpAtFront(payload);
  } else {
    persist.enqueueThreadFollowUp(payload);
  }

  const latestThread = await persist.loadThread(request.threadId);
  const shouldInterruptActiveRun =
    latestThread?.activeStreamId != null ||
    latestThread?.status === "streaming" ||
    latestThread?.status === "awaiting_approval";

  if (position === "front" && shouldInterruptActiveRun) {
    const latestAssistantId = await persist.getLatestAssistantMessageId(
      request.threadId,
    );
    const stopRequest = {
      ...request,
      ...(latestAssistantId ? { messageId: latestAssistantId } : {}),
      trigger: "stop-stream",
    } satisfies ThreadChatRequest;
    const engine = resolveThreadEngine(
      stopRequest,
      latestThread ?? existingThread,
    );
    const engineStopResponse = await stopThreadEngine(
      engine,
      stopRequest,
      latestThread,
    );

    return engineStopResponse ?? handleStopStream(stopRequest, runtime);
  }

  await drainFollowUpQueue(request, runtime);
  return new Response(null, { status: 204 });
}

export async function drainFollowUpQueue(
  request: Pick<ThreadChatRequest, "threadId" | "userId" | "workspaceId">,
  runtime: FollowUpRuntime,
) {
  const thread = await persist.loadThread(request.threadId);

  if (!thread) {
    return;
  }

  if (thread.activeStreamId || thread.status === "streaming") {
    return;
  }

  if (thread.status === "awaiting_approval") {
    return;
  }

  persist.resetProcessingThreadFollowUps(request.threadId);
  const nextFollowUp = persist.claimNextThreadFollowUp(request.threadId);

  if (!nextFollowUp) {
    return;
  }

  try {
    await runtime.runParsedThreadChat(
      {
        id: request.threadId,
        message: {
          id: nextFollowUp.id,
          metadata: {},
          parts: nextFollowUp.parts,
          role: "user",
        },
        modelId: nextFollowUp.modelId,
        ...(nextFollowUp.reasoningEffort
          ? { reasoningEffort: nextFollowUp.reasoningEffort }
          : {}),
        threadMode: nextFollowUp.threadMode,
        trigger: "submit-user-message",
        workspaceId: request.workspaceId,
      },
      request.userId,
      { detached: true },
    );
    persist.deleteThreadFollowUp(request.threadId, nextFollowUp.id);
  } catch (error) {
    persist.requeueThreadFollowUp(request.threadId, nextFollowUp.id);
    throw error;
  }
}
