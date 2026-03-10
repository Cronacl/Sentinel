import type { AIProvider } from "@/server/db/enums";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";

import type { ReasoningEffort } from "../models";
import type { ThreadUIMessage } from "../thread-message-types";

export type ThreadChatTrigger =
  | "submit-user-message"
  | "retry-assistant-message"
  | "regenerate-assistant-message"
  | "edit-user-message"
  | "stop-stream";

export type ThreadChatRequest = {
  message?: ThreadUIMessage;
  messageId?: string;
  modelId?: string;
  reasoningEffort?: ReasoningEffort;
  threadId: string;
  trigger: ThreadChatTrigger;
  userId: string;
  workspaceId: string;
};

export type ResolvedThreadChatModel = {
  languageModel: unknown;
  providerId: AIProvider;
  providerOptions?: SharedV3ProviderOptions;
  requestedModelId: string;
  responseModelId: string;
};

export type ThreadChatClock = {
  now(): number;
};
