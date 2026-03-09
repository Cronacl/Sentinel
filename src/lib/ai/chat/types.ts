import type { AIProvider } from "@/../generated/prisma";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";

import type { PersistedThreadMessageRecord } from "../thread-branches";
import type { ReasoningEffort } from "../models";
import type { ThreadMessageMetadata, ThreadUIMessage } from "../thread-message-types";

export type ThreadChatTrigger =
  | "submit-user-message"
  | "retry-assistant-message"
  | "regenerate-assistant-message"
  | "edit-user-message"
  | "stop-stream";

export type ThreadChatRequestBody = {
  id: string;
  message?: ThreadUIMessage;
  messageId?: string;
  messages?: ThreadUIMessage[];
  modelId?: string;
  reasoningEffort?: ReasoningEffort;
  trigger?: ThreadChatTrigger;
  workspaceId: string;
};

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

export type ThreadConversationState = {
  existingMessages: PersistedThreadMessageRecord[];
  isNewThread: boolean;
  request: ThreadChatRequest;
  targetMessage?: PersistedThreadMessageRecord;
  transcript: ThreadUIMessage[];
};

export type ResolvedThreadChatModel = {
  languageModel: unknown;
  providerId: AIProvider;
  providerOptions?: SharedV3ProviderOptions;
  requestedModelId: string;
  responseModelId: string;
};

export type EnsureThreadInput = {
  threadId: string;
  title: string;
  userId: string;
  workspaceId: string;
};

export type EnsureThreadResult = {
  created: boolean;
};

export type UpsertThreadMessageInput = {
  createdAt?: Date;
  message: ThreadUIMessage;
  threadId: string;
};

export type UpdateThreadMessageMetadataInput = {
  messageId: string;
  metadata: ThreadMessageMetadata;
  threadId: string;
};

export type SetActiveMessageInput = {
  messageId: string;
  threadId: string;
};

export type ChatPersistenceAdapter = {
  ensureThread(input: EnsureThreadInput): Promise<EnsureThreadResult>;
  getThreadMessages(threadId: string): Promise<PersistedThreadMessageRecord[]>;
  setActiveMessage(input: SetActiveMessageInput): Promise<void>;
  updateThreadMessageMetadata(input: UpdateThreadMessageMetadataInput): Promise<void>;
  upsertThreadMessage(input: UpsertThreadMessageInput): Promise<void>;
  updateThreadTitle(input: { threadId: string; title: string }): Promise<void>;
};

export type ThreadChatClock = {
  now(): number;
};

export type ThreadChatModelResolver = (
  request: ThreadChatRequest,
  conversation: ThreadConversationState,
) => Promise<ResolvedThreadChatModel>;

export type ThreadChatDependencies = {
  clock: ThreadChatClock;
  persistence: ChatPersistenceAdapter;
  resolveModel: ThreadChatModelResolver;
};

export type RunThreadChatOptions = {
  deps?: Partial<ThreadChatDependencies>;
  userId: string;
};
