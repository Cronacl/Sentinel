import type { ChatEngine } from "@/server/db/enums";
import { useCallback, useEffect, useState } from "react";

import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ThreadMode } from "@/lib/plan";

import type { usePersistSelection } from "./use-persist-selection";

type PersistSelectionReturn = ReturnType<typeof usePersistSelection>;
type PlanModeSyncState = {
  hydratedScopeKey: string | null;
  lastSyncedThreadMode: ThreadMode | null;
  planMode: boolean;
};

export function resolvePreferredPlanMode({
  draftMode,
  globalMode,
  threadMode,
}: {
  draftMode?: ThreadMode | null;
  globalMode?: ThreadMode | null;
  threadMode?: ThreadMode | null;
}): ThreadMode {
  return threadMode ?? draftMode ?? globalMode ?? "chat";
}

export function syncPlanModeState(
  state: PlanModeSyncState,
  input: {
    draftMode?: ThreadMode | null;
    globalMode?: ThreadMode | null;
    planModeAvailable: boolean;
    preferencesReady: boolean;
    selectionScopeKey: string;
    threadMode?: ThreadMode | null;
  },
): PlanModeSyncState {
  if (!input.planModeAvailable) {
    return {
      hydratedScopeKey: null,
      lastSyncedThreadMode: null,
      planMode: false,
    };
  }

  if (!input.preferencesReady) {
    return state;
  }

  if (state.hydratedScopeKey !== input.selectionScopeKey) {
    const preferredMode = resolvePreferredPlanMode({
      draftMode: input.draftMode,
      globalMode: input.globalMode,
      threadMode: input.threadMode,
    });

    return {
      hydratedScopeKey: input.selectionScopeKey,
      lastSyncedThreadMode: input.threadMode ?? null,
      planMode: preferredMode === "plan",
    };
  }

  if (input.threadMode && input.threadMode !== state.lastSyncedThreadMode) {
    return {
      ...state,
      lastSyncedThreadMode: input.threadMode,
      planMode: input.threadMode === "plan",
    };
  }

  return state;
}

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
  const preferencesReady =
    Boolean(threadSelection?.modelId) || !globalSelectionQuery.isLoading;
  const [planModeState, setPlanModeState] = useState<PlanModeSyncState>(() =>
    syncPlanModeState(
      {
        hydratedScopeKey: null,
        lastSyncedThreadMode: null,
        planMode: false,
      },
      {
        draftMode,
        globalMode: globalSelectionQuery.data?.mode ?? null,
        planModeAvailable,
        preferencesReady,
        selectionScopeKey,
        threadMode: threadSelection?.mode ?? null,
      },
    ),
  );
  const planModeReady =
    !planModeAvailable ||
    (preferencesReady && planModeState.hydratedScopeKey === selectionScopeKey);

  useEffect(() => {
    setPlanModeState((current) =>
      syncPlanModeState(current, {
        draftMode,
        globalMode: globalSelectionQuery.data?.mode ?? null,
        planModeAvailable,
        preferencesReady,
        selectionScopeKey,
        threadMode: threadSelection?.mode ?? null,
      }),
    );
  }, [
    draftMode,
    globalSelectionQuery.data?.mode,
    planModeAvailable,
    preferencesReady,
    selectionScopeKey,
    threadSelection?.mode,
  ]);

  const setPlanMode = useCallback(
    (nextMode: "chat" | "plan") => {
      if (!planModeAvailable) {
        return;
      }

      const nextPlanMode = nextMode === "plan";

      setPlanModeState((prev) => {
        if (
          prev.planMode === nextPlanMode &&
          prev.hydratedScopeKey === selectionScopeKey &&
          prev.lastSyncedThreadMode === nextMode
        ) {
          return prev;
        }

        onSelectionChange?.({ mode: nextMode });
        if (selectedModelKey) {
          persistSelection(selectedModelKey, selectedReasoningEffort, {
            engine: selectedEngine,
            mode: nextMode,
          });
        } else {
          updateGlobalSelection.mutate({
            engine: selectedEngine,
            mode: nextMode,
          });
          if (canPersistThreadSelection && threadId) {
            updateThreadSelection.mutate({
              engine: selectedEngine,
              mode: nextMode,
              threadId,
            });
          }
        }

        return {
          ...prev,
          hydratedScopeKey: selectionScopeKey,
          lastSyncedThreadMode: nextMode,
          planMode: nextPlanMode,
        };
      });
    },
    [
      canPersistThreadSelection,
      onSelectionChange,
      persistSelection,
      planModeAvailable,
      selectedEngine,
      selectedModelKey,
      selectedReasoningEffort,
      selectionScopeKey,
      threadId,
      updateGlobalSelection,
      updateThreadSelection,
    ],
  );

  const handleTogglePlanMode = useCallback(() => {
    if (!planModeAvailable) {
      return;
    }
    setPlanMode(planModeState.planMode ? "chat" : "plan");
  }, [planModeAvailable, planModeState.planMode, setPlanMode]);

  return {
    handleTogglePlanMode,
    planMode: planModeAvailable ? planModeState.planMode : false,
    planModeReady,
    setPlanMode,
  };
}
