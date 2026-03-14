import type { AIProvider } from "@/server/db/enums";
import {
  getModelAttachmentCapabilities,
  getDefaultReasoningEffort,
  getSupportedReasoningEfforts,
  type ReasoningEffort,
} from "@/lib/ai/providers/models";
import type { AttachmentKind } from "@/lib/files/chat-attachment-types";

export type ChatComposerModel = {
  displayName: string;
  modelId: string;
  provider: AIProvider;
};

export function getReasoningEffortLabel(effort: ReasoningEffort) {
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

export function resolveReasoningEffort(
  provider: AIProvider,
  modelId: string,
  preferredEffort?: ReasoningEffort | null,
) {
  const supportedEfforts = getSupportedReasoningEfforts(provider, modelId);
  if (supportedEfforts.length === 0) {
    return null;
  }

  if (preferredEffort && supportedEfforts.includes(preferredEffort)) {
    return preferredEffort;
  }

  return getDefaultReasoningEffort(provider, modelId);
}

export function getAttachmentKindLabel(kind: AttachmentKind) {
  switch (kind) {
    case "image":
      return "images";
    case "document":
      return "documents";
    case "code-text":
      return "text/code files";
    case "archive":
      return "archives";
    case "audio":
      return "audio files";
    case "video":
      return "video files";
    default:
      return "files";
  }
}

export function supportsAttachmentKind(
  kind: AttachmentKind,
  capabilities: ReturnType<typeof getModelAttachmentCapabilities>,
) {
  switch (kind) {
    case "image":
      return capabilities.supportsImages;
    case "document":
      return capabilities.supportsDocuments;
    case "code-text":
      return capabilities.supportsCodeTextFiles;
    default:
      return false;
  }
}
