import type { AIProvider } from "@/server/db/enums";
import type { ChatEngine } from "@/server/db/enums";
import type { ProviderOptions } from "@ai-sdk/provider-utils";

import type { ReasoningEffort } from "../providers/models";
import type { ThreadUIMessage } from "../messages/types";
import type { ThreadMode, ThreadPlanAnswer } from "@/lib/plan";
import type { RepoThreadState } from "@/lib/ai/chat/engines/types";
import type { EngineOptionSelection } from "@/lib/ai/chat/engines/contract";
import type { SentinelComposerToolTag } from "@/lib/ai/chat/tools/selection/tags";

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

export type ThreadToolApprovalResponse = {
  approved: boolean;
  decision?: string;
  id: string;
  reason?: string;
  response?: string;
};

export type ThreadOpenCodeOptions = {
  agent?: string | null;
  variant?: string | null;
};

export type ThreadChatRequest = {
  draftRepoState?: Partial<RepoThreadState>;
  engine?: ChatEngine;
  /**
   * The instance of `engine` a new thread binds to; omitted for the
   * default instance. An existing thread keeps its own binding.
   */
  engineInstanceId?: string;
  /**
   * False for unattended runs (automations): a request that would ask the
   * user is declined instead, unless the permission mode allows it outright.
   */
  interactive?: boolean;
  message?: ThreadUIMessage;
  messages?: ThreadUIMessage[];
  messageId?: string;
  modelId?: string;
  /**
   * The model's option selections (reasoning effort, OpenCode agent and
   * variant, …). `reasoningEffort` and `openCode` carry the same values for
   * the runtimes that read them.
   */
  modelOptions?: EngineOptionSelection[];
  openCode?: ThreadOpenCodeOptions;
  planAnswers?: ThreadPlanAnswer[];
  planQuestionSetId?: string;
  reasoningEffort?: ReasoningEffort;
  threadId: string;
  threadMode?: ThreadMode;
  toolsEnabled?: boolean;
  toolTags?: SentinelComposerToolTag[];
  toolApprovalResponse?: ThreadToolApprovalResponse;
  trigger: ThreadChatTrigger;
  userId: string;
  workspaceId: string;
};

type ResolvedThreadModel = {
  contextWindow?: number;
  languageModel: unknown;
  providerId: AIProvider;
  providerOptions?: ProviderOptions;
  requestedModelId: string;
  responseModelId: string;
};

export type ResolvedThreadChatModel = ResolvedThreadModel;

export type ResolvedThreadTitleModel = ResolvedThreadModel;

export type ThreadChatClock = {
  now(): number;
};
