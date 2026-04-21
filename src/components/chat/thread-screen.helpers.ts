import type {
  ChatComposerOpenCodeSelection,
  ChatComposerThreadSelection,
} from "./chat-composer/types";
import type { DraftProjectMode } from "./draft-thread-project-mode";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ChatEngine } from "@/server/db/enums";
import type { ThreadRouteHandoffState } from "./thread-route-handoff";

type ThreadScreenThreadState = {
  chatEngine: ChatEngine;
  chatModelId: string | null;
  chatReasoningEffort: string | null;
  mode: "chat" | "plan";
};

export type ThreadScreenComposerUiState = {
  draftPreparedWorktree: {
    branch: string;
    path: string;
  } | null;
  draftProjectMode: DraftProjectMode;
  openCodeSelection: ChatComposerOpenCodeSelection;
  threadSelection: ChatComposerThreadSelection;
};

export function resolveInitialThreadComposerUiState(input: {
  initialComposerUiState?: ThreadRouteHandoffState | null;
  thread: ThreadScreenThreadState;
}): ThreadScreenComposerUiState {
  return {
    draftPreparedWorktree:
      input.initialComposerUiState?.draftPreparedWorktree ?? null,
    draftProjectMode: input.initialComposerUiState?.draftProjectMode ?? "local",
    openCodeSelection: input.initialComposerUiState?.openCodeSelection ?? {
      agent: null,
      variant: null,
    },
    threadSelection: input.initialComposerUiState?.threadSelection ?? {
      engine: input.thread.chatEngine,
      modelId: input.thread.chatModelId,
      mode: input.thread.mode,
      reasoningEffort:
        (input.thread.chatReasoningEffort as ReasoningEffort | null) ?? null,
    },
  };
}
