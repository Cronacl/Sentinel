import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ChatEngine } from "@/server/db/enums";
import { api } from "@/trpc/react";
import type { ChatComposerOpenCodeSelection } from "./types";

import {
  FALLBACK_CHAT_ENGINE_OPTIONS,
  filterSelectableModels,
  haveSameEngineOptionSet,
  haveSameSelectableModelSet,
  resolveStableEngineOptions,
  resolveReasoningEffort,
  resolveStableSelectableModels,
  type ChatComposerEngineOption,
} from "../chat-composer-helpers";
import { resolveOpenCodeTraitSelectionValue } from "./use-model-selection.helpers";

import type { usePersistSelection } from "./use-persist-selection";

type PersistSelectionReturn = ReturnType<typeof usePersistSelection>;
const MODEL_SELECTION_ENGINES = [
  "claude",
  "codex",
  "copilot",
  "cursor",
  "opencode",
  "sentinel",
] as const;

export function useModelSelection({
  globalSelectionQuery,
  openCodeSelection,
  onOpenCodeSelectionChange,
  onSelectionChange,
  persistEngineSelection,
  persistSelection,
  selectionScopeKey,
  threadSelection,
}: {
  globalSelectionQuery: PersistSelectionReturn["globalSelectionQuery"];
  openCodeSelection?: ChatComposerOpenCodeSelection | null;
  onOpenCodeSelectionChange?: (
    selection: ChatComposerOpenCodeSelection,
  ) => void;
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
  const utils = api.useUtils();
  const cachedEngines = utils.engines.list.getData() ?? [];
  const cachedEngineData = cachedEngines.map((engine) => ({
    engine: engine.engine,
    error: engine.error,
    isAvailable: engine.isAvailable,
    label: engine.label,
  }));
  const cachedSentinelModels =
    utils.engines.models.getData({ engine: "sentinel" }) ?? [];
  const cachedCodexModels =
    utils.engines.models.getData({ engine: "codex" }) ?? [];
  const cachedClaudeModels =
    utils.engines.models.getData({ engine: "claude" }) ?? [];
  const cachedCopilotModels =
    utils.engines.models.getData({ engine: "copilot" }) ?? [];
  const cachedCursorModels =
    utils.engines.models.getData({ engine: "cursor" }) ?? [];
  const cachedOpenCodeModels =
    utils.engines.models.getData({ engine: "opencode" }) ?? [];

  const enginesQuery = api.engines.list.useQuery(undefined, {
    initialData: cachedEngines.length > 0 ? cachedEngines : undefined,
    staleTime: 60_000,
  });
  const sentinelModelsQuery = api.engines.models.useQuery(
    {
      engine: "sentinel",
    },
    {
      initialData:
        cachedSentinelModels.length > 0 ? cachedSentinelModels : undefined,
      staleTime: 60_000,
    },
  );
  const codexModelsQuery = api.engines.models.useQuery(
    {
      engine: "codex",
    },
    {
      initialData: cachedCodexModels.length > 0 ? cachedCodexModels : undefined,
      staleTime: 60_000,
    },
  );
  const claudeModelsQuery = api.engines.models.useQuery(
    {
      engine: "claude",
    },
    {
      initialData:
        cachedClaudeModels.length > 0 ? cachedClaudeModels : undefined,
      staleTime: 60_000,
    },
  );
  const copilotModelsQuery = api.engines.models.useQuery(
    {
      engine: "copilot",
    },
    {
      initialData:
        cachedCopilotModels.length > 0 ? cachedCopilotModels : undefined,
      staleTime: 60_000,
    },
  );
  const cursorModelsQuery = api.engines.models.useQuery(
    {
      engine: "cursor",
    },
    {
      initialData:
        cachedCursorModels.length > 0 ? cachedCursorModels : undefined,
      staleTime: 60_000,
    },
  );
  const openCodeModelsQuery = api.engines.models.useQuery(
    {
      engine: "opencode",
    },
    {
      initialData:
        cachedOpenCodeModels.length > 0 ? cachedOpenCodeModels : undefined,
      staleTime: 60_000,
    },
  );
  const [cachedEngineOptions, setCachedEngineOptions] = useState<
    ChatComposerEngineOption[]
  >(() =>
    cachedEngineData.length > 0
      ? cachedEngineData
      : [...FALLBACK_CHAT_ENGINE_OPTIONS],
  );
  const [cachedAvailableModelsByEngine, setCachedAvailableModelsByEngine] =
    useState<Record<ChatEngine, ReturnType<typeof filterSelectableModels>>>(
      () => ({
        claude: filterSelectableModels(cachedClaudeModels),
        codex: filterSelectableModels(cachedCodexModels),
        copilot: filterSelectableModels(cachedCopilotModels),
        cursor: filterSelectableModels(cachedCursorModels),
        opencode: filterSelectableModels(cachedOpenCodeModels),
        sentinel: filterSelectableModels(cachedSentinelModels),
      }),
    );
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
  const preferredOpenCodeAgent = openCodeSelection?.agent ?? null;
  const preferredOpenCodeVariant = openCodeSelection?.variant ?? null;
  const [selectedEngine, setSelectedEngine] = useState<ChatEngine>(
    () => preferredEngine,
  );
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(
    () => preferredModelId,
  );
  const [selectedReasoningEffort, setSelectedReasoningEffort] =
    useState<ReasoningEffort | null>(() => preferredReasoningEffort);
  const [selectedOpenCodeAgent, setSelectedOpenCodeAgent] = useState<
    string | null
  >(() => preferredOpenCodeAgent);
  const [selectedOpenCodeVariant, setSelectedOpenCodeVariant] = useState<
    string | null
  >(() => preferredOpenCodeVariant);
  const preferencesReady =
    Boolean(threadSelection?.engine) ||
    hasThreadSelection ||
    !globalSelectionQuery.isLoading;

  const liveEngineOptions = useMemo(
    () =>
      (enginesQuery.data ?? []).map((engine) => ({
        engine: engine.engine,
        error: engine.error,
        isAvailable: engine.isAvailable,
        label: engine.label,
      })),
    [enginesQuery.data],
  );
  const engineOptions = useMemo(
    () => resolveStableEngineOptions(liveEngineOptions, cachedEngineOptions),
    [cachedEngineOptions, liveEngineOptions],
  );
  const selectedEngineStatus =
    engineOptions.find((engine) => engine.engine === selectedEngine) ?? null;
  const modelsByEngine = {
    claude: claudeModelsQuery.data ?? [],
    codex: codexModelsQuery.data ?? [],
    copilot: copilotModelsQuery.data ?? [],
    cursor: cursorModelsQuery.data ?? [],
    opencode: openCodeModelsQuery.data ?? [],
    sentinel: sentinelModelsQuery.data ?? [],
  };
  const modelsQueryByEngine = {
    claude: claudeModelsQuery,
    codex: codexModelsQuery,
    copilot: copilotModelsQuery,
    cursor: cursorModelsQuery,
    opencode: openCodeModelsQuery,
    sentinel: sentinelModelsQuery,
  };
  const selectedEngineModels = modelsByEngine[selectedEngine];
  const modelsQuery = modelsQueryByEngine[selectedEngine];
  const liveAvailableModelsByEngine = useMemo(
    () => ({
      claude: filterSelectableModels(modelsByEngine.claude),
      codex: filterSelectableModels(modelsByEngine.codex),
      copilot: filterSelectableModels(modelsByEngine.copilot),
      cursor: filterSelectableModels(modelsByEngine.cursor),
      opencode: filterSelectableModels(modelsByEngine.opencode),
      sentinel: filterSelectableModels(modelsByEngine.sentinel),
    }),
    [
      modelsByEngine.claude,
      modelsByEngine.codex,
      modelsByEngine.copilot,
      modelsByEngine.cursor,
      modelsByEngine.opencode,
      modelsByEngine.sentinel,
    ],
  );
  const availableModelsByEngine = useMemo(
    () => ({
      claude: resolveStableSelectableModels(
        modelsByEngine.claude,
        cachedAvailableModelsByEngine.claude,
      ),
      codex: resolveStableSelectableModels(
        modelsByEngine.codex,
        cachedAvailableModelsByEngine.codex,
      ),
      copilot: resolveStableSelectableModels(
        modelsByEngine.copilot,
        cachedAvailableModelsByEngine.copilot,
      ),
      cursor: resolveStableSelectableModels(
        modelsByEngine.cursor,
        cachedAvailableModelsByEngine.cursor,
      ),
      opencode: resolveStableSelectableModels(
        modelsByEngine.opencode,
        cachedAvailableModelsByEngine.opencode,
      ),
      sentinel: resolveStableSelectableModels(
        modelsByEngine.sentinel,
        cachedAvailableModelsByEngine.sentinel,
        { reuseCacheWhenLiveHasOnlyInactiveModels: false },
      ),
    }),
    [
      cachedAvailableModelsByEngine.claude,
      cachedAvailableModelsByEngine.codex,
      cachedAvailableModelsByEngine.copilot,
      cachedAvailableModelsByEngine.cursor,
      cachedAvailableModelsByEngine.opencode,
      cachedAvailableModelsByEngine.sentinel,
      modelsByEngine.claude,
      modelsByEngine.codex,
      modelsByEngine.copilot,
      modelsByEngine.cursor,
      modelsByEngine.opencode,
      modelsByEngine.sentinel,
    ],
  );
  const availableModels = availableModelsByEngine[selectedEngine];
  const displayModels =
    selectedEngine === "sentinel"
      ? availableModels
      : selectedEngineModels.length > 0
        ? selectedEngineModels
        : availableModels;

  const selectedModel =
    displayModels.find((model) => model.modelId === selectedModelKey) ?? null;

  const supportedReasoningEfforts =
    selectedModel?.supportedReasoningEfforts ?? [];

  useEffect(() => {
    if (selectedModel?.engine !== "opencode") {
      if (selectedOpenCodeAgent !== null) {
        setSelectedOpenCodeAgent(null);
      }
      if (selectedOpenCodeVariant !== null) {
        setSelectedOpenCodeVariant(null);
      }
      return;
    }

    const agentOptions = selectedModel.openCode?.agentOptions ?? [];
    const variantOptions = selectedModel.openCode?.variantOptions ?? [];
    const nextAgent = resolveOpenCodeTraitSelectionValue(
      agentOptions,
      selectedOpenCodeAgent,
      preferredOpenCodeAgent,
    );
    const nextVariant = resolveOpenCodeTraitSelectionValue(
      variantOptions,
      selectedOpenCodeVariant,
      preferredOpenCodeVariant,
    );

    if (nextAgent !== selectedOpenCodeAgent) {
      setSelectedOpenCodeAgent(nextAgent);
    }

    if (nextVariant !== selectedOpenCodeVariant) {
      setSelectedOpenCodeVariant(nextVariant);
    }
  }, [
    preferredOpenCodeAgent,
    preferredOpenCodeVariant,
    selectedModel,
    selectedOpenCodeAgent,
    selectedOpenCodeVariant,
  ]);

  useEffect(() => {
    if (initializedSelectionScopeRef.current !== selectionScopeKey) {
      initializedSelectionScopeRef.current = null;
      threadPersistenceReadyRef.current = false;
      setSelectedOpenCodeAgent(preferredOpenCodeAgent);
      setSelectedOpenCodeVariant(preferredOpenCodeVariant);
    }
  }, [preferredOpenCodeAgent, preferredOpenCodeVariant, selectionScopeKey]);

  useEffect(() => {
    setCachedEngineOptions((currentCache) => {
      if (
        liveEngineOptions.length === 0 ||
        haveSameEngineOptionSet(currentCache, liveEngineOptions)
      ) {
        return currentCache;
      }

      return liveEngineOptions;
    });
  }, [liveEngineOptions]);

  useEffect(() => {
    setCachedAvailableModelsByEngine((currentCache) => {
      let changed = false;
      const nextCache = { ...currentCache };

      for (const engine of MODEL_SELECTION_ENGINES) {
        const nextModels = liveAvailableModelsByEngine[engine];

        if (
          nextModels.length === 0 ||
          haveSameSelectableModelSet(currentCache[engine], nextModels)
        ) {
          continue;
        }

        nextCache[engine] = nextModels;
        changed = true;
      }

      return changed ? nextCache : currentCache;
    });
  }, [liveAvailableModelsByEngine]);

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

    if (modelsQuery.isLoading && availableModels.length === 0) {
      return;
    }

    if (availableModels.length === 0) {
      const fallbackDisplayModel =
        displayModels.find((model) => model.modelId === preferredModelId) ??
        displayModels[0] ??
        null;

      setSelectedModelKey(fallbackDisplayModel?.modelId ?? preferredModelId);
      setSelectedReasoningEffort(
        fallbackDisplayModel
          ? resolveReasoningEffort(
              fallbackDisplayModel,
              preferredReasoningEffort,
            )
          : preferredReasoningEffort,
      );
      initializedSelectionScopeRef.current = selectionScopeKey;
      return;
    }

    const preferredModel = availableModels.find(
      (model) => model.modelId === preferredModelId,
    );
    const nextModel = preferredModel ?? availableModels[0] ?? null;
    const nextReasoningEffort = nextModel
      ? resolveReasoningEffort(nextModel, preferredReasoningEffort)
      : null;

    setSelectedModelKey(nextModel?.modelId ?? null);
    setSelectedReasoningEffort(nextReasoningEffort);
    initializedSelectionScopeRef.current = selectionScopeKey;

    if (
      nextModel &&
      (preferredEngine !== selectedEngine ||
        preferredModelId !== nextModel.modelId ||
        preferredReasoningEffort !== nextReasoningEffort)
    ) {
      onSelectionChange?.({
        engine: selectedEngine,
        modelId: nextModel.modelId,
        reasoningEffort: nextReasoningEffort,
      });
      persistSelection(nextModel.modelId, nextReasoningEffort, {
        engine: selectedEngine,
      });
    }
  }, [
    availableModels,
    onSelectionChange,
    persistSelection,
    preferredEngine,
    preferredModelId,
    preferredReasoningEffort,
    preferencesReady,
    modelsQuery.isLoading,
    selectedEngine,
    selectionScopeKey,
  ]);

  useEffect(() => {
    if (
      initializedSelectionScopeRef.current !== selectionScopeKey ||
      selectedModelKey ||
      availableModels.length === 0
    ) {
      return;
    }

    const preferredModel = availableModels.find(
      (model) => model.modelId === preferredModelId,
    );
    const nextModel = preferredModel ?? availableModels[0] ?? null;

    if (!nextModel) {
      return;
    }

    const nextReasoningEffort = resolveReasoningEffort(
      nextModel,
      preferredReasoningEffort,
    );

    setSelectedModelKey(nextModel.modelId);
    setSelectedReasoningEffort(nextReasoningEffort);
    onSelectionChange?.({
      engine: selectedEngine,
      modelId: nextModel.modelId,
      reasoningEffort: nextReasoningEffort,
    });
    persistSelection(nextModel.modelId, nextReasoningEffort, {
      engine: selectedEngine,
    });
  }, [
    availableModels,
    onSelectionChange,
    persistSelection,
    preferredModelId,
    preferredReasoningEffort,
    selectedEngine,
    selectedModelKey,
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

    if (availableModels.length === 0) {
      if (selectedEngine === "sentinel" && selectedEngineModels.length > 0) {
        setSelectedModelKey(null);
        setSelectedReasoningEffort(null);
      }
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
    selectedEngineModels.length,
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

      const nextModel = availableModelsByEngine[engine][0];
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
      availableModelsByEngine,
      onSelectionChange,
      persistEngineSelection,
      persistSelection,
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

  const handleSelectOpenCodeAgent = useCallback((agent: string | null) => {
    setSelectedOpenCodeAgent(agent);
  }, []);

  const handleSelectOpenCodeVariant = useCallback((variant: string | null) => {
    setSelectedOpenCodeVariant(variant);
  }, []);

  const effectiveSelectedOpenCodeAgent =
    selectedModel?.engine === "opencode"
      ? resolveOpenCodeTraitSelectionValue(
          selectedModel.openCode?.agentOptions,
          selectedOpenCodeAgent,
          preferredOpenCodeAgent,
        )
      : null;
  const effectiveSelectedOpenCodeVariant =
    selectedModel?.engine === "opencode"
      ? resolveOpenCodeTraitSelectionValue(
          selectedModel.openCode?.variantOptions,
          selectedOpenCodeVariant,
          preferredOpenCodeVariant,
        )
      : null;

  useEffect(() => {
    onOpenCodeSelectionChange?.({
      agent: effectiveSelectedOpenCodeAgent,
      variant: effectiveSelectedOpenCodeVariant,
    });
  }, [
    effectiveSelectedOpenCodeAgent,
    effectiveSelectedOpenCodeVariant,
    onOpenCodeSelectionChange,
  ]);

  return {
    availableModels,
    engineOptions,
    enginesQuery,
    handleSelectEngine,
    handleSelectModel,
    handleSelectOpenCodeAgent,
    handleSelectOpenCodeVariant,
    handleSelectReasoningEffort,
    modelsQuery,
    selectedEngine,
    selectedEngineStatus,
    selectedOpenCodeAgent: effectiveSelectedOpenCodeAgent,
    selectedOpenCodeVariant: effectiveSelectedOpenCodeVariant,
    selectedModel,
    selectedModelKey,
    selectedReasoningEffort,
    supportedReasoningEfforts,
    threadPersistenceReadyRef,
  };
}
