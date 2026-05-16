import type { FileUIPart } from "ai";

import type { QueuedFollowUpSummary } from "@/lib/ai/chat/session/types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ComposerContext } from "@/lib/composer-context/types";
import type { RepoThreadState } from "@/lib/ai/chat/engines/types";
import type { SentinelComposerToolTag } from "@/lib/ai/chat/tools/selection/tags";
import type { ChatEngine } from "@/server/db/enums";
import type { DraftProjectMode } from "../draft-thread-project-mode";

export type { QueuedFollowUpSummary } from "@/lib/ai/chat/session/types";

export type ChatComposerOpenCodeSelection = {
  agent: string | null;
  variant: string | null;
};

export type ChatComposerThreadSelection = {
  engine?: ChatEngine;
  modelId: string | null;
  mode?: "chat" | "plan";
  reasoningEffort?: ReasoningEffort | null;
};

export type ComposerSendInput = {
  composerContext?: ComposerContext;
  draftRepoState?: Partial<RepoThreadState>;
  engine: ChatEngine;
  files?: FileUIPart[];
  modelId: string;
  openCode?: {
    agent?: string | null;
    variant?: string | null;
  };
  reasoningEffort?: ReasoningEffort | null;
  text: string;
  threadMode?: "chat" | "plan";
  toolTags?: SentinelComposerToolTag[];
};

export type ChatComposerStartPlanImplementationHandler = () => Promise<void>;

export type ChatComposerProps = {
  activeWorkspace?: {
    id: string;
    kind?: "project" | "quick_chat";
    name: string;
    permissionModeOverride?: "default" | "full" | null;
    rootPath?: string | null;
  } | null;
  draftPreparedWorktree?: {
    branch: string;
    path: string;
  } | null;
  draftThreadId?: string;
  draftProjectMode?: DraftProjectMode;
  openCodeSelection?: ChatComposerOpenCodeSelection | null;
  onQueueFollowUp?: (input: ComposerSendInput) => Promise<void> | void;
  onRemoveQueuedFollowUp?: (id: string) => Promise<void> | void;
  onDraftPreparedWorktreeChange?: (
    worktree: { branch: string; path: string } | null,
  ) => void;
  onDraftProjectModeChange?: (mode: DraftProjectMode) => void;
  onOpenCodeSelectionChange?: (
    selection: ChatComposerOpenCodeSelection,
  ) => void;
  onSelectionChange?: (input: {
    engine?: ChatEngine;
    modelId?: string | null;
    mode?: "chat" | "plan";
    reasoningEffort?: ReasoningEffort | null;
  }) => void;
  onStop?: () => void;
  onSend?: (input: ComposerSendInput) => Promise<unknown> | unknown;
  onSteerFollowUp?: (input: ComposerSendInput) => Promise<void> | void;
  onSteerQueuedFollowUp?: (id: string) => Promise<void> | void;
  onCancelEdit?: () => void;
  providerSlashCommandsEnabled?: boolean;
  onRegisterStartPlanImplementation?: (
    handler: ChatComposerStartPlanImplementationHandler | null,
  ) => void;
  onStartPlanImplementationSend?: (
    input: ComposerSendInput,
  ) => Promise<unknown> | unknown;
  attachmentSeed?: FileUIPart[];
  deferRepoContextFetch?: boolean;
  isEditing?: boolean;
  promptSeed?: string;
  promptSeedKey?: string | number;
  queuedFollowUps?: QueuedFollowUpSummary[];
  showBranchSwitcher?: boolean;
  status?: "submitted" | "streaming" | "ready" | "error";
  draftMode?: "chat" | "plan" | null;
  persistThreadSelection?: boolean;
  repoThreadId?: string;
  threadId?: string;
  threadSelection?: ChatComposerThreadSelection | null;
};
