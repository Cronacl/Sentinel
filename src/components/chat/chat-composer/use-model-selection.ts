import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getModelAttachmentCapabilities,
  type ReasoningEffort,
  getSupportedReasoningEfforts,
} from "@/lib/ai/providers/models";
import {
  getCompositeModelId,
  normalizeSelectedModelId,
} from "@/lib/ai/providers/model-selection";
import { api } from "@/trpc/react";

import {
  getAttachmentKindLabel,
  getReasoningEffortLabel,
  resolveReasoningEffort,
  supportsAttachmentKind,
} from "../chat-composer-helpers";
import type { ComposerAttachment } from "../chat-attachments";

import type { usePersistSelection } from "./use-persist-selection";

type PersistSelectionReturn = ReturnType<typeof usePersistSelection>;

export function useModelSelection({
  attachments,
  globalSelectionQuery,
  persistSelection,
  selectionScopeKey,
  threadSelection,
}: {
  attachments: ComposerAttachment[];
  globalSelectionQuery: PersistSelectionReturn["globalSelectionQuery"];
  persistSelection: PersistSelectionReturn["persistSelection"];
  selectionScopeKey: string;
  threadSelection?: {
    modelId: string | null;
    mode?: "chat" | "plan";
    reasoningEffort?: ReasoningEffort | null;
  } | null;
}) {
  const modelsQuery = api.models.list.useQuery();
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [selectedReasoningEffort, setSelectedReasoningEffort] =
    useState<ReasoningEffort | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const reasoningMenuRef = useRef<HTMLDivElement | null>(null);
  const initializedSelectionScopeRef = useRef<string | null>(null);
  const threadPersistenceReadyRef = useRef(false);

  const availableModels = useMemo(
    () =>
      (modelsQuery.data ?? []).filter(
        (model) => model.isConnected && model.isEnabled,
      ),
    [modelsQuery.data],
  );

  const selectedModel =
    availableModels.find(
      (model) =>
        getCompositeModelId(model.provider, model.modelId) === selectedModelKey,
    ) ?? null;

  const hasThreadSelection = Boolean(threadSelection?.modelId);
  const preferredModelId = hasThreadSelection
    ? (threadSelection?.modelId ?? null)
    : (globalSelectionQuery.data?.modelId ?? null);
  const preferredReasoningEffort = hasThreadSelection
    ? (threadSelection?.reasoningEffort ?? null)
    : ((globalSelectionQuery.data?.reasoningEffort as ReasoningEffort | null) ??
      null);
  const preferencesReady =
    hasThreadSelection || !globalSelectionQuery.isLoading;

  const supportedReasoningEfforts = selectedModel
    ? getSupportedReasoningEfforts(
        selectedModel.provider,
        selectedModel.modelId,
      )
    : [];

  const reasoningLabel = selectedReasoningEffort
    ? getReasoningEffortLabel(selectedReasoningEffort)
    : null;

  const attachmentCapabilities = selectedModel
    ? getModelAttachmentCapabilities(
        selectedModel.provider,
        selectedModel.modelId,
      )
    : {
        supportsCodeTextFiles: false,
        supportsDocuments: false,
        supportsImages: false,
      };

  const unsupportedAttachmentKinds = useMemo(() => {
    return Array.from(
      new Set(
        attachments
          .map((a) => a.fileType.kind)
          .filter(
            (kind) => !supportsAttachmentKind(kind, attachmentCapabilities),
          ),
      ),
    );
  }, [attachmentCapabilities, attachments]);

  const attachmentWarning = useMemo(() => {
    if (!selectedModel || unsupportedAttachmentKinds.length === 0) {
      return "";
    }
    const labels = unsupportedAttachmentKinds.map(getAttachmentKindLabel);
    return `${selectedModel.displayName} may not support ${labels.join(", ")} as chat attachments.`;
  }, [selectedModel, unsupportedAttachmentKinds]);

  useEffect(() => {
    if (initializedSelectionScopeRef.current !== selectionScopeKey) {
      initializedSelectionScopeRef.current = null;
      threadPersistenceReadyRef.current = false;
    }
  }, [selectionScopeKey]);

  useEffect(() => {
    if (availableModels.length === 0) {
      setSelectedModelKey(null);
      setSelectedReasoningEffort(null);
      initializedSelectionScopeRef.current = null;
      return;
    }

    if (!preferencesReady) return;
    if (initializedSelectionScopeRef.current === selectionScopeKey) return;

    const normalizedPreferredModelId = normalizeSelectedModelId(
      preferredModelId,
      availableModels,
    );

    const preferredModel = normalizedPreferredModelId
      ? (availableModels.find(
          (model) =>
            getCompositeModelId(model.provider, model.modelId) ===
            normalizedPreferredModelId,
        ) ?? null)
      : null;
    const nextModel = preferredModel ?? availableModels[0] ?? null;
    const nextModelKey = nextModel
      ? getCompositeModelId(nextModel.provider, nextModel.modelId)
      : null;

    setSelectedModelKey(nextModelKey);
    setSelectedReasoningEffort(
      nextModel
        ? resolveReasoningEffort(
            nextModel.provider,
            nextModel.modelId,
            preferredModel ? preferredReasoningEffort : null,
          )
        : null,
    );
    initializedSelectionScopeRef.current = selectionScopeKey;
  }, [
    availableModels,
    preferredModelId,
    preferredReasoningEffort,
    preferencesReady,
    selectionScopeKey,
  ]);

  useEffect(() => {
    if (!selectedModelKey || availableModels.length === 0) return;

    const stillAvailable = availableModels.some(
      (model) =>
        getCompositeModelId(model.provider, model.modelId) === selectedModelKey,
    );
    if (stillAvailable) return;

    const fallbackModel = availableModels[0];
    if (!fallbackModel) {
      setSelectedModelKey(null);
      setSelectedReasoningEffort(null);
      return;
    }

    const fallbackModelKey = getCompositeModelId(
      fallbackModel.provider,
      fallbackModel.modelId,
    );
    const fallbackReasoningEffort = resolveReasoningEffort(
      fallbackModel.provider,
      fallbackModel.modelId,
      null,
    );

    setSelectedModelKey(fallbackModelKey);
    setSelectedReasoningEffort(fallbackReasoningEffort);
    persistSelection(fallbackModelKey, fallbackReasoningEffort);
  }, [availableModels, persistSelection, selectedModelKey]);

  useEffect(() => {
    if (!selectedModel) {
      if (selectedReasoningEffort !== null) {
        setSelectedReasoningEffort(null);
      }
      return;
    }

    const nextReasoningEffort = resolveReasoningEffort(
      selectedModel.provider,
      selectedModel.modelId,
      selectedReasoningEffort,
    );

    if (nextReasoningEffort !== selectedReasoningEffort) {
      setSelectedReasoningEffort(nextReasoningEffort);
    }
  }, [selectedModel, selectedReasoningEffort]);

  const handleSelectModel = useCallback(
    (modelKey: string) => {
      const nextModel = availableModels.find(
        (model) =>
          getCompositeModelId(model.provider, model.modelId) === modelKey,
      );
      if (!nextModel) return;

      const nextReasoningEffort = resolveReasoningEffort(
        nextModel.provider,
        nextModel.modelId,
        selectedReasoningEffort,
      );

      setSelectedModelKey(modelKey);
      setSelectedReasoningEffort(nextReasoningEffort);
      setModelMenuOpen(false);
      persistSelection(modelKey, nextReasoningEffort);
    },
    [availableModels, persistSelection, selectedReasoningEffort],
  );

  const handleSelectReasoningEffort = useCallback(
    (effort: ReasoningEffort) => {
      if (!selectedModelKey) return;
      setSelectedReasoningEffort(effort);
      setReasoningMenuOpen(false);
      persistSelection(selectedModelKey, effort);
    },
    [persistSelection, selectedModelKey],
  );

  return {
    attachmentWarning,
    availableModels,
    handleSelectModel,
    handleSelectReasoningEffort,
    modelMenuOpen,
    modelMenuRef,
    modelsQuery,
    reasoningLabel,
    reasoningMenuOpen,
    reasoningMenuRef,
    selectedModel,
    selectedModelKey,
    selectedReasoningEffort,
    setModelMenuOpen,
    setReasoningMenuOpen,
    supportedReasoningEfforts,
    threadPersistenceReadyRef,
  };
}
