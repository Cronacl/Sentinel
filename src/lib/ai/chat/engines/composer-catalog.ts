// Client-safe projections of engine snapshots for the composer, the model
// selector, automations and skills: one engine option per instance and the
// instance's models in the shape the composer has always consumed. Pure
// functions over snapshots, so the server (engines.composerCatalog) and the
// client (snapshot events) derive the same values.
import {
  REASONING_EFFORTS,
  type ReasoningEffort,
} from "@/lib/ai/providers/models";
import type { AIProvider, PermissionMode } from "@/server/db/enums";

import { getDriverMeta } from "./catalog";
import type {
  EngineModel,
  EngineOptionDescriptor,
  EnginePlanModeSupport,
  EngineSelectOptionDescriptor,
  EngineSlashCommand,
  EngineSnapshot,
} from "./contract";
import { REASONING_OPTION_ID } from "./model-options";

/** One selectable engine instance. */
export type ComposerEngineOption = {
  accentColor: string | null;
  description: string;
  /** Driver kind (thread.chat_engine). */
  engine: string;
  /** Why the instance cannot be used right now; null when usable. */
  error: string | null;
  instanceId: string;
  isAvailable: boolean;
  isDefaultInstance: boolean;
  label: string;
  permissionModes: readonly PermissionMode[];
  /** Unattended runs decline approval requests instead of waiting. */
  settlesUnattendedApprovals: boolean;
  /** The composer's slash menu; absent until the instance reports any. */
  slashCommands?: EngineSlashCommand[];
  stability: "beta" | "experimental" | "stable";
  supportsPlanMode: EnginePlanModeSupport;
};

/** A model as the composer and automations list it. */
export type ComposerEngineModel = {
  contextWindow?: number;
  defaultReasoningEffort: ReasoningEffort | null;
  description: string;
  displayName: string;
  /** Driver kind. */
  engine: string;
  inputModalities: string[];
  instanceId: string;
  isConnected: boolean;
  isEnabled: boolean;
  modelId: string;
  /** Reasoning, agent, variant, … (components/engines/option-descriptors.ts). */
  options: EngineOptionDescriptor[];
  provider: AIProvider | null;
  rawModelId: string;
  supportedReasoningEfforts: ReasoningEffort[];
};

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

function findSelect(
  options: readonly EngineOptionDescriptor[],
  id: string,
): EngineSelectOptionDescriptor | null {
  const descriptor = options.find((option) => option.id === id);
  return descriptor?.type === "select" ? descriptor : null;
}

/** The reasoning efforts a model's reasoning descriptor offers. */
export function getModelReasoningEfforts(model: Pick<EngineModel, "options">) {
  const descriptor =
    model.options.find(
      (option): option is EngineSelectOptionDescriptor =>
        option.type === "select" && option.role === "reasoning",
    ) ?? findSelect(model.options, REASONING_OPTION_ID);
  const supported = (descriptor?.choices ?? [])
    .map((choice) => choice.id)
    .filter(isReasoningEffort);
  const defaultChoice = descriptor?.choices.find((choice) => choice.isDefault);

  return {
    defaultReasoningEffort:
      defaultChoice && isReasoningEffort(defaultChoice.id)
        ? defaultChoice.id
        : null,
    supportedReasoningEfforts: supported,
  };
}

export function toComposerEngineModel(
  snapshot: Pick<EngineSnapshot, "driver" | "instanceId" | "models" | "usable">,
  model: EngineModel,
): ComposerEngineModel {
  const efforts = getModelReasoningEfforts(model);

  return {
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    defaultReasoningEffort: efforts.defaultReasoningEffort,
    description: model.description ?? "",
    displayName: model.name,
    engine: snapshot.driver,
    inputModalities: [...model.inputModalities],
    instanceId: snapshot.instanceId,
    // Models stay listed while an engine reports them, usable or not, as
    // the engine routes did before snapshots.
    isConnected: snapshot.usable || snapshot.models.length > 0,
    isEnabled: !model.disabledReason,
    modelId: model.id,
    options: model.options,
    provider: null,
    rawModelId: model.runtimeId ?? model.id,
    supportedReasoningEfforts: efforts.supportedReasoningEfforts,
  };
}

export function toComposerEngineModels(
  snapshot: Pick<EngineSnapshot, "driver" | "instanceId" | "models" | "usable">,
) {
  return snapshot.models.map((model) => toComposerEngineModel(snapshot, model));
}

/**
 * Whether an instance belongs in pickers at all: enabled, of a driver this
 * build implements. Unusable instances are still listed (as unavailable).
 */
export function isPickableEngineSnapshot(
  snapshot: Pick<EngineSnapshot, "availability" | "driver" | "enabled">,
) {
  return (
    snapshot.enabled &&
    snapshot.availability === "available" &&
    getDriverMeta(snapshot.driver)?.status === "available"
  );
}

export function toComposerEngineOption(
  snapshot: EngineSnapshot,
): ComposerEngineOption {
  const meta = getDriverMeta(snapshot.driver);
  const usable = snapshot.usable;

  return {
    accentColor: snapshot.accentColor,
    description: snapshot.description,
    engine: snapshot.driver,
    error: usable
      ? null
      : (snapshot.message ??
        (snapshot.status === "checking"
          ? `${snapshot.label} is being checked.`
          : `${snapshot.label} is unavailable.`)),
    instanceId: snapshot.instanceId,
    isAvailable: usable,
    isDefaultInstance: snapshot.isDefaultInstance,
    label: snapshot.label,
    permissionModes: snapshot.capabilities.permissionModes,
    settlesUnattendedApprovals: snapshot.capabilities.supportsUnattendedTools,
    ...(snapshot.slashCommands.length > 0
      ? { slashCommands: snapshot.slashCommands }
      : {}),
    stability: meta?.stability ?? "experimental",
    supportsPlanMode: snapshot.capabilities.supportsPlanMode,
  };
}
