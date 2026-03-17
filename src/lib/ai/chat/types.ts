import type { AIProvider } from "@/server/db/enums";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";

import type { ReasoningEffort } from "../providers/models";
import type { ThreadUIMessage } from "../messages/types";
import type { ThreadMode, ThreadPlanAnswer } from "@/lib/plan";

export type ThreadChatTrigger =
  | "submit-user-message"
  | "queue-follow-up"
  | "steer-follow-up"
  | "submit-plan-answer"
  | "submit-tool-approval"
  | "retry-assistant-message"
  | "regenerate-assistant-message"
  | "edit-user-message"
  | "stop-stream";

export type ThreadChatRequest = {
  message?: ThreadUIMessage;
  messages?: ThreadUIMessage[];
  messageId?: string;
  modelId?: string;
  planAnswers?: ThreadPlanAnswer[];
  planQuestionSetId?: string;
  reasoningEffort?: ReasoningEffort;
  threadId: string;
  threadMode?: ThreadMode;
  trigger: ThreadChatTrigger;
  userId: string;
  workspaceId: string;
};

type ResolvedThreadModel = {
  languageModel: unknown;
  providerId: AIProvider;
  providerOptions?: SharedV3ProviderOptions;
  requestedModelId: string;
  responseModelId: string;
};

export type ResolvedThreadChatModel = ResolvedThreadModel;

export type ResolvedThreadTitleModel = ResolvedThreadModel;

export type ThreadChatClock = {
  now(): number;
};
