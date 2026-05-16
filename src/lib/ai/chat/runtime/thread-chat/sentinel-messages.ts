import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import type { PersistedThreadMessageRecord } from "@/lib/ai/messages/branches";

import * as persist from "../../persistence";
import type { ThreadChatRequest } from "../../types";
import type { ThreadEventChannel } from "./run-state";
import { getUserParentMessageId } from "../transcript";

// Message helpers are intentionally persistence-aware: keeping this logic in one
// place protects the user/assistant metadata contract during bootstrap.
export function getThreadAgentRole(
  thread: Awaited<ReturnType<typeof persist.loadThread>> | null | undefined,
) {
  return thread?.visibility === "virtual" || thread?.sourceVirtualThreadId
    ? "subagent"
    : "primary";
}

export function buildPlaceholderMessage(
  request: ThreadChatRequest,
  parentId: string | null,
  assistantId: string,
  continuationAssistant: ThreadUIMessage | undefined,
): ThreadUIMessage {
  if (continuationAssistant) {
    return {
      ...continuationAssistant,
      metadata: mergeThreadMessageMetadata(continuationAssistant.metadata, {
        isActive: true,
        parentMessageId:
          continuationAssistant.metadata?.parentMessageId ?? parentId,
        status: "pending",
      }),
    };
  }

  const branchId =
    request.trigger === "edit-user-message"
      ? request.message?.id
      : (parentId ?? assistantId);

  return {
    id: assistantId,
    role: "assistant",
    parts: [{ text: " ", type: "text" }],
    metadata: {
      branchId,
      isActive: true,
      parentMessageId: parentId,
      status: "pending",
    },
  };
}

export function persistUserMessage(
  request: ThreadChatRequest,
  transcript: ThreadUIMessage[],
  allRecords: PersistedThreadMessageRecord[],
  runId?: string,
): string | null {
  if (
    !request.message ||
    (request.trigger !== "submit-user-message" &&
      request.trigger !== "edit-user-message")
  ) {
    return null;
  }

  const parentMessageId = getUserParentMessageId(
    request,
    transcript,
    allRecords,
  );

  const userMsg: ThreadUIMessage = {
    ...request.message,
    metadata: mergeThreadMessageMetadata(request.message.metadata, {
      branchId: request.message.id,
      isActive: true,
      parentMessageId,
      ...(runId ? { runId } : {}),
      status: "completed",
      ...(request.trigger === "edit-user-message" && request.messageId
        ? { editedFromMessageId: request.messageId }
        : {}),
    }),
  };

  persist.upsertMessage(request.threadId, userMsg);
  return userMsg.id;
}

export function persistAssistantSnapshot(
  threadId: string,
  runId: string,
  message: ThreadUIMessage,
) {
  return persist.upsertMessage(threadId, {
    ...message,
    metadata: mergeThreadMessageMetadata(message.metadata, {
      runId,
      statusLabel: null,
      status: "streaming",
    }),
  });
}

export function updatePendingAssistantStatusLabel(
  threadId: string,
  message: ThreadUIMessage,
  statusLabel: string | null,
) {
  return persist.upsertMessage(threadId, {
    ...message,
    metadata: mergeThreadMessageMetadata(message.metadata, {
      statusLabel,
    }),
  });
}

export function emitPendingAssistantStatusLabel(
  run: {
    eventChannel: ThreadEventChannel;
    placeholderMessage: ThreadUIMessage;
    request: Pick<ThreadChatRequest, "threadId">;
    runId: string;
  },
  statusLabel: string | null,
) {
  if (run.placeholderMessage.metadata?.statusLabel === statusLabel) {
    return;
  }

  const nextMessage = updatePendingAssistantStatusLabel(
    run.request.threadId,
    run.placeholderMessage,
    statusLabel,
  );
  run.placeholderMessage = nextMessage;
  run.eventChannel.emit({
    message: nextMessage,
    runId: run.runId,
    type: "message.upsert",
  });
}

export function getInitialPendingStatusLabel(
  trigger: ThreadChatRequest["trigger"],
) {
  switch (trigger) {
    case "retry-assistant-message":
      return "Retrying response...";
    case "regenerate-assistant-message":
      return "Regenerating response...";
    case "edit-user-message":
      return "Updating response...";
    case "submit-tool-approval":
      return "Resuming after approval...";
    case "submit-plan-answer":
      return "Continuing with plan answers...";
    case "submit-user-message":
    default:
      return "Preparing workspace...";
  }
}

export function findContinuationAssistant(
  request: ThreadChatRequest,
  modelTranscript: ThreadUIMessage[],
): ThreadUIMessage | undefined {
  const isContinuation =
    request.trigger === "submit-tool-approval" ||
    request.trigger === "submit-plan-answer";

  if (!isContinuation) return undefined;

  return [...modelTranscript]
    .reverse()
    .find((message) => message.role === "assistant");
}
