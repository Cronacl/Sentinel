// Client-safe helpers for a model's option selections (EngineOptionSelection):
// what the composer sends with a turn, what follow-ups and automations store
// (model_options), and how they map onto the request fields the runtimes
// written before option descriptors read (`reasoningEffort`, `openCode`).
import {
  REASONING_EFFORTS,
  type ReasoningEffort,
} from "@/lib/ai/providers/models";

import {
  engineOptionSelectionSchema,
  type EngineOptionSelection,
} from "./contract/models";

/** Descriptor ids the legacy adapters use (drivers/legacy-status.ts). */
export const REASONING_OPTION_ID = "effort";
export const AGENT_OPTION_ID = "agent";
export const VARIANT_OPTION_ID = "variant";

export const MAX_ENGINE_OPTION_SELECTIONS = 32;

export type LegacyModelRequestOptions = {
  openCode?: { agent?: string; variant?: string };
  reasoningEffort?: ReasoningEffort;
};

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    typeof value === "string" &&
    (REASONING_EFFORTS as readonly string[]).includes(value)
  );
}

/**
 * Valid selections from untrusted input (a request body, a stored JSON
 * column): malformed entries are dropped, the last value per id wins, and
 * the list is capped. Null when nothing valid is left.
 */
export function parseEngineOptionSelections(
  value: unknown,
): EngineOptionSelection[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const byId = new Map<string, EngineOptionSelection>();
  for (const entry of value) {
    const parsed = engineOptionSelectionSchema.safeParse(entry);
    if (!parsed.success) {
      continue;
    }
    const id = parsed.data.id.trim();
    const selected =
      typeof parsed.data.value === "string"
        ? parsed.data.value.trim()
        : parsed.data.value;
    if (!id || id.length > 64 || selected === "") {
      continue;
    }
    if (typeof selected === "string" && selected.length > 256) {
      continue;
    }
    byId.delete(id);
    byId.set(id, { id, value: selected });
  }

  const selections = [...byId.values()].slice(-MAX_ENGINE_OPTION_SELECTIONS);
  return selections.length > 0 ? selections : null;
}

export function getEngineOptionValue(
  selections: readonly EngineOptionSelection[] | null | undefined,
  id: string,
) {
  return selections?.find((selection) => selection.id === id)?.value;
}

/**
 * Sets (or with null/undefined removes) one selection, keeping the others in
 * order.
 */
export function withEngineOptionValue(
  selections: readonly EngineOptionSelection[] | null | undefined,
  id: string,
  value: string | boolean | null | undefined,
): EngineOptionSelection[] {
  const rest = (selections ?? []).filter((selection) => selection.id !== id);
  return value === null || value === undefined || value === ""
    ? rest
    : [...rest, { id, value }];
}

/**
 * The selections a request carries: explicit `modelOptions`, completed with
 * the legacy fields (reasoningEffort, openCode agent/variant) when the
 * selections do not name them. Null when there is nothing to carry.
 */
export function buildEngineOptionSelections(input: {
  modelOptions?: readonly EngineOptionSelection[] | null;
  openCode?: { agent?: string | null; variant?: string | null } | null;
  reasoningEffort?: string | null;
}): EngineOptionSelection[] | null {
  let selections = [...(input.modelOptions ?? [])];
  const fill = (id: string, value: string | null | undefined) => {
    if (value && getEngineOptionValue(selections, id) === undefined) {
      selections = withEngineOptionValue(selections, id, value);
    }
  };

  fill(REASONING_OPTION_ID, input.reasoningEffort);
  fill(AGENT_OPTION_ID, input.openCode?.agent);
  fill(VARIANT_OPTION_ID, input.openCode?.variant);

  return selections.length > 0 ? selections : null;
}

/**
 * The legacy request fields for the runtimes that read them: the reasoning
 * selection as `reasoningEffort`, the agent and variant selections as
 * `openCode`.
 */
export function legacyRequestOptionsFromSelections(
  selections: readonly EngineOptionSelection[] | null | undefined,
): LegacyModelRequestOptions {
  const effort = getEngineOptionValue(selections, REASONING_OPTION_ID);
  const agent = getEngineOptionValue(selections, AGENT_OPTION_ID);
  const variant = getEngineOptionValue(selections, VARIANT_OPTION_ID);
  const openCode = {
    ...(typeof agent === "string" && agent ? { agent } : {}),
    ...(typeof variant === "string" && variant ? { variant } : {}),
  };

  return {
    ...(Object.keys(openCode).length > 0 ? { openCode } : {}),
    ...(isReasoningEffort(effort) ? { reasoningEffort: effort } : {}),
  };
}
