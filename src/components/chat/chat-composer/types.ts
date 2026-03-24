import type { FileUIPart } from "ai";

import type { QueuedFollowUpSummary } from "@/lib/ai/chat/session-types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ChatEngine } from "@/server/db/enums";

export type { QueuedFollowUpSummary } from "@/lib/ai/chat/session-types";

export type ComposerSendInput = {
  engine: ChatEngine;
  files?: FileUIPart[];
  modelId: string;
  reasoningEffort?: ReasoningEffort | null;
  text: string;
  threadMode?: "chat" | "plan";
};

export type ChatComposerProps = {
  activeWorkspace?: {
    id: string;
    name: string;
    permissionModeOverride?: "default" | "full" | null;
    rootPath?: string | null;
  } | null;
  onQueueFollowUp?: (input: ComposerSendInput) => Promise<void> | void;
  onRemoveQueuedFollowUp?: (id: string) => Promise<void> | void;
  onSelectionChange?: (input: {
    engine?: ChatEngine;
    modelId?: string | null;
    mode?: "chat" | "plan";
    reasoningEffort?: ReasoningEffort | null;
  }) => void;
  onStop?: () => void;
  onSend?: (input: ComposerSendInput) => void;
  onSteerFollowUp?: (input: ComposerSendInput) => Promise<void> | void;
  onSteerQueuedFollowUp?: (id: string) => Promise<void> | void;
  onCancelEdit?: () => void;
  attachmentSeed?: FileUIPart[];
  isEditing?: boolean;
  promptSeed?: string;
  promptSeedKey?: string | number;
  queuedFollowUps?: QueuedFollowUpSummary[];
  showBranchSwitcher?: boolean;
  status?: "submitted" | "streaming" | "ready" | "error";
  draftMode?: "chat" | "plan" | null;
  persistThreadSelection?: boolean;
  threadId?: string;
  threadSelection?: {
    engine?: ChatEngine;
    modelId: string | null;
    mode?: "chat" | "plan";
    reasoningEffort?: ReasoningEffort | null;
  } | null;
};
