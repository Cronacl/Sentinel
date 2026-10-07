import type { ReasoningEffort } from "@/lib/ai/providers/models";

import {
  computeEngineSnapshotUsable,
  engineModelInputModalitySchema,
  type EngineAuthSummary,
  type EngineCompatibilityAdvisory,
  type EngineInstallSource,
  type EngineModel,
  type EngineModelInputModality,
  type EngineOptionDescriptor,
  type EngineProbeResult,
} from "../contract";

// Adapters from the status objects the engines reported before the platform
// (get<X>EngineStatus) to the driver contract's probe result. They only
// translate: what an engine reports, and when it counts as available, does
// not change. Each engine's own availability predicate (isXEngineAvailable)
// is passed in as `available`, so a status the engine did not consider
// available is never usable, whatever the state table below says. The one
// deliberate change (driver-contract.md §2.2): a runtime that is not
// installed is never usable, which retires Codex treating a timeout without
// a CLI as available.

export type LegacyEngineState =
  | "auth_unavailable"
  | "error"
  | "missing_binary"
  | "missing_cli"
  | "missing_runtime"
  | "ready"
  | "timeout_no_cache"
  | "timeout_using_cache";

export type LegacyTraitOption = {
  isDefault?: boolean;
  label: string;
  value: string;
};

export type LegacyModelInfo = {
  contextWindow?: number;
  defaultReasoningEffort: ReasoningEffort | null;
  description: string;
  displayName: string;
  id: string;
  inputModalities: string[];
  isDefault: boolean;
  model: string;
  openCode?: {
    agentOptions: LegacyTraitOption[];
    variantOptions: LegacyTraitOption[];
  };
  supportedReasoningEfforts: ReadonlyArray<{
    description: string;
    effort: ReasoningEffort;
    label: string;
  }>;
};

export type LegacyStatus = {
  /** The account details the engine reported, already mapped. */
  account: Pick<EngineAuthSummary, "email" | "label" | "method" | "plan">;
  authReady: boolean;
  compatibilityAdvisory?: EngineCompatibilityAdvisory | null;
  error: string | null;
  installed: boolean;
  models: readonly LegacyModelInfo[];
  path: string | null;
  source: EngineInstallSource | null;
  state: LegacyEngineState;
  version: string | null;
};

export type FromLegacyStatusOptions = {
  /**
   * The engine's own verdict (its isXEngineAvailable on the raw status).
   * False turns a result that would otherwise be usable into an error, so
   * snapshots keep the availability the engine reported before the platform.
   */
  available?: boolean;
  canLogin?: boolean;
  canLogout?: boolean;
  /**
   * Models to offer when the runtime is installed but timed out before it
   * reported any (and the engine allows it: Copilot also needs auth).
   */
  fallbackModels?: (status: LegacyStatus) => readonly LegacyModelInfo[] | null;
};

const REASONING_OPTION_ID = "effort";

function toInputModalities(values: readonly string[]) {
  const modalities = values.filter(
    (value): value is EngineModelInputModality =>
      engineModelInputModalitySchema.safeParse(value).success,
  );
  return modalities.length > 0 ? [...new Set(modalities)] : ["text" as const];
}

function toTraitDescriptor(
  id: "agent" | "variant",
  label: string,
  options: readonly LegacyTraitOption[],
): EngineOptionDescriptor | null {
  if (options.length === 0) {
    return null;
  }

  return {
    choices: options.map((option) => ({
      id: option.value,
      label: option.label,
      ...(option.isDefault ? { isDefault: true } : {}),
    })),
    id,
    label,
    role: id,
    type: "select",
  };
}

/** One legacy model as an EngineModel (reasoning and OpenCode traits as options). */
export function toEngineModel(model: LegacyModelInfo): EngineModel {
  const options: EngineOptionDescriptor[] = [];

  if (model.supportedReasoningEfforts.length > 0) {
    options.push({
      choices: model.supportedReasoningEfforts.map((option) => ({
        description: option.description,
        id: option.effort,
        label: option.label,
        ...(option.effort === model.defaultReasoningEffort
          ? { isDefault: true }
          : {}),
      })),
      id: REASONING_OPTION_ID,
      label: "Reasoning effort",
      role: "reasoning",
      type: "select",
    });
  }

  if (model.openCode) {
    for (const descriptor of [
      toTraitDescriptor("agent", "Agent", model.openCode.agentOptions),
      toTraitDescriptor("variant", "Variant", model.openCode.variantOptions),
    ]) {
      if (descriptor) {
        options.push(descriptor);
      }
    }
  }

  return {
    ...(typeof model.contextWindow === "number" &&
    Number.isInteger(model.contextWindow) &&
    model.contextWindow > 0
      ? { contextWindow: model.contextWindow }
      : {}),
    description: model.description,
    id: model.id,
    inputModalities: toInputModalities(model.inputModalities),
    isCustom: false,
    ...(model.isDefault ? { isDefault: true } : {}),
    name: model.displayName,
    options,
    ...(model.model && model.model !== model.id
      ? { runtimeId: model.model }
      : {}),
    source: "live",
  };
}

function toEngineModels(models: readonly LegacyModelInfo[]) {
  const seen = new Set<string>();
  const result: EngineModel[] = [];
  for (const model of models) {
    if (!model.id || seen.has(model.id)) {
      continue;
    }
    seen.add(model.id);
    result.push(toEngineModel(model));
  }
  return result;
}

function isMissingState(state: LegacyEngineState) {
  return (
    state === "missing_binary" ||
    state === "missing_cli" ||
    state === "missing_runtime"
  );
}

/**
 * Legacy state → probe result:
 *   ready               → ready
 *   timeout_using_cache → ready, stale
 *   timeout_no_cache    → warning, stale (fallback models when allowed)
 *   auth_unavailable    → warning, unauthenticated
 *   missing_*           → error, not installed
 *   error               → error
 * and then error whenever the engine's own predicate (`available: false`)
 * says it cannot be used (Cursor and Copilot timeouts without auth or
 * models, for example).
 */
export function fromLegacyStatus(
  status: LegacyStatus,
  options: FromLegacyStatusOptions = {},
): EngineProbeResult {
  const missing = isMissingState(status.state);
  const installed = status.installed && !missing;

  let probeStatus: EngineProbeResult["status"];
  switch (status.state) {
    case "ready":
    case "timeout_using_cache":
      probeStatus = "ready";
      break;
    case "timeout_no_cache":
    case "auth_unavailable":
      probeStatus = "warning";
      break;
    default:
      probeStatus = "error";
  }

  const authStatus: EngineAuthSummary["status"] =
    status.state === "auth_unavailable"
      ? "unauthenticated"
      : status.authReady &&
          (status.state === "ready" || status.state === "timeout_using_cache")
        ? "authenticated"
        : "unknown";

  const fallback =
    status.state === "timeout_no_cache" &&
    installed &&
    status.models.length === 0
      ? (options.fallbackModels?.(status) ?? null)
      : null;
  const models = toEngineModels(fallback ?? status.models);

  const result: EngineProbeResult = {
    auth: {
      canLogin: options.canLogin ?? false,
      canLogout: options.canLogout ?? false,
      email: status.account.email,
      label: status.account.label,
      method: status.account.method,
      plan: status.account.plan,
      status: authStatus,
    },
    ...(status.compatibilityAdvisory
      ? { compatibilityAdvisory: status.compatibilityAdvisory }
      : {}),
    defaultModelId: models.find((model) => model.isDefault)?.id ?? null,
    install: {
      installed,
      path: status.path,
      source: installed ? status.source : null,
      version: installed ? status.version : null,
    },
    ...(status.error ? { message: status.error } : {}),
    models,
    // Only timeouts are stale: engines also answer from their last-known-good
    // snapshot while a background refresh runs, which is current enough.
    stale:
      status.state === "timeout_using_cache" ||
      status.state === "timeout_no_cache",
    status: probeStatus,
  };

  if (
    options.available === false &&
    computeEngineSnapshotUsable({
      ...result,
      availability: "available",
      compatibilityAdvisory: result.compatibilityAdvisory ?? null,
      enabled: true,
    })
  ) {
    result.status = "error";
  }

  return result;
}

export const NO_LEGACY_ACCOUNT: LegacyStatus["account"] = {
  email: null,
  label: null,
  method: null,
  plan: null,
};
