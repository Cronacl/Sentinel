import type { ReasoningEffort } from "@/lib/ai/providers/models";
import { getDriverLabel, getDriverMeta } from "@/lib/ai/chat/engines/catalog";
import {
  CHAT_ENGINES,
  type ChatEngine,
  type PermissionMode,
} from "@/server/db/enums";

import {
  getEngineStabilityNotice,
  getReasoningEffortLabel,
  resolveReasoningEffort,
  type ChatComposerEngineOption,
  type ChatComposerModel,
} from "@/components/chat/chat-composer-helpers";
import {
  getComposerSelectOptions,
  toComposerOptionValues,
  toModelOptionSelections,
} from "@/components/engines/option-descriptors";
import type { SelectOption } from "@/components/forms/controlled-fields";
import { parseEngineOptionSelections } from "@/lib/ai/chat/engines/model-options";
import type {
  EngineOptionSelection,
  EngineSelectOptionDescriptor,
} from "@/lib/ai/chat/engines/contract";

export type AutomationEngineModel = ChatComposerModel;

function withStabilityNotice(
  engine: Pick<ChatComposerEngineOption, "description" | "stability">,
  description: string,
) {
  const stability = getEngineStabilityNotice(engine);
  if (!stability) {
    return description;
  }
  const separator = description.endsWith(".") ? " " : ". ";
  return `${description}${separator}${stability.description}`;
}

/**
 * One option per driver of the catalog's instances (engines.composerCatalog),
 * in catalog order; the value is the driver kind. A driver none of whose
 * instances can run is disabled.
 */
export function getAutomationDriverOptions(
  engines: readonly ChatComposerEngineOption[],
  selectedDriver?: string | null,
): SelectOption[] {
  const byDriver = new Map<string, ChatComposerEngineOption[]>();
  for (const engine of engines) {
    byDriver.set(engine.engine, [
      ...(byDriver.get(engine.engine) ?? []),
      engine,
    ]);
  }

  const options: SelectOption[] = [...byDriver].map(([driver, instances]) => {
    const first = instances[0]!;
    const meta = getDriverMeta(driver);
    return {
      description: withStabilityNotice(
        first,
        meta?.description ?? first.description,
      ),
      isDisabled: !instances.some((instance) => instance.isAvailable),
      label: meta?.label ?? getDriverLabel(driver),
      value: driver,
    };
  });
  if (selectedDriver && !byDriver.has(selectedDriver)) {
    options.push({
      description: "No instance of this engine is available.",
      isDisabled: true,
      label: getDriverLabel(selectedDriver),
      value: selectedDriver,
    });
  }
  return options;
}

export type AutomationInstanceOption = SelectOption & {
  accentColor: string | null;
};

export const AUTOMATION_INSTANCE_MISSING_DESCRIPTION =
  "No longer available. Pick another instance.";

/**
 * A driver's instances; the value is the instance id. A selected instance
 * missing from the catalog (removed or disabled) stays listed, disabled.
 */
export function getAutomationInstanceOptions(
  engines: readonly ChatComposerEngineOption[],
  driver: string | null,
  selectedInstanceId?: string | null,
): AutomationInstanceOption[] {
  const options: AutomationInstanceOption[] = engines
    .filter((engine) => engine.engine === driver)
    .map((engine) => ({
      accentColor: engine.accentColor,
      description: engine.isAvailable
        ? engine.isDefaultInstance
          ? "Default instance"
          : engine.instanceId
        : (engine.error ?? "Unavailable"),
      isDisabled: !engine.isAvailable,
      label: engine.label,
      value: engine.instanceId,
    }));

  if (
    selectedInstanceId &&
    !options.some((option) => option.value === selectedInstanceId)
  ) {
    options.push({
      accentColor: null,
      description: AUTOMATION_INSTANCE_MISSING_DESCRIPTION,
      isDisabled: true,
      label: selectedInstanceId,
      value: selectedInstanceId,
    });
  }
  return options;
}

/**
 * The instance to use after picking a driver: the current one when it is
 * the driver's, else the driver's default instance when it can run, else
 * its first instance that can, else its first. The driver kind (its default
 * instance's id) when the catalog lists none.
 */
export function pickAutomationInstanceForDriver(
  engines: readonly ChatComposerEngineOption[],
  driver: string,
  currentInstanceId?: string | null,
) {
  const instances = engines.filter((engine) => engine.engine === driver);
  if (
    currentInstanceId &&
    instances.some((engine) => engine.instanceId === currentInstanceId)
  ) {
    return currentInstanceId;
  }
  return (
    instances.find((engine) => engine.isDefaultInstance && engine.isAvailable)
      ?.instanceId ??
    instances.find((engine) => engine.isAvailable)?.instanceId ??
    instances[0]?.instanceId ??
    driver
  );
}

/**
 * Whether the form shows the instance picker: the driver has several
 * instances, or the automation uses one that is not the default.
 */
export function shouldShowAutomationInstancePicker(
  engines: readonly ChatComposerEngineOption[],
  driver: string | null,
  selectedInstanceId: string | null | undefined,
) {
  if (!driver) {
    return false;
  }
  const instances = engines.filter((engine) => engine.engine === driver);
  return (
    instances.length > 1 ||
    (Boolean(selectedInstanceId) && selectedInstanceId !== driver)
  );
}

/** Model option pickers: every select option but the reasoning effort. */
export function getAutomationModelOptionDescriptors(
  model: Pick<AutomationEngineModel, "options"> | null | undefined,
) {
  return getComposerSelectOptions(model?.options);
}

export const AUTOMATION_OPTION_DEFAULT = "__default__";

/** One option's choices, led by the model's own default. */
export function getAutomationModelOptionChoices(
  descriptor: EngineSelectOptionDescriptor,
  selectedValue?: string | null,
): SelectOption[] {
  const defaultChoice = descriptor.choices.find((choice) => choice.isDefault);
  const options: SelectOption[] = [
    {
      description: "Whatever the model uses when nothing is picked.",
      label: defaultChoice
        ? `Model default (${defaultChoice.label})`
        : "Model default",
      value: AUTOMATION_OPTION_DEFAULT,
    },
    ...descriptor.choices.map((choice) => ({
      ...(choice.description ? { description: choice.description } : {}),
      label: choice.label,
      value: choice.id,
    })),
  ];
  if (
    selectedValue &&
    selectedValue !== AUTOMATION_OPTION_DEFAULT &&
    !options.some((option) => option.value === selectedValue)
  ) {
    options.push({
      description: "Currently saved value is unavailable.",
      isDisabled: true,
      label: selectedValue,
      value: selectedValue,
    });
  }
  return options;
}

/**
 * The model_options a save writes: null for "Use default model", the picks
 * the selected model offers, or undefined (keep what is stored) while that
 * model is not in the catalog, so an unloaded or unavailable catalog never
 * wipes stored picks.
 */
export function resolveAutomationModelOptionsForSave(
  modelId: string,
  values: Readonly<Record<string, string>>,
  models: readonly AutomationEngineModel[],
): EngineOptionSelection[] | null | undefined {
  if (modelId === "__default__") {
    return null;
  }
  const model = models.find((candidate) => candidate.modelId === modelId);
  return model
    ? toAutomationModelOptions(
        values,
        getAutomationModelOptionDescriptors(model),
      )
    : undefined;
}

/**
 * The form's option values from an automation's stored model_options
 * (string values only; malformed entries are dropped).
 */
export function toAutomationOptionValues(
  stored: unknown,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(
      toComposerOptionValues(parseEngineOptionSelections(stored)),
    ).flatMap(([id, value]) => (value ? [[id, value]] : [])),
  );
}

/** Values still offered by the selected model's options. */
export function pruneAutomationOptionValues(
  values: Readonly<Record<string, string>>,
  descriptors: readonly EngineSelectOptionDescriptor[],
): Record<string, string> {
  return Object.fromEntries(
    descriptors.flatMap((descriptor) => {
      const value = values[descriptor.id];
      return value && descriptor.choices.some((choice) => choice.id === value)
        ? [[descriptor.id, value]]
        : [];
    }),
  );
}

/**
 * What an automation stores as model_options: a value per option of the
 * selected model that is still offered; null when every option is left to
 * the model.
 */
export function toAutomationModelOptions(
  values: Readonly<Record<string, string>>,
  descriptors: readonly EngineSelectOptionDescriptor[],
): EngineOptionSelection[] | null {
  const selections = toModelOptionSelections(
    Object.fromEntries(
      descriptors.map((descriptor) => {
        const value = values[descriptor.id];
        return [
          descriptor.id,
          value && descriptor.choices.some((choice) => choice.id === value)
            ? value
            : null,
        ];
      }),
    ),
    descriptors,
  );
  return selections.length > 0 ? selections : null;
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

function isChatEngine(value: string | null | undefined): value is ChatEngine {
  return (CHAT_ENGINES as readonly string[]).includes(value ?? "");
}

/**
 * The engine (driver kind) an automation's instance belongs to: the
 * catalog's answer, else the stored automation or preference that names
 * this instance, else the instance id itself when it is a default instance
 * (its id is the driver kind). Null when nothing says, such as a removed
 * instance before the catalog loads: the form then asks for another engine
 * instead of sending the instance id as an engine.
 */
export function resolveAutomationEngine(
  instanceId: string,
  catalogOptions: readonly Pick<
    ChatComposerEngineOption,
    "engine" | "instanceId"
  >[],
  known?: {
    chatEngine?: string | null;
    chatEngineInstanceId?: string | null;
  } | null,
): ChatEngine | null {
  const fromCatalog = catalogOptions.find(
    (option) => option.instanceId === instanceId,
  )?.engine;
  if (isChatEngine(fromCatalog)) {
    return fromCatalog;
  }
  if (
    known &&
    isChatEngine(known.chatEngine) &&
    resolveAutomationInstanceId(known) === instanceId
  ) {
    return known.chatEngine;
  }
  return isChatEngine(instanceId) ? instanceId : null;
}

export const AUTOMATION_ENGINE_UNAVAILABLE_MESSAGE =
  "This engine instance is no longer available. Pick another engine.";

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
