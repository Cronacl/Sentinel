import { toComposerOptionValues } from "@/components/engines/option-descriptors";
import type { EngineOptionSelection } from "@/lib/ai/chat/engines/contract";
import type {
  ChatComposerOptionSelection,
  ChatComposerThreadSelection,
} from "./chat-composer/types";
import type { DraftProjectMode } from "./draft-thread-project-mode";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ChatEngine } from "@/server/db/enums";
import type { ThreadRouteHandoffState } from "./thread-route-handoff";

type ThreadScreenThreadState = {
  chatEngine: ChatEngine;
  /** The thread's instance (threads.get reports the default as the engine). */
  chatEngineInstanceId?: string | null;
  chatModelId: string | null;
  chatModelOptions?: EngineOptionSelection[] | null;
  chatReasoningEffort: string | null;
  mode: "chat" | "plan";
};

export type ThreadScreenComposerUiState = {
  draftPreparedWorktree: {
    branch: string;
    path: string;
  } | null;
  draftProjectMode: DraftProjectMode;
  optionSelection: ChatComposerOptionSelection;
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
    // A handoff's selection, else what the thread last ran with.
    optionSelection:
      input.initialComposerUiState?.optionSelection ??
      toComposerOptionValues(input.thread.chatModelOptions),
    threadSelection: input.initialComposerUiState?.threadSelection ?? {
      engine: input.thread.chatEngine,
      ...(input.thread.chatEngineInstanceId
        ? { engineInstanceId: input.thread.chatEngineInstanceId }
        : {}),
      modelId: input.thread.chatModelId,
      mode: input.thread.mode,
      reasoningEffort:
        (input.thread.chatReasoningEffort as ReasoningEffort | null) ?? null,
    },
  };
}
