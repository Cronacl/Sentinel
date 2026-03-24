import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ChatEngine } from "@/server/db/enums";
import { api } from "@/trpc/react";

import { resolveReasoningEffort } from "../chat-composer-helpers";

import type { usePersistSelection } from "./use-persist-selection";

type PersistSelectionReturn = ReturnType<typeof usePersistSelection>;

export function useModelSelection({
  globalSelectionQuery,
  onSelectionChange,
  persistEngineSelection,
  persistSelection,
  selectionScopeKey,
  threadSelection,
}: {
  globalSelectionQuery: PersistSelectionReturn["globalSelectionQuery"];
  onSelectionChange?: (input: {
    engine?: ChatEngine;
    modelId?: string | null;
    mode?: "chat" | "plan";
    reasoningEffort?: ReasoningEffort | null;
  }) => void;
  persistEngineSelection: PersistSelectionReturn["persistEngineSelection"];
  persistSelection: PersistSelectionReturn["persistSelection"];
  selectionScopeKey: string;
  threadSelection?: {
    engine?: ChatEngine;
    modelId: string | null;
    mode?: "chat" | "plan";
    reasoningEffort?: ReasoningEffort | null;
  } | null;
}) {
  const enginesQuery = api.engines.list.useQuery();
  const sentinelModelsQuery = api.engines.models.useQuery({
    engine: "sentinel",
  });
  const codexModelsQuery = api.engines.models.useQuery({
    engine: "codex",
  });
  const [selectedEngine, setSelectedEngine] = useState<ChatEngine>("sentinel");
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [selectedReasoningEffort, setSelectedReasoningEffort] =
    useState<ReasoningEffort | null>(null);
  const initializedSelectionScopeRef = useRef<string | null>(null);
  const threadPersistenceReadyRef = useRef(false);
  const manualEngineSelectionRef = useRef<ChatEngine | null>(null);

  const preferredEngine =
    threadSelection?.engine ?? globalSelectionQuery.data?.engine ?? "sentinel";
  const hasThreadSelection = Boolean(threadSelection?.modelId);
  const preferredModelId = hasThreadSelection
    ? (threadSelection?.modelId ?? null)
    : (globalSelectionQuery.data?.modelId ?? null);
  const preferredReasoningEffort = hasThreadSelection
    ? (threadSelection?.reasoningEffort ?? null)
    : ((globalSelectionQuery.data?.reasoningEffort as ReasoningEffort | null) ??
      null);
  const preferencesReady =
    Boolean(threadSelection?.engine) ||
    hasThreadSelection ||
    !globalSelectionQuery.isLoading;

  const engineOptions = enginesQuery.data ?? [];
  const selectedEngineStatus =
    engineOptions.find((engine) => engine.engine === selectedEngine) ?? null;
  const selectedEngineModels =
    selectedEngine === "codex"
      ? (codexModelsQuery.data ?? [])
      : (sentinelModelsQuery.data ?? []);
  const modelsQuery =
    selectedEngine === "codex" ? codexModelsQuery : sentinelModelsQuery;

  const availableModels = useMemo(
    () =>
      selectedEngineModels.filter(
        (model) => model.isConnected && model.isEnabled,
      ),
    [selectedEngineModels],
  );

  const selectedModel =
    availableModels.find((model) => model.modelId === selectedModelKey) ?? null;

  const supportedReasoningEfforts =
    selectedModel?.supportedReasoningEfforts ?? [];

  useEffect(() => {
    if (initializedSelectionScopeRef.current !== selectionScopeKey) {
      initializedSelectionScopeRef.current = null;
      threadPersistenceReadyRef.current = false;
    }
  }, [selectionScopeKey]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    if (initializedSelectionScopeRef.current !== selectionScopeKey) {
      setSelectedEngine(preferredEngine);
    }
  }, [preferredEngine, preferencesReady, selectionScopeKey]);

  useEffect(() => {
    if (
      !preferencesReady ||
      initializedSelectionScopeRef.current !== selectionScopeKey
    ) {
      return;
    }
    if (manualEngineSelectionRef.current) {
      if (manualEngineSelectionRef.current === preferredEngine) {
        manualEngineSelectionRef.current = null;
      }
      return;
    }
    setSelectedEngine(preferredEngine);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when preferredEngine changes, not selectedEngine
  }, [preferredEngine]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    if (initializedSelectionScopeRef.current === selectionScopeKey) {
      return;
    }

    if (selectedEngine !== preferredEngine) {
      return;
    }

    if (modelsQuery.isLoading) {
      return;
    }

    if (selectedEngineModels.length === 0) {
      setSelectedModelKey(null);
      setSelectedReasoningEffort(null);
      initializedSelectionScopeRef.current = selectionScopeKey;
      return;
    }

    const preferredModel = selectedEngineModels.find(
      (model) => model.modelId === preferredModelId,
    );
    const nextModel = preferredModel ?? selectedEngineModels[0] ?? null;

    setSelectedModelKey(nextModel?.modelId ?? null);
    setSelectedReasoningEffort(
      nextModel
        ? resolveReasoningEffort(nextModel, preferredReasoningEffort)
        : null,
    );
    initializedSelectionScopeRef.current = selectionScopeKey;
  }, [
    preferredEngine,
    preferredModelId,
    preferredReasoningEffort,
    preferencesReady,
    modelsQuery.isLoading,
    selectedEngine,
    selectedEngineModels,
    selectionScopeKey,
  ]);

  useEffect(() => {
    if (!selectedModelKey) {
      return;
    }

    const stillAvailable = availableModels.some(
      (model) => model.modelId === selectedModelKey,
    );
    if (stillAvailable) {
      return;
    }

    const fallbackModel = availableModels[0];
    if (!fallbackModel) {
      setSelectedModelKey(null);
      setSelectedReasoningEffort(null);
      return;
    }

    const fallbackEffort = resolveReasoningEffort(fallbackModel, null);
    setSelectedModelKey(fallbackModel.modelId);
    setSelectedReasoningEffort(fallbackEffort);
    onSelectionChange?.({
      engine: selectedEngine,
      modelId: fallbackModel.modelId,
      reasoningEffort: fallbackEffort,
    });
    persistSelection(fallbackModel.modelId, fallbackEffort, {
      engine: selectedEngine,
    });
  }, [
    availableModels,
    onSelectionChange,
    persistSelection,
    selectedEngine,
    selectedModelKey,
  ]);

  useEffect(() => {
    if (!selectedModel) {
      if (selectedReasoningEffort !== null) {
        setSelectedReasoningEffort(null);
      }
      return;
    }

    const nextReasoningEffort = resolveReasoningEffort(
      selectedModel,
      selectedReasoningEffort,
    );

    if (nextReasoningEffort !== selectedReasoningEffort) {
      setSelectedReasoningEffort(nextReasoningEffort);
    }
  }, [selectedModel, selectedReasoningEffort]);

  const handleSelectEngine = useCallback(
    (engine: ChatEngine) => {
      manualEngineSelectionRef.current = engine;
      setSelectedEngine(engine);
      initializedSelectionScopeRef.current = null;

      const nextModels =
        engine === "codex"
          ? (codexModelsQuery.data ?? [])
          : (sentinelModelsQuery.data ?? []);
      const nextModel = nextModels.find(
        (model) => model.isConnected && model.isEnabled,
      );
      const nextMode = undefined;

      if (!nextModel) {
        setSelectedModelKey(null);
        setSelectedReasoningEffort(null);
        onSelectionChange?.({
          engine,
          modelId: null,
          mode: nextMode,
          reasoningEffort: null,
        });
        persistEngineSelection(
          engine,
          nextMode ? { mode: nextMode } : undefined,
        );
        return;
      }

      const nextReasoningEffort = resolveReasoningEffort(nextModel, null);
      setSelectedModelKey(nextModel.modelId);
      setSelectedReasoningEffort(nextReasoningEffort);
      onSelectionChange?.({
        engine,
        modelId: nextModel.modelId,
        mode: nextMode,
        reasoningEffort: nextReasoningEffort,
      });
      persistSelection(nextModel.modelId, nextReasoningEffort, {
        engine,
        ...(nextMode ? { mode: nextMode } : {}),
      });
    },
    [
      codexModelsQuery.data,
      onSelectionChange,
      persistEngineSelection,
      persistSelection,
      sentinelModelsQuery.data,
    ],
  );

  const handleSelectModel = useCallback(
    (modelKey: string) => {
      const nextModel = availableModels.find(
        (model) => model.modelId === modelKey,
      );
      if (!nextModel) {
        return;
      }

      const nextReasoningEffort = resolveReasoningEffort(
        nextModel,
        selectedReasoningEffort,
      );

      setSelectedModelKey(modelKey);
      setSelectedReasoningEffort(nextReasoningEffort);
      onSelectionChange?.({
        engine: selectedEngine,
        modelId: modelKey,
        reasoningEffort: nextReasoningEffort,
      });
      persistSelection(modelKey, nextReasoningEffort, {
        engine: selectedEngine,
      });
    },
    [
      availableModels,
      onSelectionChange,
      persistSelection,
      selectedEngine,
      selectedReasoningEffort,
    ],
  );

  const handleSelectReasoningEffort = useCallback(
    (effort: ReasoningEffort) => {
      if (!selectedModelKey) {
        return;
      }

      setSelectedReasoningEffort(effort);
      onSelectionChange?.({
        engine: selectedEngine,
        modelId: selectedModelKey,
        reasoningEffort: effort,
      });
      persistSelection(selectedModelKey, effort, {
        engine: selectedEngine,
      });
    },
    [onSelectionChange, persistSelection, selectedEngine, selectedModelKey],
  );

  return {
    availableModels,
    enginesQuery,
    handleSelectEngine,
    handleSelectModel,
    handleSelectReasoningEffort,
    modelsQuery,
    selectedEngine,
    selectedEngineStatus,
    selectedModel,
    selectedModelKey,
    selectedReasoningEffort,
    supportedReasoningEfforts,
    threadPersistenceReadyRef,
  };
}
