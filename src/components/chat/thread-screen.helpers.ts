import { toComposerOptionValues } from "@/components/engines/option-descriptors";
import type { EngineOptionSelection } from "@/lib/ai/chat/engines/contract";
import type {
  ChatComposerOptionSelection,
  ChatComposerSelectionChange,
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

/**
 * The thread's selection after the composer reports a change. The engine
 * instance travels with the selection: a change that leaves the engine as
 * it is keeps the thread's instance (a thread on a second Codex instance
 * stays on it when its model changes), and an engine change without an
 * instance takes that engine's default instance.
 */
export function applyThreadSelectionChange(
  current: ChatComposerThreadSelection,
  change: ChatComposerSelectionChange,
): ChatComposerThreadSelection {
  const engineChanged =
    change.engine !== undefined && change.engine !== current.engine;

  return {
    engine: change.engine ?? current.engine,
    engineInstanceId:
      change.engineInstanceId ??
      (engineChanged ? change.engine : current.engineInstanceId),
    modelId: change.modelId !== undefined ? change.modelId : current.modelId,
    mode: change.mode ?? current.mode,
    reasoningEffort:
      change.reasoningEffort !== undefined
        ? change.reasoningEffort
        : current.reasoningEffort,
  };
}
