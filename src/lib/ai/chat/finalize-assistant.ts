import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "../thread-message-types";

export function buildPersistedAssistantMessage({
  assistantId,
  errorMessage,
  finalAssistant,
  placeholder,
}: {
  assistantId: string;
  errorMessage?: string;
  finalAssistant?: ThreadUIMessage;
  placeholder: ThreadUIMessage;
}): ThreadUIMessage {
  const merged = finalAssistant ?? placeholder;

  return {
    ...merged,
    id: assistantId,
    metadata: mergeThreadMessageMetadata(
      mergeThreadMessageMetadata(placeholder.metadata, merged.metadata ?? {}),
      {
        ...(errorMessage ? { errorMessage } : {}),
        finishReason: merged.metadata?.finishReason,
        isActive: true,
        status: errorMessage ? "error" : "completed",
      },
    ),
  };
}
