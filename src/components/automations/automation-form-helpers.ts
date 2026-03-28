import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ChatEngine } from "@/server/db/enums";
import type { RouterOutputs } from "@/trpc/react";

import {
  getReasoningEffortLabel,
  resolveReasoningEffort,
  type ChatComposerModel,
} from "@/components/chat/chat-composer-helpers";
import type { SelectOption } from "@/components/forms/controlled-fields";

type EngineStatus = RouterOutputs["engines"]["list"][number];

export type AutomationEngineModel = ChatComposerModel &
  RouterOutputs["engines"]["models"][number];

export function getAutomationEngineOptions(
  engines: EngineStatus[],
): SelectOption[] {
  return engines.map((engine) => ({
    description: engine.description,
    isDisabled: !engine.isAvailable,
    label: engine.label,
    value: engine.engine,
  }));
}

export function getAvailableAutomationModels(
  models: AutomationEngineModel[] | null | undefined,
): AutomationEngineModel[] {
  return (models ?? []).filter((model) => model.isConnected && model.isEnabled);
}

export function getAutomationModelsForEngine(
  engine: ChatEngine | null | undefined,
  queries: Partial<Record<ChatEngine, AutomationEngineModel[] | undefined>>,
) {
  if (!engine) return [];
  return queries[engine] ?? [];
}

export function getAutomationModelOptions(
  models: AutomationEngineModel[] | null | undefined,
  selectedModelId?: string | null,
): SelectOption[] {
  const options: SelectOption[] = [
    {
      description: "Use default model behavior.",
      label: "Use default model",
      value: "__default__",
    },
    ...(models ?? []).map((model) => ({
      description: model.provider ?? getEngineModelDescription(model.engine),
      label: model.displayName,
      value: model.modelId,
    })),
  ];

  if (
    selectedModelId &&
    selectedModelId !== "__default__" &&
    !options.some((option) => option.value === selectedModelId)
  ) {
    options.push({
      description: "Currently saved model is unavailable.",
      isDisabled: true,
      label: selectedModelId,
      value: selectedModelId,
    });
  }

  return options;
}

function getEngineModelDescription(engine: ChatEngine) {
  switch (engine) {
    case "sentinel":
      return "Built-in model";
    case "codex":
      return "Codex runtime";
    case "claude":
      return "Claude runtime";
  }
}

export function getAutomationReasoningOptions(
  efforts: ReasoningEffort[],
): SelectOption[] {
  return efforts.map((effort) => ({
    description: "Matches the selected model's supported reasoning levels.",
    label: getReasoningEffortLabel(effort),
    value: effort,
  }));
}

export function resolveAutomationSelection(
  models: AutomationEngineModel[] | null | undefined,
  preferredModelId?: string | null,
  preferredReasoningEffort?: ReasoningEffort | null,
) {
  const availableModels = models ?? [];
  const selectedModel =
    availableModels.find((model) => model.modelId === preferredModelId) ??
    availableModels[0] ??
    null;

  return {
    modelId: selectedModel?.modelId ?? "__default__",
    reasoningEffort: selectedModel
      ? resolveReasoningEffort(selectedModel, preferredReasoningEffort)
      : null,
  };
}
