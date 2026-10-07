import type { FileUIPart } from "ai";

import type { ComposerOptionValues } from "@/components/engines/option-descriptors";
import type { EngineOptionSelection } from "@/lib/ai/chat/engines/contract";

import type { QueuedFollowUpSummary } from "@/lib/ai/chat/session/types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ComposerContext } from "@/lib/composer-context/types";
import type { RepoThreadState } from "@/lib/ai/chat/engines/types";
import type { SentinelComposerToolTag } from "@/lib/ai/chat/tools/selection/tags";
import type { ChatEngine, PermissionMode } from "@/server/db/enums";
import type { DraftProjectMode } from "../draft-thread-project-mode";

export type { QueuedFollowUpSummary } from "@/lib/ai/chat/session/types";

/**
 * The selected value of each of the model's composer options (OpenCode
 * agent and variant, …), by option id; null or absent means the default.
 */
export type ChatComposerOptionSelection = ComposerOptionValues;

export type ChatComposerThreadSelection = {
  engine?: ChatEngine;
  /** The instance of `engine` (its id is `engine` for the default). */
  engineInstanceId?: string | null;
  modelId: string | null;
  mode?: "chat" | "plan";
  reasoningEffort?: ReasoningEffort | null;
};

/** What the composer reports when the engine, model or effort changes. */
export type ChatComposerSelectionChange = {
  engine?: ChatEngine;
  engineInstanceId?: string;
  modelId?: string | null;
  mode?: "chat" | "plan";
  reasoningEffort?: ReasoningEffort | null;
};

export type ComposerSendInput = {
  composerContext?: ComposerContext;
  draftRepoState?: Partial<RepoThreadState>;
  engine: ChatEngine;
  /** The selected instance of `engine` (its id is `engine` for the default). */
  engineInstanceId?: string;
  files?: FileUIPart[];
  modelId: string;
  /** The model's option selections (reasoning effort travels apart). */
  modelOptions?: EngineOptionSelection[];
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
    permissionModeOverride?: PermissionMode | null;
    rootPath?: string | null;
  } | null;
  draftPreparedWorktree?: {
    branch: string;
    path: string;
  } | null;
  draftThreadId?: string;
  draftProjectMode?: DraftProjectMode;
  optionSelection?: ChatComposerOptionSelection | null;
  onQueueFollowUp?: (input: ComposerSendInput) => Promise<void> | void;
  onRemoveQueuedFollowUp?: (id: string) => Promise<void> | void;
  onDraftPreparedWorktreeChange?: (
    worktree: { branch: string; path: string } | null,
  ) => void;
  onDraftProjectModeChange?: (mode: DraftProjectMode) => void;
  onOptionSelectionChange?: (selection: ChatComposerOptionSelection) => void;
  onSelectionChange?: (input: ChatComposerSelectionChange) => void;
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
