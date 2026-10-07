import type { ReasoningEffort } from "@/lib/ai/providers/models";
import { getDriverLabel, getDriverMeta } from "@/lib/ai/chat/engines/catalog";
import type { PermissionMode } from "@/server/db/enums";

import {
  getEngineStabilityNotice,
  getReasoningEffortLabel,
  resolveReasoningEffort,
  type ChatComposerEngineOption,
  type ChatComposerModel,
} from "@/components/chat/chat-composer-helpers";
import type { SelectOption } from "@/components/forms/controlled-fields";

export type AutomationEngineModel = ChatComposerModel;

/**
 * One option per engine instance (engines.composerCatalog). The value is the
 * instance id; the driver kind comes from the option itself.
 */
export function getAutomationEngineOptions(
  engines: readonly ChatComposerEngineOption[],
): SelectOption[] {
  return engines.map((engine) => {
    const stability = getEngineStabilityNotice(engine);
    const descriptionSuffix = engine.description.endsWith(".") ? " " : ". ";

    return {
      description: stability
        ? `${engine.description}${descriptionSuffix}${stability.description}`
        : engine.description,
      isDisabled: !engine.isAvailable,
      label: engine.label,
      value: engine.instanceId,
    };
  });
}

export function getAvailableAutomationModels(
  models: AutomationEngineModel[] | null | undefined,
): AutomationEngineModel[] {
  return (models ?? []).filter((model) => model.isConnected && model.isEnabled);
}

/** The models of one instance (by instance id). */
export function getAutomationModelsForInstance(
  instanceId: string | null | undefined,
  modelsByInstance: Readonly<
    Record<string, AutomationEngineModel[] | undefined>
  >,
) {
  if (!instanceId) return [];
  return modelsByInstance[instanceId] ?? [];
}

/**
 * The instance a stored automation (or the user default) points at: its
 * instance id, else the driver's default instance (whose id is the driver).
 */
export function resolveAutomationInstanceId(selection: {
  chatEngine?: string | null;
  chatEngineInstanceId?: string | null;
}) {
  return selection.chatEngineInstanceId ?? selection.chatEngine ?? "sentinel";
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

function getEngineModelDescription(engine: string) {
  return getDriverMeta(engine)?.runtime === "builtin"
    ? "Built-in model"
    : `${getDriverLabel(engine)} runtime`;
}

/**
 * Automations run unattended (interactive: false). Engines that settle
 * approvals themselves decline what would ask the user; full access already
 * approves what an external engine asks about. The built-in engine asks per
 * tool (approval policies, whatever the access mode), so its declines apply
 * under full access too. Engines without the capability leave a request
 * waiting in the automation's thread.
 */
export function getAutomationUnattendedNotice(
  permissionMode: PermissionMode | null | undefined,
  engine:
    | Pick<ChatComposerEngineOption, "engine" | "settlesUnattendedApprovals">
    | null
    | undefined,
) {
  if (!engine) {
    return null;
  }
  if (
    engine.settlesUnattendedApprovals &&
    getDriverMeta(engine.engine)?.runtime === "builtin"
  ) {
    return "Automations run unattended: tools whose approval policy asks first are declined.";
  }
  if (permissionMode === "full") {
    return null;
  }
  return engine.settlesUnattendedApprovals
    ? "Automations run unattended: actions that need approval are declined unless the workspace allows full access."
    : "Actions that need approval wait in the automation's thread until you answer, unless the workspace allows full access.";
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
