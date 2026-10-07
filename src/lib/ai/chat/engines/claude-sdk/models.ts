import type { EffortLevel, ModelInfo } from "@anthropic-ai/claude-agent-sdk";

import type { ReasoningEffort } from "@/lib/ai/providers/models";

// Claude Code model metadata the CLI does not report itself. Context windows
// and default efforts follow t3code's model manifest
// (apps/server/src/provider/model-manifest.json, 2026-10-02, MIT): a bare id
// runs at 200k, the `[1m]` suffix selects the 1M window where offered, and
// Opus 4.7/4.8 always run at 1M.

export type ClaudeModelInfo = {
  contextWindow?: number;
  defaultReasoningEffort: ReasoningEffort;
  description: string;
  displayName: string;
  id: string;
  inputModalities: string[];
  isDefault: boolean;
  model: string;
  supportedReasoningEfforts: Array<{
    description: string;
    effort: ReasoningEffort;
    label: string;
  }>;
};

type ClaudeModelProfile = {
  contextWindow: number;
  defaultEffort?: ClaudeSentinelEffort;
};

const CLAUDE_1M_CONTEXT_SUFFIX = "[1m]";
const CLAUDE_1M_CONTEXT_WINDOW = 1_000_000;
const CLAUDE_STANDARD_CONTEXT_WINDOW = 200_000;

const CLAUDE_MODEL_PROFILES: Record<string, ClaudeModelProfile> = {
  "claude-opus-5-5": { contextWindow: 200_000, defaultEffort: "medium" },
  "claude-sonnet-5-5": { contextWindow: 200_000, defaultEffort: "high" },
  "claude-fable-5-1": { contextWindow: 200_000, defaultEffort: "medium" },
  "claude-fable-5": { contextWindow: 200_000, defaultEffort: "medium" },
  "claude-opus-5": { contextWindow: 200_000, defaultEffort: "high" },
  "claude-sonnet-5": { contextWindow: 200_000, defaultEffort: "high" },
  "claude-opus-4-8": { contextWindow: 1_000_000, defaultEffort: "high" },
  "claude-opus-4-7": { contextWindow: 1_000_000, defaultEffort: "xhigh" },
  "claude-opus-4-6": { contextWindow: 200_000, defaultEffort: "high" },
  "claude-sonnet-4-6": { contextWindow: 200_000, defaultEffort: "high" },
  "claude-opus-4-5": { contextWindow: 200_000, defaultEffort: "high" },
  "claude-haiku-4-5": { contextWindow: 200_000 },
  "claude-haiku-4-5-20251001": { contextWindow: 200_000 },
  "claude-sonnet-4-5": { contextWindow: 200_000 },
  "claude-sonnet-4-5-20250929": { contextWindow: 200_000 },
  "claude-opus-4-1": { contextWindow: 200_000 },
  "claude-opus-4-0": { contextWindow: 200_000 },
  "claude-sonnet-4-0": { contextWindow: 200_000 },
  "claude-4-sonnet-20250514": { contextWindow: 200_000 },
  "claude-3-7-sonnet-latest": { contextWindow: 200_000 },
  "claude-3-7-sonnet-20250219": { contextWindow: 200_000 },
  "claude-3-5-sonnet-20241022": { contextWindow: 200_000 },
  "claude-3-5-haiku-latest": { contextWindow: 200_000 },
  "claude-3-5-haiku-20241022": { contextWindow: 200_000 },
};

// Claude effort levels Sentinel offers. ReasoningEffort carries `max` since
// the engine platform widened it, but Claude keeps today's options until the
// composer moves to per-model option descriptors.
const CLAUDE_SENTINEL_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
type ClaudeSentinelEffort = (typeof CLAUDE_SENTINEL_EFFORTS)[number];

// Every level the SDK accepts, lowest first.
const CLAUDE_SDK_EFFORT_ORDER: readonly EffortLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

const CLAUDE_EFFORT_LABELS: Record<ClaudeSentinelEffort, string> = {
  high: "High",
  low: "Low",
  medium: "Medium",
  xhigh: "Extra high",
};

// Effort levels the CLI assumed before ModelInfo carried supportedEffortLevels.
const CLAUDE_LEGACY_EFFORTS: readonly ClaudeSentinelEffort[] = [
  "low",
  "medium",
  "high",
];

function normalizeClaudeModelKey(modelId: string) {
  return modelId.trim().toLowerCase();
}

function stripClaudeContextSuffix(modelId: string) {
  return modelId.endsWith(CLAUDE_1M_CONTEXT_SUFFIX)
    ? modelId.slice(0, -CLAUDE_1M_CONTEXT_SUFFIX.length)
    : modelId;
}

function getClaudeModelKeys(model: Pick<ModelInfo, "resolvedModel" | "value">) {
  return [model.value, model.resolvedModel]
    .filter((value): value is string => typeof value === "string")
    .map(normalizeClaudeModelKey)
    .filter(Boolean);
}

function findClaudeModelProfile(keys: string[]) {
  for (const key of keys) {
    const profile = CLAUDE_MODEL_PROFILES[stripClaudeContextSuffix(key)];
    if (profile) {
      return profile;
    }
  }

  return null;
}

export function resolveClaudeContextWindow(
  model: Pick<ModelInfo, "resolvedModel" | "value">,
) {
  const keys = getClaudeModelKeys(model);
  if (keys.some((key) => key.endsWith(CLAUDE_1M_CONTEXT_SUFFIX))) {
    return CLAUDE_1M_CONTEXT_WINDOW;
  }

  return findClaudeModelProfile(keys)?.contextWindow;
}

function buildClaudeEffortOption(
  displayName: string,
  effort: ClaudeSentinelEffort,
) {
  return {
    description: `${displayName} supports ${CLAUDE_EFFORT_LABELS[effort].toLowerCase()} reasoning effort.`,
    effort,
    label: CLAUDE_EFFORT_LABELS[effort],
  };
}

export function normalizeClaudeReasoningEfforts(
  model: Pick<
    ModelInfo,
    "displayName" | "supportedEffortLevels" | "supportsEffort"
  >,
) {
  const levels: readonly string[] =
    model.supportedEffortLevels ??
    (model.supportsEffort === false ? [] : CLAUDE_LEGACY_EFFORTS);

  return CLAUDE_SENTINEL_EFFORTS.filter((effort) =>
    levels.includes(effort),
  ).map((effort) => buildClaudeEffortOption(model.displayName, effort));
}

function resolveClaudeDefaultEffort(
  keys: string[],
  supported: readonly ReasoningEffort[],
): ReasoningEffort {
  const profileDefault = findClaudeModelProfile(keys)?.defaultEffort;
  for (const candidate of [profileDefault, "high", "medium"] as const) {
    if (candidate && supported.includes(candidate)) {
      return candidate;
    }
  }

  return supported[0] ?? "medium";
}

export function toClaudeModelInfo(model: ModelInfo): ClaudeModelInfo {
  const supportedReasoningEfforts = normalizeClaudeReasoningEfforts(model);
  const keys = getClaudeModelKeys(model);

  return {
    contextWindow: resolveClaudeContextWindow(model),
    defaultReasoningEffort: resolveClaudeDefaultEffort(
      keys,
      supportedReasoningEfforts.map((option) => option.effort),
    ),
    description: model.description,
    displayName: model.displayName,
    id: model.value,
    inputModalities: model.description.toLowerCase().includes("vision")
      ? ["text", "image"]
      : ["text"],
    isDefault: false,
    model: model.value,
    supportedReasoningEfforts,
  };
}

const CLAUDE_DEFAULT_FALLBACK_MODEL_ID = "claude-fable-5-1";
const CLAUDE_FALLBACK_MODELS: Array<
  Pick<ModelInfo, "description" | "displayName" | "value"> & {
    efforts: readonly ClaudeSentinelEffort[];
  }
> = [
  {
    description: "Most capable Claude model for complex, long-running work.",
    displayName: "Claude Opus 5.5",
    efforts: ["low", "medium", "high", "xhigh"],
    value: "claude-opus-5-5",
  },
  {
    description: "Fast, capable Claude model for everyday coding.",
    displayName: "Claude Sonnet 5.5",
    efforts: ["low", "medium", "high", "xhigh"],
    value: "claude-sonnet-5-5",
  },
  {
    description: "Claude Code's default model for coding tasks.",
    displayName: "Claude Fable 5.1",
    efforts: ["low", "medium", "high", "xhigh"],
    value: "claude-fable-5-1",
  },
  {
    description: "Fastest Claude model for quick, lightweight tasks.",
    displayName: "Claude Haiku 4.5",
    efforts: [],
    value: "claude-haiku-4-5",
  },
];

/**
 * Models offered while Claude Code is installed but its live model list has
 * not been read yet (probe timed out with no snapshot).
 */
export function buildClaudeFallbackModels(): ClaudeModelInfo[] {
  return CLAUDE_FALLBACK_MODELS.map((model) => {
    const supportedReasoningEfforts = model.efforts.map((effort) =>
      buildClaudeEffortOption(model.displayName, effort),
    );

    return {
      contextWindow:
        CLAUDE_MODEL_PROFILES[model.value]?.contextWindow ??
        CLAUDE_STANDARD_CONTEXT_WINDOW,
      defaultReasoningEffort: resolveClaudeDefaultEffort(
        [model.value],
        model.efforts,
      ),
      description: model.description,
      displayName: model.displayName,
      id: model.value,
      inputModalities: ["text", "image"],
      isDefault: model.value === CLAUDE_DEFAULT_FALLBACK_MODEL_ID,
      model: model.value,
      supportedReasoningEfforts,
    };
  });
}

function toClaudeSdkEffort(effort: ReasoningEffort): EffortLevel {
  switch (effort) {
    case "none":
    case "minimal":
      return "low";
    default:
      return effort;
  }
}

/**
 * The `effort` to send for a run, or undefined to leave the CLI default.
 * Known models clamp to their highest supported level at or below the
 * request; unknown models (or no model list yet) pass the level through and
 * let the CLI fall back.
 */
export function resolveClaudeSdkEffort(input: {
  modelId: string | null;
  models: readonly ClaudeModelInfo[] | null;
  reasoningEffort: ReasoningEffort | null | undefined;
}): EffortLevel | undefined {
  if (!input.reasoningEffort) {
    return undefined;
  }

  const requested = toClaudeSdkEffort(input.reasoningEffort);
  const model = input.modelId
    ? input.models?.find(
        (candidate) =>
          candidate.id === input.modelId || candidate.model === input.modelId,
      )
    : undefined;
  if (!model) {
    return requested;
  }

  const supported = new Set<string>(
    model.supportedReasoningEfforts.map((option) => option.effort),
  );
  if (supported.size === 0) {
    return undefined;
  }

  const requestedIndex = CLAUDE_SDK_EFFORT_ORDER.indexOf(requested);
  for (let index = requestedIndex; index >= 0; index -= 1) {
    const candidate = CLAUDE_SDK_EFFORT_ORDER[index]!;
    if (supported.has(candidate)) {
      return candidate;
    }
  }

  return CLAUDE_SDK_EFFORT_ORDER.find((candidate) => supported.has(candidate));
}
