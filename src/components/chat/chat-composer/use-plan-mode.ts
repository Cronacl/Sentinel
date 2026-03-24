import type { ChatEngine } from "@/server/db/enums";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ReasoningEffort } from "@/lib/ai/providers/models";

import type { usePersistSelection } from "./use-persist-selection";

type PersistSelectionReturn = ReturnType<typeof usePersistSelection>;

export function usePlanMode({
  canPersistThreadSelection,
  draftMode,
  globalSelectionQuery,
  onSelectionChange,
  planModeAvailable,
  persistSelection,
  selectedEngine,
  selectedModelKey,
  selectedReasoningEffort,
  selectionScopeKey,
  threadId,
  threadSelection,
  updateGlobalSelection,
  updateThreadSelection,
}: {
  canPersistThreadSelection: boolean;
  draftMode?: "chat" | "plan" | null;
  globalSelectionQuery: PersistSelectionReturn["globalSelectionQuery"];
  onSelectionChange?: (input: {
    engine?: ChatEngine;
    modelId?: string | null;
    mode?: "chat" | "plan";
    reasoningEffort?: ReasoningEffort | null;
  }) => void;
  planModeAvailable: boolean;
  persistSelection: PersistSelectionReturn["persistSelection"];
  selectedEngine: ChatEngine;
  selectedModelKey: string | null;
  selectedReasoningEffort: ReasoningEffort | null;
  selectionScopeKey: string;
  threadId?: string;
  threadSelection?: {
    modelId: string | null;
    mode?: "chat" | "plan";
    reasoningEffort?: ReasoningEffort | null;
  } | null;
  updateGlobalSelection: PersistSelectionReturn["updateGlobalSelection"];
  updateThreadSelection: PersistSelectionReturn["updateThreadSelection"];
}) {
  const [planMode, setPlanMode] = useState(false);
  const planModeInitScopeRef = useRef<string | null>(null);
  const lastSyncedThreadModeRef = useRef<string | null>(null);
  const preferencesReady =
    Boolean(threadSelection?.modelId) || !globalSelectionQuery.isLoading;

  useEffect(() => {
    if (!planModeAvailable) {
      setPlanMode(false);
      return;
    }

    if (!preferencesReady) return;

    const currentThreadMode = threadSelection?.mode ?? null;

    if (planModeInitScopeRef.current !== selectionScopeKey) {
      planModeInitScopeRef.current = selectionScopeKey;
      lastSyncedThreadModeRef.current = currentThreadMode;
      const preferredMode = currentThreadMode
        ? currentThreadMode
        : draftMode
          ? draftMode
          : (globalSelectionQuery.data?.mode ?? "chat");
      setPlanMode(preferredMode === "plan");
      return;
    }

    if (
      currentThreadMode &&
      currentThreadMode !== lastSyncedThreadModeRef.current
    ) {
      lastSyncedThreadModeRef.current = currentThreadMode;
      setPlanMode(currentThreadMode === "plan");
    }
  }, [
    draftMode,
    globalSelectionQuery.data?.mode,
    preferencesReady,
    selectionScopeKey,
    threadSelection?.mode,
  ]);

  const handleTogglePlanMode = useCallback(() => {
    if (!planModeAvailable) {
      return;
    }

    setPlanMode((prev) => {
      const next = !prev;
      onSelectionChange?.({ mode: next ? "plan" : "chat" });
      if (selectedModelKey) {
        persistSelection(selectedModelKey, selectedReasoningEffort, {
          engine: selectedEngine,
          mode: next ? "plan" : "chat",
        });
      } else {
        updateGlobalSelection.mutate({
          engine: selectedEngine,
          mode: next ? "plan" : "chat",
        });
        if (canPersistThreadSelection && threadId) {
          updateThreadSelection.mutate({
            engine: selectedEngine,
            mode: next ? "plan" : "chat",
            threadId,
          });
        }
      }
      return next;
    });
  }, [
    canPersistThreadSelection,
    onSelectionChange,
    planModeAvailable,
    persistSelection,
    selectedEngine,
    selectedModelKey,
    selectedReasoningEffort,
    threadId,
    updateGlobalSelection,
    updateThreadSelection,
  ]);

  return { handleTogglePlanMode, planMode: planModeAvailable ? planMode : false };
}
