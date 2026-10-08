import type {
  EngineModel,
  EngineOptionDescriptor,
} from "@/lib/ai/chat/engines/contract";
import { REASONING_OPTION_ID } from "@/lib/ai/chat/engines/model-options";
import type { ReasoningEffort } from "@/lib/ai/providers/models";

import {
  asRecord,
  readArray,
  readNonEmptyString,
  readString,
  type AcpModeState,
} from "./schema";

// Session config options (ACP `configOptions`): the model, its reasoning
// effort and the agent's mode, found by category ("model", "thought_level",
// "mode") with id/name fallbacks. Pure helpers; session.ts applies them
// before each prompt, only when a value differs from the session's current
// one. There is no probe loop that sets every model to learn its efforts
// (the old Cursor client did that on every status check): per-model effort
// lists are learned from the options the agent returns when the model is
// actually set, and Cursor lists them up front (cursor/list_available_models).

export type AcpConfigValue = {
  description: string | null;
  name: string;
  value: string;
};

export type AcpConfigOptionInfo = {
  category: string | null;
  currentValue: string | boolean | null;
  description: string | null;
  id: string;
  name: string;
  type: string;
  /** Select values, groups flattened. */
  values: AcpConfigValue[];
};

function readValues(rawOptions: unknown): AcpConfigValue[] {
  if (!Array.isArray(rawOptions)) {
    return [];
  }

  return rawOptions.flatMap((entry): AcpConfigValue[] => {
    // A group: { group, name, options: [...] }.
    const nested = readArray(entry, "options");
    if (nested) {
      return readValues(nested);
    }
    const value =
      readString(entry, "value") ??
      (typeof entry === "string" ? (entry as string) : null);
    if (value == null || value === "") {
      return [];
    }
    return [
      {
        description: readString(entry, "description"),
        name: readNonEmptyString(entry, "name") ?? value,
        value,
      },
    ];
  });
}

export function readConfigOptions(raw: unknown): AcpConfigOptionInfo[] {
  const options = Array.isArray(raw)
    ? raw
    : (readArray(raw, "configOptions") ?? []);
  return options.flatMap((option): AcpConfigOptionInfo[] => {
    const id = readNonEmptyString(option, "id");
    if (!id) {
      return [];
    }
    const record = asRecord(option);
    const current = record?.currentValue;
    return [
      {
        category: readString(option, "category"),
        currentValue:
          typeof current === "string" || typeof current === "boolean"
            ? current
            : null,
        description: readString(option, "description"),
        id,
        name: readNonEmptyString(option, "name") ?? id,
        type: readString(option, "type") ?? "select",
        values: readValues(record?.options),
      },
    ];
  });
}

const EFFORT_OPTION_PATTERN =
  /^(?:reasoning|effort|thinking|thought[_ ]?level)$/i;

export function findModelOption(options: readonly AcpConfigOptionInfo[]) {
  return (
    options.find((option) => option.category === "model") ??
    options.find((option) => option.id === "model") ??
    options.find((option) => option.name.toLowerCase() === "model") ??
    null
  );
}

export function findEffortOption(options: readonly AcpConfigOptionInfo[]) {
  return (
    options.find((option) => option.category === "thought_level") ??
    options.find(
      (option) =>
        EFFORT_OPTION_PATTERN.test(option.id) ||
        EFFORT_OPTION_PATTERN.test(option.name),
    ) ??
    null
  );
}

export function findModeOption(options: readonly AcpConfigOptionInfo[]) {
  return (
    options.find((option) => option.category === "mode") ??
    options.find(
      (option) => option.id === "mode" || option.id === "collaboration_mode",
    ) ??
    null
  );
}

/** Agent effort values → Sentinel's levels (extra-high, maximum, off, …). */
export function normalizeEffortValue(value: string): ReasoningEffort | null {
  switch (
    value
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
  ) {
    case "none":
    case "off":
      return "none";
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
    case "med":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
    case "x-high":
    case "extra-high":
    case "extrahigh":
    case "very-high":
      return "xhigh";
    case "max":
    case "maximum":
      return "max";
    default:
      return null;
  }
}

/** Levels tried, in order, when the agent lacks the exact one. */
const EFFORT_FALLBACKS: Record<ReasoningEffort, ReasoningEffort[]> = {
  high: ["high"],
  low: ["low"],
  max: ["max", "xhigh"],
  medium: ["medium"],
  minimal: ["minimal", "none", "low"],
  none: ["none", "minimal"],
  xhigh: ["xhigh", "max"],
};

/** The agent's value for a Sentinel effort level, or null when it has none. */
export function matchEffortValue(
  effort: ReasoningEffort,
  values: readonly AcpConfigValue[],
): string | null {
  for (const candidate of EFFORT_FALLBACKS[effort] ?? [effort]) {
    const match = values.find(
      (entry) => normalizeEffortValue(entry.value) === candidate,
    );
    if (match) {
      return match.value;
    }
  }
  return null;
}

/** A config change to make before prompting. */
export type AcpConfigChange = { configId: string; value: string };

/**
 * The model change to make, or null: only a value the option offers, and
 * only when it differs from the current one. Values the agent does not list
 * (aliases such as "default" on agents without it) are never sent.
 */
export function planModelChange(
  options: readonly AcpConfigOptionInfo[],
  modelId: string | null | undefined,
): AcpConfigChange | null {
  const option = findModelOption(options);
  if (!modelId || !option || option.currentValue === modelId) {
    return null;
  }
  return option.values.some((entry) => entry.value === modelId)
    ? { configId: option.id, value: modelId }
    : null;
}

export function planEffortChange(
  options: readonly AcpConfigOptionInfo[],
  effort: ReasoningEffort | null | undefined,
): AcpConfigChange | null {
  const option = findEffortOption(options);
  if (!effort || !option) {
    return null;
  }
  const value = matchEffortValue(effort, option.values);
  return value && value !== option.currentValue
    ? { configId: option.id, value }
    : null;
}

const PLAN_MODE_PATTERN = /^(?:plan|architect|planning)$/i;

export function isPlanModeId(modeId: string | null | undefined) {
  return modeId != null && PLAN_MODE_PATTERN.test(modeId);
}

/** The agent's plan mode id (`session/set_mode`), if it has one. */
export function findPlanModeId(modes: AcpModeState | null) {
  return (
    modes?.availableModes.find((mode) => isPlanModeId(mode.id))?.id ?? null
  );
}

/** The mode to go back to after plan mode: the remembered one, else the first non-plan mode. */
export function findBuildModeId(
  modes: AcpModeState | null,
  remembered: string | null | undefined,
) {
  const available = modes?.availableModes ?? [];
  if (
    remembered &&
    !isPlanModeId(remembered) &&
    available.some((mode) => mode.id === remembered)
  ) {
    return remembered;
  }
  return available.find((mode) => !isPlanModeId(mode.id))?.id ?? null;
}

/** A mode config option's plan value (when the agent has no session modes). */
export function findPlanConfigValue(option: AcpConfigOptionInfo | null) {
  return (
    option?.values.find((entry) => isPlanModeId(entry.value))?.value ?? null
  );
}

function effortLabel(effort: ReasoningEffort) {
  switch (effort) {
    case "xhigh":
      return "Extra high";
    case "max":
      return "Max";
    default:
      return effort[0]!.toUpperCase() + effort.slice(1);
  }
}

/** A reasoning descriptor from an agent's effort option (null without one). */
export function toReasoningDescriptor(
  option: AcpConfigOptionInfo | null,
): EngineOptionDescriptor | null {
  if (!option) {
    return null;
  }
  const current =
    typeof option.currentValue === "string"
      ? normalizeEffortValue(option.currentValue)
      : null;
  const seen = new Set<ReasoningEffort>();
  const choices = option.values.flatMap((entry) => {
    const effort = normalizeEffortValue(entry.value);
    if (!effort || seen.has(effort)) {
      return [];
    }
    seen.add(effort);
    return [
      {
        id: effort,
        label: effortLabel(effort),
        ...(effort === current ? { isDefault: true } : {}),
      },
    ];
  });
  return choices.length > 0
    ? {
        choices,
        id: REASONING_OPTION_ID,
        label: "Reasoning effort",
        role: "reasoning",
        type: "select",
      }
    : null;
}

export type AcpCatalogModel = {
  /** The model's own effort option, when the agent reported one. */
  effortOption?: AcpConfigOptionInfo | null;
  id: string;
  isDefault?: boolean;
  name: string;
};

/** Catalog entries as engine models (live). */
export function toAcpEngineModels(
  models: readonly AcpCatalogModel[],
  options: { imageInput?: boolean } = {},
): EngineModel[] {
  const seen = new Set<string>();
  return models.flatMap((model) => {
    if (!model.id || seen.has(model.id)) {
      return [];
    }
    seen.add(model.id);
    const reasoning = toReasoningDescriptor(model.effortOption ?? null);
    return [
      {
        id: model.id,
        inputModalities: options.imageInput
          ? (["text", "image"] as const).slice()
          : (["text"] as const).slice(),
        isCustom: false,
        ...(model.isDefault ? { isDefault: true } : {}),
        name: model.name,
        options: reasoning ? [reasoning] : [],
        source: "live" as const,
      },
    ];
  });
}

/**
 * The models a session's options describe: every value of the model option,
 * the current one with the session's effort option.
 */
export function catalogFromConfigOptions(
  options: readonly AcpConfigOptionInfo[],
): AcpCatalogModel[] {
  const modelOption = findModelOption(options);
  if (!modelOption) {
    return [];
  }
  const effortOption = findEffortOption(options);
  return modelOption.values.map((entry) => ({
    ...(entry.value === modelOption.currentValue
      ? { effortOption, isDefault: true }
      : {}),
    id: entry.value,
    name: entry.name,
  }));
}
