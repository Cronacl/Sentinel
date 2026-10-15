import type { ReasoningEffort } from "@/lib/ai/providers/models";

import {
  asRecord,
  readArray,
  readBoolean,
  readNumber,
  readString,
} from "../acp/schema";
import type { EngineModel, EngineOptionDescriptor } from "../contract";
import { REASONING_OPTION_ID } from "../model-options";

// Pi's models and thinking levels as Sentinel models (design §4; t3code
// packages/provider-pi/src/server/thinkingCapabilities.ts, MIT). Model ids
// are `provider/id` slugs from `get_available_models`; `default` means "the
// model Pi's settings.json picks" and is never sent. Pure and client-safe.

export const PI_DEFAULT_MODEL_ID = "default";

/** Pi's full thinking ladder, lowest first. */
export const PI_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type PiThinkingLevel = (typeof PI_THINKING_LEVELS)[number];

const LEVEL_LABELS: Record<PiThinkingLevel, string> = {
  high: "High",
  low: "Low",
  max: "Max",
  medium: "Medium",
  minimal: "Minimal",
  off: "Off",
  xhigh: "Extra high",
};

/** Sentinel's reasoning effort for a Pi level ("off" is "none"). */
export function effortFromPiLevel(level: PiThinkingLevel): ReasoningEffort {
  return level === "off" ? "none" : level;
}

export function piLevelFromEffort(
  effort: ReasoningEffort | null | undefined,
): PiThinkingLevel | null {
  if (!effort) {
    return null;
  }
  return effort === "none" ? "off" : effort;
}

export function isPiThinkingLevel(value: unknown): value is PiThinkingLevel {
  return (
    typeof value === "string" &&
    (PI_THINKING_LEVELS as readonly string[]).includes(value)
  );
}

/**
 * Mirror of pi-ai's getSupportedThinkingLevels: a reasoning model offers
 * off through high unless its `thinkingLevelMap` maps a level to null;
 * xhigh and max only when the map names them.
 */
export function supportedPiThinkingLevels(model: unknown): PiThinkingLevel[] {
  if (readBoolean(model, "reasoning") !== true) {
    return [];
  }
  const map = asRecord(asRecord(model)?.thinkingLevelMap);
  return PI_THINKING_LEVELS.filter((level) => {
    const mapped = map?.[level];
    if (mapped === null) {
      return false;
    }
    return level === "xhigh" || level === "max" ? mapped !== undefined : true;
  });
}

/** Mirror of pi-ai's clampThinkingLevel: exact, else the next higher, else lower. */
export function clampPiThinkingLevel(
  requested: PiThinkingLevel,
  available: readonly PiThinkingLevel[],
): PiThinkingLevel | null {
  if (available.length === 0) {
    return null;
  }
  if (available.includes(requested)) {
    return requested;
  }
  const index = PI_THINKING_LEVELS.indexOf(requested);
  for (let next = index + 1; next < PI_THINKING_LEVELS.length; next += 1) {
    if (available.includes(PI_THINKING_LEVELS[next]!)) {
      return PI_THINKING_LEVELS[next]!;
    }
  }
  for (let next = index - 1; next >= 0; next -= 1) {
    if (available.includes(PI_THINKING_LEVELS[next]!)) {
      return PI_THINKING_LEVELS[next]!;
    }
  }
  return available[0] ?? null;
}

/** `provider/id` of a Pi model object (null when it has neither). */
export function piModelSlug(model: unknown) {
  const provider = readString(model, "provider");
  const id = readString(model, "id");
  return provider && id ? `${provider}/${id}` : null;
}

/** A slug split at its first slash (model ids may contain more). */
export function parsePiModelSlug(slug: string | null | undefined) {
  if (!slug || slug === PI_DEFAULT_MODEL_ID) {
    return null;
  }
  const index = slug.indexOf("/");
  if (index <= 0 || index === slug.length - 1) {
    return null;
  }
  return { modelId: slug.slice(index + 1), provider: slug.slice(0, index) };
}

function reasoningDescriptor(
  levels: readonly PiThinkingLevel[],
  current: unknown,
): EngineOptionDescriptor | null {
  if (levels.length === 0) {
    return null;
  }
  const preferred = isPiThinkingLevel(current)
    ? clampPiThinkingLevel(current, levels)
    : null;
  return {
    choices: levels.map((level) => ({
      id: effortFromPiLevel(level),
      label: LEVEL_LABELS[level],
      ...(level === preferred ? { isDefault: true } : {}),
    })),
    id: REASONING_OPTION_ID,
    label: "Thinking",
    role: "reasoning",
    type: "select",
  };
}

/** The models `get_available_models` lists. */
export function readPiModels(data: unknown): unknown[] {
  return (readArray(data, "models") ?? []).filter(
    (model) => piModelSlug(model) !== null,
  );
}

/**
 * Sentinel models for what Pi lists: "Pi default" first (the model Pi's
 * own settings pick, `current` when Pi reported it), then every
 * `provider/id`.
 */
export function toPiEngineModels(input: {
  current?: unknown;
  models: readonly unknown[];
  thinkingLevel?: unknown;
}): EngineModel[] {
  const seen = new Set<string>();
  const models: EngineModel[] = [];
  const currentSlug = piModelSlug(input.current);
  const currentModel =
    input.models.find((model) => piModelSlug(model) === currentSlug) ??
    input.current;

  if (input.models.length > 0) {
    const currentName = readString(currentModel, "name");
    const reasoning = reasoningDescriptor(
      supportedPiThinkingLevels(currentModel),
      input.thinkingLevel,
    );
    models.push({
      ...(currentSlug
        ? {
            description: `Pi's configured model (${currentName ?? currentSlug}).`,
          }
        : { description: "The model Pi's settings pick." }),
      id: PI_DEFAULT_MODEL_ID,
      inputModalities: modalitiesOf(currentModel),
      isCustom: false,
      isDefault: true,
      name: "Pi default",
      options: reasoning ? [reasoning] : [],
      source: "live",
    });
  }

  for (const model of input.models) {
    const slug = piModelSlug(model);
    if (!slug || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    const reasoning = reasoningDescriptor(
      supportedPiThinkingLevels(model),
      slug === currentSlug ? input.thinkingLevel : "medium",
    );
    const contextWindow = readNumber(model, "contextWindow");
    models.push({
      ...(contextWindow && contextWindow > 0
        ? { contextWindow: Math.trunc(contextWindow) }
        : {}),
      id: slug,
      inputModalities: modalitiesOf(model),
      isCustom: false,
      name: readString(model, "name") ?? slug,
      options: reasoning ? [reasoning] : [],
      source: "live",
      subProvider: readString(model, "provider") ?? undefined,
    });
  }
  return models;
}

function modalitiesOf(model: unknown): EngineModel["inputModalities"] {
  const input = readArray(model, "input");
  return input?.includes("image") ? ["text", "image"] : ["text"];
}
