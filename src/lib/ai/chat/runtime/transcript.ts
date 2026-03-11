import {
  buildActiveThreadMessages,
  getLatestVisibleMessageId,
  getMessageRecordById,
  type PersistedThreadMessageRecord,
} from "@/lib/ai/branches";
import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/message-types";

import type { ThreadChatRequest } from "../types";

export function getFirstUserText(messages: ThreadUIMessage[]): string | null {
  const first = messages.find((m) => m.role === "user");
  return (
    first?.parts.find(
      (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
    )?.text ?? null
  );
}

export function buildModelTranscript(
  request: ThreadChatRequest,
  transcript: ThreadUIMessage[],
  allRecords: PersistedThreadMessageRecord[],
): ThreadUIMessage[] {
  const sourceTranscript =
    request.trigger === "retry-assistant-message" ||
    request.trigger === "regenerate-assistant-message"
      ? transcript
      : (request.messages ?? transcript);

  switch (request.trigger) {
    case "submit-user-message":
      return request.messages ??
        (request.message ? [...transcript, request.message] : transcript);

    case "submit-tool-approval":
      return sourceTranscript;

    case "edit-user-message": {
      const idx = sourceTranscript.findIndex((m) => m.id === request.messageId);
      if (idx === -1 || !request.message) {
        return sourceTranscript;
      }
      return [
        ...sourceTranscript.slice(0, idx),
        {
          ...request.message,
          metadata: mergeThreadMessageMetadata(request.message.metadata, {
            branchId: request.message.id,
            editedFromMessageId: request.messageId,
            isActive: true,
            parentMessageId:
              sourceTranscript[idx - 1]?.id ??
              getMessageRecordById(allRecords, request.messageId ?? "")
                ?.parentMessageId ??
              null,
            status: "completed",
          }),
        },
      ];
    }

    case "retry-assistant-message":
    case "regenerate-assistant-message": {
      const idx = sourceTranscript.findIndex((m) => m.id === request.messageId);
      if (idx === -1) {
        return sourceTranscript;
      }
      return sourceTranscript.slice(
        0,
        sourceTranscript[idx]?.role === "assistant" ? idx : idx + 1,
      );
    }

    default:
      return transcript;
  }
}

export function getParentMessageId(
  request: ThreadChatRequest,
  allRecords: PersistedThreadMessageRecord[],
): string | null {
  switch (request.trigger) {
    case "submit-user-message":
      return request.message?.id ?? getLatestVisibleMessageId(allRecords);
    case "submit-tool-approval": {
      const assistantMessage = [...(request.messages ?? [])]
        .reverse()
        .find((message) => message.role === "assistant");
      return assistantMessage?.metadata?.parentMessageId ?? null;
    }
    case "edit-user-message":
      return request.message?.id ?? null;
    case "retry-assistant-message":
    case "regenerate-assistant-message":
      return (
        getMessageRecordById(allRecords, request.messageId ?? "")
          ?.parentMessageId ?? null
      );
    default:
      return null;
  }
}

export { buildActiveThreadMessages };
