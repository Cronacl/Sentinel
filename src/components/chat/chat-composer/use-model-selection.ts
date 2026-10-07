import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getDriverMeta } from "@/lib/ai/chat/engines/catalog";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ChatEngine } from "@/server/db/enums";
import { api } from "@/trpc/react";
import type {
  ChatComposerOpenCodeSelection,
  ChatComposerSelectionChange,
  ChatComposerThreadSelection,
} from "./types";

import {
  FALLBACK_CHAT_ENGINE_OPTIONS,
  filterSelectableModels,
  haveSameEngineOptionSet,
  haveSameSelectableModelSet,
  resolveStableEngineOptions,
  resolveReasoningEffort,
  resolveStableSelectableModels,
  type ChatComposerEngineOption,
  type ChatComposerModel,
} from "../chat-composer-helpers";
import {
  findPreferredModel,
  resolveOpenCodeTraitSelectionValue,
} from "./use-model-selection.helpers";

import type { usePersistSelection } from "./use-persist-selection";

type PersistSelectionReturn = ReturnType<typeof usePersistSelection>;
type ModelsByInstance = Record<string, ChatComposerModel[]>;

const EMPTY_MODELS: ChatComposerModel[] = [];

/**
 * The built-in engine lists the provider catalog: when every live model is
 * inactive (no provider connected), it shows none rather than a stale
 * cached list.
 */
function isBuiltinEngine(engine: string) {
  return getDriverMeta(engine)?.runtime === "builtin";
}

/** The instance a stored selection points at (NULL/absent: the default). */
function preferredInstanceOf(
  selection: { engine?: string | null; engineInstanceId?: string | null },
  fallbackEngine: string,
) {
  const engine = selection.engine ?? fallbackEngine;
  return selection.engineInstanceId ?? engine;
}

function filterSelectableModelsByInstance(models: ModelsByInstance) {
  return Object.fromEntries(
    Object.entries(models).map(([instanceId, list]) => [
      instanceId,
      filterSelectableModels(list),
    ]),
  ) as ModelsByInstance;
}

/**
 * The composer's engine and model selection. Engines are picked per
 * instance (engines.composerCatalog lists every enabled instance with its
 * models in one query); the driver kind travels alongside as `engine`.
 */
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
  onSelectionChange?: (input: ChatComposerSelectionChange) => void;
  persistEngineSelection: PersistSelectionReturn["persistEngineSelection"];
  persistSelection: PersistSelectionReturn["persistSelection"];
  selectionScopeKey: string;
  threadSelection?: ChatComposerThreadSelection | null;
}) {
  const utils = api.useUtils();
  const cachedCatalog = utils.engines.composerCatalog.getData();

  const catalogQuery = api.engines.composerCatalog.useQuery(undefined, {
    initialData:
      cachedCatalog && cachedCatalog.options.length > 0
        ? cachedCatalog
        : undefined,
    staleTime: 60_000,
  });
  const [cachedEngineOptions, setCachedEngineOptions] = useState<
    ChatComposerEngineOption[]
  >(() =>
    cachedCatalog && cachedCatalog.options.length > 0
      ? cachedCatalog.options
      : [...FALLBACK_CHAT_ENGINE_OPTIONS],
  );
  const [cachedAvailableModelsByInstance, setCachedAvailableModelsByInstance] =
    useState<ModelsByInstance>(() =>
      filterSelectableModelsByInstance(cachedCatalog?.modelsByInstance ?? {}),
    );
  const initializedSelectionScopeRef = useRef<string | null>(null);
  const threadPersistenceReadyRef = useRef(false);
  const manualInstanceSelectionRef = useRef<string | null>(null);

  const globalSelection = globalSelectionQuery.data;
  const preferredEngine: ChatEngine =
    threadSelection?.engine ?? globalSelection?.engine ?? "sentinel";
  const preferredInstanceId = threadSelection?.engine
    ? preferredInstanceOf(threadSelection, preferredEngine)
    : preferredInstanceOf(globalSelection ?? {}, preferredEngine);
  const hasThreadSelection = Boolean(threadSelection?.modelId);
  const preferredModelId = hasThreadSelection
    ? (threadSelection?.modelId ?? null)
    : (globalSelection?.modelId ?? null);
  const preferredReasoningEffort = hasThreadSelection
    ? (threadSelection?.reasoningEffort ?? null)
    : ((globalSelection?.reasoningEffort as ReasoningEffort | null) ?? null);
  const preferredOpenCodeAgent = openCodeSelection?.agent ?? null;
  const preferredOpenCodeVariant = openCodeSelection?.variant ?? null;
  const [selectedEngine, setSelectedEngine] = useState<ChatEngine>(
    () => preferredEngine,
  );
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(
    () => preferredInstanceId,
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
    () => catalogQuery.data?.options ?? [],
    [catalogQuery.data?.options],
  );
  const engineOptions = useMemo(
    () => resolveStableEngineOptions(liveEngineOptions, cachedEngineOptions),
    [cachedEngineOptions, liveEngineOptions],
  );
  const selectedEngineStatus =
    engineOptions.find((option) => option.instanceId === selectedInstanceId) ??
    null;
  const modelsByInstance = catalogQuery.data?.modelsByInstance;
  const selectedEngineModels =
    modelsByInstance?.[selectedInstanceId] ?? EMPTY_MODELS;
  const liveAvailableModelsByInstance = useMemo(
    () => filterSelectableModelsByInstance(modelsByInstance ?? {}),
    [modelsByInstance],
  );
  const availableModelsByInstance = useMemo(() => {
    const instanceIds = new Set([
      ...Object.keys(modelsByInstance ?? {}),
      ...Object.keys(cachedAvailableModelsByInstance),
    ]);
    const result: ModelsByInstance = {};
    for (const instanceId of instanceIds) {
      const live = modelsByInstance?.[instanceId] ?? EMPTY_MODELS;
      const engine =
        live[0]?.engine ??
        cachedAvailableModelsByInstance[instanceId]?.[0]?.engine ??
        instanceId;
      result[instanceId] = resolveStableSelectableModels(
        live,
        cachedAvailableModelsByInstance[instanceId] ?? EMPTY_MODELS,
        isBuiltinEngine(engine)
          ? { reuseCacheWhenLiveHasOnlyInactiveModels: false }
          : {},
      );
    }
    return result;
  }, [cachedAvailableModelsByInstance, modelsByInstance]);
  const availableModels =
    availableModelsByInstance[selectedInstanceId] ?? EMPTY_MODELS;
  const displayModels = isBuiltinEngine(selectedEngine)
    ? availableModels
    : selectedEngineModels.length > 0
      ? selectedEngineModels
      : availableModels;

  const selectedModel =
    displayModels.find((model) => model.modelId === selectedModelKey) ?? null;

  const supportedReasoningEfforts =
    selectedModel?.supportedReasoningEfforts ?? [];

  useEffect(() => {
    if (!selectedModel?.openCode) {
      if (selectedOpenCodeAgent !== null) {
        setSelectedOpenCodeAgent(null);
      }
      if (selectedOpenCodeVariant !== null) {
        setSelectedOpenCodeVariant(null);
      }
      return;
    }

    const nextAgent = resolveOpenCodeTraitSelectionValue(
      selectedModel.openCode.agentOptions,
      selectedOpenCodeAgent,
      preferredOpenCodeAgent,
    );
    const nextVariant = resolveOpenCodeTraitSelectionValue(
      selectedModel.openCode.variantOptions,
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
    setCachedAvailableModelsByInstance((currentCache) => {
      let changed = false;
      const nextCache = { ...currentCache };

      for (const [instanceId, nextModels] of Object.entries(
        liveAvailableModelsByInstance,
      )) {
        if (
          nextModels.length === 0 ||
          haveSameSelectableModelSet(
            currentCache[instanceId] ?? EMPTY_MODELS,
            nextModels,
          )
        ) {
          continue;
        }

        nextCache[instanceId] = nextModels;
        changed = true;
      }

      return changed ? nextCache : currentCache;
    });
  }, [liveAvailableModelsByInstance]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    if (initializedSelectionScopeRef.current !== selectionScopeKey) {
      setSelectedEngine(preferredEngine);
      setSelectedInstanceId(preferredInstanceId);
    }
  }, [
    preferredEngine,
    preferredInstanceId,
    preferencesReady,
    selectionScopeKey,
  ]);

  useEffect(() => {
    if (
      !preferencesReady ||
      initializedSelectionScopeRef.current !== selectionScopeKey
    ) {
      return;
    }
    if (manualInstanceSelectionRef.current) {
      if (manualInstanceSelectionRef.current === preferredInstanceId) {
        manualInstanceSelectionRef.current = null;
      }
      return;
    }
    setSelectedEngine(preferredEngine);
    setSelectedInstanceId(preferredInstanceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when the preferred instance changes, not the selection
  }, [preferredEngine, preferredInstanceId]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    if (initializedSelectionScopeRef.current === selectionScopeKey) {
      return;
    }

    if (selectedInstanceId !== preferredInstanceId) {
      return;
    }

    if (catalogQuery.isLoading && availableModels.length === 0) {
      return;
    }

    if (availableModels.length === 0) {
      const fallbackDisplayModel =
        findPreferredModel(displayModels, preferredModelId) ??
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

    const preferredModel = findPreferredModel(
      availableModels,
      preferredModelId,
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
        engineInstanceId: selectedInstanceId,
        modelId: nextModel.modelId,
        reasoningEffort: nextReasoningEffort,
      });
      persistSelection(nextModel.modelId, nextReasoningEffort, {
        engine: selectedEngine,
        engineInstanceId: selectedInstanceId,
      });
    }
  }, [
    availableModels,
    catalogQuery.isLoading,
    onSelectionChange,
    persistSelection,
    preferredEngine,
    preferredInstanceId,
    preferredModelId,
    preferredReasoningEffort,
    preferencesReady,
    selectedEngine,
    selectedInstanceId,
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

    const preferredModel = findPreferredModel(
      availableModels,
      preferredModelId,
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
      engineInstanceId: selectedInstanceId,
      modelId: nextModel.modelId,
      reasoningEffort: nextReasoningEffort,
    });
    persistSelection(nextModel.modelId, nextReasoningEffort, {
      engine: selectedEngine,
      engineInstanceId: selectedInstanceId,
    });
  }, [
    availableModels,
    onSelectionChange,
    persistSelection,
    preferredModelId,
    preferredReasoningEffort,
    selectedEngine,
    selectedInstanceId,
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
      if (isBuiltinEngine(selectedEngine) && selectedEngineModels.length > 0) {
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
      engineInstanceId: selectedInstanceId,
      modelId: fallbackModel.modelId,
      reasoningEffort: fallbackEffort,
    });
    persistSelection(fallbackModel.modelId, fallbackEffort, {
      engine: selectedEngine,
      engineInstanceId: selectedInstanceId,
    });
  }, [
    availableModels,
    onSelectionChange,
    persistSelection,
    selectedEngine,
    selectedEngineModels.length,
    selectedInstanceId,
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

  /** Selects an engine instance (by instance id; a driver kind is its default). */
  const handleSelectEngine = useCallback(
    (instanceId: string) => {
      const option =
        engineOptions.find(
          (candidate) => candidate.instanceId === instanceId,
        ) ?? null;
      const engine = (option?.engine ?? instanceId) as ChatEngine;
      manualInstanceSelectionRef.current = instanceId;
      setSelectedEngine(engine);
      setSelectedInstanceId(instanceId);
      initializedSelectionScopeRef.current = null;

      const nextModel = availableModelsByInstance[instanceId]?.[0];
      const nextMode = undefined;

      if (!nextModel) {
        setSelectedModelKey(null);
        setSelectedReasoningEffort(null);
        onSelectionChange?.({
          engine,
          engineInstanceId: instanceId,
          modelId: null,
          mode: nextMode,
          reasoningEffort: null,
        });
        persistEngineSelection(engine, {
          engineInstanceId: instanceId,
          ...(nextMode ? { mode: nextMode } : {}),
        });
        return;
      }

      const nextReasoningEffort = resolveReasoningEffort(nextModel, null);
      setSelectedModelKey(nextModel.modelId);
      setSelectedReasoningEffort(nextReasoningEffort);
      onSelectionChange?.({
        engine,
        engineInstanceId: instanceId,
        modelId: nextModel.modelId,
        mode: nextMode,
        reasoningEffort: nextReasoningEffort,
      });
      persistSelection(nextModel.modelId, nextReasoningEffort, {
        engine,
        engineInstanceId: instanceId,
        ...(nextMode ? { mode: nextMode } : {}),
      });
    },
    [
      availableModelsByInstance,
      engineOptions,
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
        engineInstanceId: selectedInstanceId,
        modelId: modelKey,
        reasoningEffort: nextReasoningEffort,
      });
      persistSelection(modelKey, nextReasoningEffort, {
        engine: selectedEngine,
        engineInstanceId: selectedInstanceId,
      });
    },
    [
      availableModels,
      onSelectionChange,
      persistSelection,
      selectedEngine,
      selectedInstanceId,
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
        engineInstanceId: selectedInstanceId,
        modelId: selectedModelKey,
        reasoningEffort: effort,
      });
      persistSelection(selectedModelKey, effort, {
        engine: selectedEngine,
        engineInstanceId: selectedInstanceId,
      });
    },
    [
      onSelectionChange,
      persistSelection,
      selectedEngine,
      selectedInstanceId,
      selectedModelKey,
    ],
  );

  const handleSelectOpenCodeAgent = useCallback((agent: string | null) => {
    setSelectedOpenCodeAgent(agent);
  }, []);

  const handleSelectOpenCodeVariant = useCallback((variant: string | null) => {
    setSelectedOpenCodeVariant(variant);
  }, []);

  const effectiveSelectedOpenCodeAgent = selectedModel?.openCode
    ? resolveOpenCodeTraitSelectionValue(
        selectedModel.openCode.agentOptions,
        selectedOpenCodeAgent,
        preferredOpenCodeAgent,
      )
    : null;
  const effectiveSelectedOpenCodeVariant = selectedModel?.openCode
    ? resolveOpenCodeTraitSelectionValue(
        selectedModel.openCode.variantOptions,
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
    enginesQuery: catalogQuery,
    handleSelectEngine,
    handleSelectModel,
    handleSelectOpenCodeAgent,
    handleSelectOpenCodeVariant,
    handleSelectReasoningEffort,
    modelsQuery: catalogQuery,
    selectedEngine,
    selectedEngineStatus,
    selectedInstanceId,
    selectedOpenCodeAgent: effectiveSelectedOpenCodeAgent,
    selectedOpenCodeVariant: effectiveSelectedOpenCodeVariant,
    selectedModel,
    selectedModelKey,
    selectedReasoningEffort,
    supportedReasoningEfforts,
    threadPersistenceReadyRef,
  };
}
