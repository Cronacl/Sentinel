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
  const placeholderMetadata = placeholder.metadata ?? {};

  return {
    ...merged,
    id: assistantId,
    metadata: mergeThreadMessageMetadata(
      mergeThreadMessageMetadata(placeholder.metadata, merged.metadata ?? {}),
      {
        branchId: placeholderMetadata.branchId,
        editedFromMessageId: placeholderMetadata.editedFromMessageId,
        ...(errorMessage ? { errorMessage } : {}),
        finishReason: merged.metadata?.finishReason,
        isActive: true,
        parentMessageId: placeholderMetadata.parentMessageId ?? null,
        status: errorMessage ? "error" : "completed",
      },
    ),
  };
}
