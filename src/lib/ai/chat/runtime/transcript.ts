import {
  buildActiveThreadMessages,
  getLatestVisibleMessageId,
  getMessageRecordById,
  type PersistedThreadMessageRecord,
} from "@/lib/ai/messages/branches";
import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import { serializeComposerContextToText } from "@/lib/composer-context/serialize";

import type { ThreadChatRequest } from "../types";

export function getFirstUserText(messages: ThreadUIMessage[]): string | null {
  const first = messages.find((m) => m.role === "user");
  return (
    first?.parts.find(
      (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
    )?.text ?? null
  );
}

export function truncateTranscriptAtMessage(
  transcript: ThreadUIMessage[],
  messageId: string | null | undefined,
) {
  if (!messageId) {
    return transcript;
  }

  const index = transcript.findIndex((message) => message.id === messageId);
  return index === -1 ? transcript : transcript.slice(0, index + 1);
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
      return (
        request.messages ??
        (request.message ? [...transcript, request.message] : transcript)
      );

    case "submit-tool-approval":
    case "submit-plan-answer":
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
            parentMessageId: getUserParentMessageId(
              request,
              sourceTranscript,
              allRecords,
            ),
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
    case "submit-tool-approval":
    case "submit-plan-answer": {
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

export function getUserParentMessageId(
  request: ThreadChatRequest,
  transcript: ThreadUIMessage[],
  allRecords: PersistedThreadMessageRecord[],
): string | null {
  switch (request.trigger) {
    case "submit-user-message":
      return transcript.at(-1)?.id ?? getLatestVisibleMessageId(allRecords);
    case "edit-user-message":
      return (
        transcript.find((message) => message.id === request.messageId)?.metadata
          ?.parentMessageId ??
        getMessageRecordById(allRecords, request.messageId ?? "")
          ?.parentMessageId ??
        null
      );
    default:
      return null;
  }
}

/**
 * Prepends serialized composer context to user message text parts in the
 * transcript so the model receives referenced file/skill context.
 */
export function injectComposerContextIntoTranscript(
  messages: ThreadUIMessage[],
): ThreadUIMessage[] {
  return messages.map((message) => {
    if (message.role !== "user") return message;

    const composerContext = message.metadata?.composerContext;
    if (
      !composerContext ||
      ((composerContext.paths?.length ?? 0) === 0 &&
        (composerContext.skills?.length ?? 0) === 0)
    ) {
      return message;
    }

    const prefix = serializeComposerContextToText(composerContext);
    if (!prefix) return message;

    let injected = false;
    const parts = message.parts.map((part) => {
      if (part.type === "text" && !injected) {
        injected = true;
        return { ...part, text: `${prefix}\n\n${part.text}` };
      }
      return part;
    });

    if (!injected) {
      parts.unshift({ text: prefix, type: "text" as const });
    }

    return { ...message, parts } as ThreadUIMessage;
  });
}

export { buildActiveThreadMessages };
