import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ThreadMode } from "@/lib/plan";
import type { ChatEngine } from "@/server/db/enums";

export function resolveThreadSelectionSyncInput(input: {
  canPersistThreadSelection: boolean;
  planMode: boolean;
  planModeReady: boolean;
  selectedEngine: ChatEngine;
  selectedModelKey: string | null;
  selectedReasoningEffort: ReasoningEffort | null;
  threadPersistenceReady: boolean;
  threadSelection?: {
    engine?: ChatEngine;
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

  if (
    (input.threadSelection.engine ?? "sentinel") === input.selectedEngine &&
    input.threadSelection.modelId === input.selectedModelKey &&
    persistedReasoningEffort === input.selectedReasoningEffort &&
    input.threadSelection.mode === selectedMode
  ) {
    return null;
  }

  return {
    engine: input.selectedEngine,
    mode: selectedMode,
    modelId: input.selectedModelKey,
    reasoningEffort: input.selectedReasoningEffort,
  };
}
