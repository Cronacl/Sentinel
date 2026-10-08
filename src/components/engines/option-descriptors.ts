import type {
  EngineOptionDescriptor,
  EngineOptionSelection,
  EnginePlanModeSupport,
  EngineSelectOptionDescriptor,
} from "@/lib/ai/chat/engines/contract";

// Generic handling of a model's option descriptors in the composer: which
// select options get their own picker, which value each holds, how plan
// mode maps onto options for drivers that switch to planning by picking an
// option ("agent-select", OpenCode's plan agent), and the selections a turn
// carries. Replaces the OpenCode-specific "traits" helpers.

export type OptionChoiceLike = {
  isDefault?: boolean;
  label: string;
  value: string;
};

/** A selection per option id; null means the option's default. */
export type ComposerOptionValues = Record<string, string | null>;

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function matchesAny(
  option: { label: string; value: string },
  tokens: string[],
) {
  const label = normalizeToken(option.label);
  const value = normalizeToken(option.value);
  return tokens.some((token) => label.includes(token) || value.includes(token));
}

const PLAN_TOKENS = ["plan", "max"];
const BUILD_TOKENS = [
  "build",
  "chat",
  "default",
  "medium",
  "high",
  "implement",
];

/** A choice that means "plan" (or the deepest effort) for agent-select drivers. */
export function isPlanChoice(option: { label: string; value: string }) {
  return matchesAny(option, PLAN_TOKENS);
}

/** A choice that means "act" (build, default effort) for agent-select drivers. */
export function isBuildChoice(option: { label: string; value: string }) {
  return matchesAny(option, BUILD_TOKENS);
}

/** A descriptor's choices in the picker shape. */
export function toOptionChoices(
  descriptor: Pick<EngineSelectOptionDescriptor, "choices">,
): OptionChoiceLike[] {
  return descriptor.choices.map((choice) => ({
    ...(choice.isDefault ? { isDefault: true } : {}),
    label: choice.label,
    value: choice.id,
  }));
}

/**
 * Select options that get their own composer picker: everything but the
 * reasoning effort, which has a dedicated control.
 */
export function getComposerSelectOptions(
  options: readonly EngineOptionDescriptor[] | undefined,
): EngineSelectOptionDescriptor[] {
  return (options ?? []).filter(
    (option): option is EngineSelectOptionDescriptor =>
      option.type === "select" &&
      option.role !== "reasoning" &&
      option.choices.length > 0,
  );
}

/**
 * Whether a picker is redundant because its choices only mirror the plan
 * toggle (a plan/build pair): the toggle drives it instead.
 */
export function isModeMappingOption(
  choices: readonly OptionChoiceLike[] | undefined,
) {
  if (!choices || choices.length < 2) {
    return false;
  }

  return (
    choices.some(isPlanChoice) &&
    choices.some(isBuildChoice) &&
    choices.every((choice) => isPlanChoice(choice) || isBuildChoice(choice))
  );
}

/** Whether plan mode is applied by picking option values for this driver. */
export function mapsPlanModeToOptions(
  supportsPlanMode: EnginePlanModeSupport | null | undefined,
) {
  return supportsPlanMode === "agent-select";
}

/**
 * The value an option takes for the thread mode on an agent-select
 * driver: a plan-like choice in plan mode, the current or a build-like
 * choice otherwise.
 */
export function resolveOptionValueForThreadMode(
  choices: readonly OptionChoiceLike[] | undefined,
  currentValue: string | null | undefined,
  threadMode: "chat" | "plan",
) {
  if (!choices || choices.length === 0) {
    return null;
  }

  const currentChoice = currentValue
    ? (choices.find((choice) => choice.value === currentValue) ?? null)
    : null;
  const fallbackChoice =
    choices.find((choice) => choice.isDefault) ?? choices[0] ?? null;

  if (threadMode === "plan") {
    return (
      choices.find(isPlanChoice)?.value ??
      currentChoice?.value ??
      fallbackChoice?.value ??
      null
    );
  }

  if (currentChoice && !isPlanChoice(currentChoice)) {
    return currentChoice.value;
  }

  return choices.find(isBuildChoice)?.value ?? fallbackChoice?.value ?? null;
}

export function getDefaultOptionValue(
  choices: ReadonlyArray<{ isDefault?: boolean; value: string }> | undefined,
) {
  if (!choices || choices.length === 0) {
    return null;
  }

  return (
    choices.find((choice) => choice.isDefault)?.value ??
    choices[0]?.value ??
    null
  );
}

/**
 * The value an option holds: the current one while it is still offered,
 * else the preferred one (a handoff or the thread's stored selection), else
 * the option's default.
 */
export function resolveOptionSelectionValue(
  choices: ReadonlyArray<{ isDefault?: boolean; value: string }> | undefined,
  currentValue: string | null,
  preferredValue: string | null,
) {
  if (!choices || choices.length === 0) {
    return null;
  }

  if (currentValue && choices.some((choice) => choice.value === currentValue)) {
    return currentValue;
  }

  if (
    preferredValue &&
    choices.some((choice) => choice.value === preferredValue)
  ) {
    return preferredValue;
  }

  return getDefaultOptionValue(choices);
}

/** The selections a turn carries for the model's composer options. */
export function toModelOptionSelections(
  values: ComposerOptionValues,
  options: readonly EngineSelectOptionDescriptor[],
): EngineOptionSelection[] {
  return options.flatMap((option) => {
    const value = values[option.id];
    return value ? [{ id: option.id, value }] : [];
  });
}

/** Composer values from stored selections (string values only). */
export function toComposerOptionValues(
  selections: readonly EngineOptionSelection[] | null | undefined,
): ComposerOptionValues {
  return Object.fromEntries(
    (selections ?? []).flatMap((selection) =>
      typeof selection.value === "string"
        ? [[selection.id, selection.value]]
        : [],
    ),
  );
}
