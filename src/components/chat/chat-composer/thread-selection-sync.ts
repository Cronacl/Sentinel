import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ThreadMode } from "@/lib/plan";
import type { ChatEngine } from "@/server/db/enums";

export function resolveThreadSelectionSyncInput(input: {
  canPersistThreadSelection: boolean;
  planMode: boolean;
  planModeReady: boolean;
  selectedEngine: ChatEngine;
  /** The selected instance of selectedEngine (its id is the engine for the default). */
  selectedInstanceId?: string;
  selectedModelKey: string | null;
  selectedReasoningEffort: ReasoningEffort | null;
  threadPersistenceReady: boolean;
  threadSelection?: {
    engine?: ChatEngine;
    engineInstanceId?: string | null;
    modelId: string | null;
    mode?: "chat" | "plan";
    reasoningEffort?: ReasoningEffort | null;
  } | null;
}) {
  if (
    !input.canPersistThreadSelection ||
    !input.threadSelection ||
    !input.selectedModelKey ||
    input.threadPersistenceReady ||
    !input.planModeReady
  ) {
    return null;
  }

  const selectedMode: ThreadMode = input.planMode ? "plan" : "chat";
  const persistedReasoningEffort =
    input.threadSelection.reasoningEffort ?? null;

  const persistedEngine = input.threadSelection.engine ?? "sentinel";
  const sameInstance =
    input.selectedInstanceId === undefined ||
    (input.threadSelection.engineInstanceId ?? persistedEngine) ===
      input.selectedInstanceId;

  if (
    persistedEngine === input.selectedEngine &&
    sameInstance &&
    input.threadSelection.modelId === input.selectedModelKey &&
    persistedReasoningEffort === input.selectedReasoningEffort &&
    input.threadSelection.mode === selectedMode
  ) {
    return null;
  }

  return {
    engine: input.selectedEngine,
    ...(input.selectedInstanceId === undefined
      ? {}
      : { engineInstanceId: input.selectedInstanceId }),
    mode: selectedMode,
    modelId: input.selectedModelKey,
    reasoningEffort: input.selectedReasoningEffort,
  };
}
