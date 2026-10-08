// Client-safe logic behind Settings → Engines instance management: grouping
// instances by driver, what isolates an instance, and the drafts the add/edit
// dialog, the environment editor and the custom models editor work on.
// Pattern after t3code's AddProviderInstanceDialog, ProviderInstanceCard
// environment section and customModelEditor.logic (MIT).
import { getDriverMeta } from "@/lib/ai/chat/engines/catalog";
import {
  ENGINE_ACCENT_COLOR,
  ENGINE_ENV_VAR_NAME,
  ENGINE_MODEL_ID_PATTERN,
  MAX_ENGINE_CUSTOM_MODELS,
  MAX_ENGINE_ENV_VARS,
  type CreateEngineInstanceInput,
  type CustomEngineModel,
  type EngineEnvVarInput,
  type EngineInstanceSummary,
  type EngineModel,
  type EngineOptionDescriptor,
  type EngineSnapshot,
  type RedactedEngineEnvVar,
  type UpdateEngineInstanceInput,
} from "@/lib/ai/chat/engines/contract";

/** Accent colours offered for instances (any #rrggbb is accepted). */
export const ENGINE_ACCENT_PRESETS = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
] as const;

export function isEngineAccentColor(value: string) {
  return ENGINE_ACCENT_COLOR.test(value);
}

/** Drivers whose instances can be added from Settings → Engines. */
export function canAddEngineInstance(driver: string) {
  const meta = getDriverMeta(driver);
  return (
    meta?.status === "available" &&
    meta.runtime === "external" &&
    meta.multiInstance
  );
}

/** Whether the add/edit dialog offers a home directory for this driver. */
export function getDriverHomeEnvVar(driver: string) {
  return getDriverMeta(driver)?.homeEnvVar ?? null;
}

/**
 * What separates one instance of a driver from another. Drivers with a home
 * variable (CODEX_HOME, CLAUDE_CONFIG_DIR, COPILOT_HOME) isolate sign-in and
 * settings per home; the others (Cursor, OpenCode, Pi) always share the
 * CLI's own sign-in and differ only by environment and binary.
 */
export function getInstanceIsolationNote(driver: string) {
  const meta = getDriverMeta(driver);
  if (!meta) {
    return null;
  }
  return meta.homeEnvVar
    ? `Give an instance its own home directory (${meta.homeEnvVar}) to keep its sign-in and settings apart. Without one it shares ${meta.label}'s default home with your terminal.`
    : `${meta.label} instances share the CLI's sign-in and settings. They differ only by their environment variables (an API key, for example) and the binary they run.`;
}

/** Snapshots in driver groups, in the order the drivers first appear. */
export function groupEngineSnapshotsByDriver<
  S extends Pick<EngineSnapshot, "driver">,
>(snapshots: readonly S[]) {
  const groups = new Map<string, S[]>();
  for (const snapshot of snapshots) {
    const group = groups.get(snapshot.driver);
    if (group) {
      group.push(snapshot);
    } else {
      groups.set(snapshot.driver, [snapshot]);
    }
  }
  return [...groups].map(([driver, items]) => ({
    driver,
    label: getDriverMeta(driver)?.label ?? driver,
    snapshots: items,
  }));
}

/** "2 threads, 1 automation and your default engine", or null when unused. */
export function describeEngineInstanceReferences(references: {
  automations: number;
  threads: number;
  userDefault: boolean;
}) {
  const parts = [
    ...(references.threads > 0
      ? [`${references.threads} thread${references.threads === 1 ? "" : "s"}`]
      : []),
    ...(references.automations > 0
      ? [
          `${references.automations} automation${references.automations === 1 ? "" : "s"}`,
        ]
      : []),
    ...(references.userDefault ? ["your default engine"] : []),
  ];
  if (parts.length === 0) {
    return null;
  }
  return parts.length === 1
    ? parts[0]!
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export type InstanceChangeAction = "disable" | "remove" | "reset";

/** A change that needs confirming, with what still uses the instance. */
export type InstanceChangeConfirmation = {
  action: InstanceChangeAction;
  /** "2 threads and 1 automation"; null when nothing uses the instance. */
  inUseBy: string | null;
  summary: Pick<EngineInstanceSummary, "driver" | "id" | "label">;
  userDefault: boolean;
};

/** The confirmation's title and text (the G9 in-use guard, surfaced). */
export function describeInstanceChange(state: InstanceChangeConfirmation) {
  const { action, inUseBy, summary } = state;

  switch (action) {
    case "disable":
      return {
        body: inUseBy
          ? `${summary.label} is used by ${inUseBy}. Those threads and automations cannot run on it until you enable it again.`
          : `${summary.label} stops being offered until you enable it again.`,
        title: `Disable ${summary.label}?`,
      };
    case "reset":
      return {
        body: [
          "Its name, colour, binary path, home directory, environment variables and custom models go back to the defaults.",
          inUseBy
            ? `It is used by ${inUseBy}. Threads keep running on it; if its home directory changes, they start new sessions with their conversation sent along.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
        title: `Reset ${summary.label}?`,
      };
    case "remove":
      return {
        body: inUseBy
          ? [
              `${summary.label} is used by ${inUseBy}. Those threads and automations stop running until you start a new thread or pick another engine for them.`,
              state.userDefault
                ? `Your default engine moves to the default ${getDriverMeta(summary.driver)?.label ?? summary.driver} instance.`
                : null,
            ]
              .filter(Boolean)
              .join(" ")
          : "Its settings, environment variables and custom models are deleted.",
        title: `Remove ${summary.label}?`,
      };
  }
}

// --- Environment variables -------------------------------------------------

/** One row of the environment editor. */
export type EnvVarDraft = {
  key: string;
  name: string;
  /** The stored value no longer decrypts; it stays unset until re-entered. */
  needsReentry: boolean;
  sensitive: boolean;
  /** The stored value was sent back as a secret. */
  storedSecret: boolean;
  value: string;
  /** True while the row keeps the stored (redacted) value. */
  valueRedacted: boolean;
};

let nextDraftKey = 0;

export function newDraftKey(prefix: string) {
  nextDraftKey += 1;
  return `${prefix}-${nextDraftKey}`;
}

export function toEnvVarDrafts(
  environment: readonly RedactedEngineEnvVar[],
): EnvVarDraft[] {
  return environment.map((variable) => ({
    key: newDraftKey("env"),
    name: variable.name,
    needsReentry: variable.needsReentry,
    sensitive: variable.sensitive,
    storedSecret: variable.valueRedacted,
    value: variable.valueRedacted ? "" : variable.value,
    valueRedacted: variable.valueRedacted,
  }));
}

export function emptyEnvVarDraft(): EnvVarDraft {
  return {
    key: newDraftKey("env"),
    name: "",
    needsReentry: false,
    sensitive: true,
    storedSecret: false,
    value: "",
    valueRedacted: false,
  };
}

/** A row edit: typing a value replaces a stored secret. */
export function updateEnvVarDraft(
  draft: EnvVarDraft,
  patch: Partial<Pick<EnvVarDraft, "name" | "sensitive" | "value">>,
): EnvVarDraft {
  return {
    ...draft,
    ...patch,
    ...(patch.value !== undefined ? { valueRedacted: false } : {}),
  };
}

function isBlankEnvVarDraft(draft: EnvVarDraft) {
  return !draft.name.trim() && !draft.value && !draft.valueRedacted;
}

/**
 * The environment the server stores, or the first problem with the rows.
 * Blank rows are dropped. A stored secret is kept by echoing it back
 * redacted; turning it into a plain variable takes a new value (the server
 * refuses to reveal it).
 */
export function toEnvVarInputs(
  drafts: readonly EnvVarDraft[],
): { error: string } | { environment: EngineEnvVarInput[] } {
  const environment: EngineEnvVarInput[] = [];
  const seen = new Set<string>();

  for (const draft of drafts) {
    if (isBlankEnvVarDraft(draft)) {
      continue;
    }
    const name = draft.name.trim();
    if (!name) {
      return { error: "Name every environment variable or remove its row." };
    }
    if (!ENGINE_ENV_VAR_NAME.test(name)) {
      return {
        error: `${name} is not a valid variable name (letters, digits and _, not starting with a digit).`,
      };
    }
    if (seen.has(name)) {
      return { error: `${name} is listed twice.` };
    }
    seen.add(name);
    if (draft.valueRedacted && draft.storedSecret && !draft.sensitive) {
      return {
        error: `Enter a new value for ${name} to store it as a plain variable.`,
      };
    }
    environment.push(
      draft.valueRedacted
        ? { name, sensitive: draft.sensitive, value: "", valueRedacted: true }
        : { name, sensitive: draft.sensitive, value: draft.value },
    );
  }

  if (environment.length > MAX_ENGINE_ENV_VARS) {
    return {
      error: `At most ${MAX_ENGINE_ENV_VARS} environment variables are allowed.`,
    };
  }
  return { environment };
}

// --- Add / edit an instance ------------------------------------------------

export type InstanceFormDraft = {
  accentColor: string | null;
  binaryPath: string;
  environment: EnvVarDraft[];
  homePath: string;
  label: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function configString(config: unknown, key: string) {
  const value = asRecord(config)[key];
  return typeof value === "string" ? value : "";
}

export function emptyInstanceFormDraft(): InstanceFormDraft {
  return {
    accentColor: null,
    binaryPath: "",
    environment: [],
    homePath: "",
    label: "",
  };
}

export function draftFromSummary(
  summary: Pick<
    EngineInstanceSummary,
    "accentColor" | "config" | "environment" | "label"
  >,
): InstanceFormDraft {
  return {
    accentColor: summary.accentColor,
    binaryPath: configString(summary.config, "binaryPath"),
    environment: toEnvVarDrafts(summary.environment),
    homePath: configString(summary.config, "homePath"),
    label: summary.label,
  };
}

function isAbsoluteLike(value: string) {
  return (
    value.startsWith("/") ||
    value === "~" ||
    value.startsWith("~/") ||
    value.startsWith("~\\") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("\\\\")
  );
}

/** The first problem with the dialog's fields, or null. */
export function validateInstanceFormDraft(
  draft: InstanceFormDraft,
  driver: string,
) {
  const label = draft.label.trim();
  if (label.length > 64) {
    return "Names are at most 64 characters.";
  }
  if (draft.accentColor !== null && !isEngineAccentColor(draft.accentColor)) {
    return "Accent colours are #rrggbb hex values.";
  }
  const binaryPath = draft.binaryPath.trim();
  if (binaryPath && !isAbsoluteLike(binaryPath)) {
    return "The binary path must be absolute (or start with ~/).";
  }
  const homePath = draft.homePath.trim();
  if (getDriverHomeEnvVar(driver) && homePath && !isAbsoluteLike(homePath)) {
    return "The home directory must be absolute (or start with ~/).";
  }
  const environment = toEnvVarInputs(draft.environment);
  return "error" in environment ? environment.error : null;
}

function withConfigPath(
  config: Record<string, unknown>,
  key: "binaryPath" | "homePath",
  value: string,
) {
  const next = { ...config };
  const trimmed = value.trim();
  if (trimmed) {
    next[key] = trimmed;
  } else {
    delete next[key];
  }
  return next;
}

/** The create input for a new instance of `driver` (the server picks its id). */
export function buildCreateInstanceInput(
  driver: string,
  draft: InstanceFormDraft,
): CreateEngineInstanceInput {
  const environment = toEnvVarInputs(draft.environment);
  if ("error" in environment) {
    throw new Error(environment.error);
  }
  let config = withConfigPath({}, "binaryPath", draft.binaryPath);
  if (getDriverHomeEnvVar(driver)) {
    config = withConfigPath(config, "homePath", draft.homePath);
  }
  const label = draft.label.trim();

  return {
    ...(draft.accentColor ? { accentColor: draft.accentColor } : {}),
    ...(Object.keys(config).length > 0 ? { config } : {}),
    driver,
    ...(environment.environment.length > 0
      ? { environment: environment.environment }
      : {}),
    ...(label ? { label } : {}),
  };
}

/**
 * Only what changed. `config` and `environment` replace the stored values,
 * so the config keeps every key the dialog does not edit (launchArgs, …).
 */
export function buildUpdateInstancePatch(
  summary: Pick<
    EngineInstanceSummary,
    "accentColor" | "config" | "driver" | "environment" | "label"
  >,
  draft: InstanceFormDraft,
): UpdateEngineInstanceInput {
  const original = draftFromSummary(summary);
  const patch: UpdateEngineInstanceInput = {};

  const label = draft.label.trim();
  if (label && label !== original.label) {
    patch.label = label;
  }
  if (draft.accentColor !== original.accentColor) {
    patch.accentColor = draft.accentColor;
  }

  const homeEditable = Boolean(getDriverHomeEnvVar(summary.driver));
  const binaryChanged = draft.binaryPath.trim() !== original.binaryPath.trim();
  const homeChanged =
    homeEditable && draft.homePath.trim() !== original.homePath.trim();
  if (binaryChanged || homeChanged) {
    let config = withConfigPath(
      asRecord(summary.config),
      "binaryPath",
      draft.binaryPath,
    );
    if (homeEditable) {
      config = withConfigPath(config, "homePath", draft.homePath);
    }
    patch.config = config;
  }

  const environment = toEnvVarInputs(draft.environment);
  if ("error" in environment) {
    throw new Error(environment.error);
  }
  const originalEnvironment = toEnvVarInputs(original.environment);
  if (
    "error" in originalEnvironment ||
    JSON.stringify(environment.environment) !==
      JSON.stringify(originalEnvironment.environment)
  ) {
    patch.environment = environment.environment;
  }

  return patch;
}

/**
 * Shown before saving a new home for an instance that threads may already
 * use: their native sessions belong to the old home.
 */
export function getHomeChangeNotice(
  summary: Pick<EngineInstanceSummary, "config" | "driver">,
  draft: Pick<InstanceFormDraft, "homePath">,
) {
  const meta = getDriverMeta(summary.driver);
  if (!meta?.homeEnvVar) {
    return null;
  }
  if (draft.homePath.trim() === configString(summary.config, "homePath")) {
    return null;
  }
  return `Threads on this instance start new ${meta.label} sessions after this change; their conversation so far is sent along to the new session.`;
}

// --- Custom models -----------------------------------------------------------

/** Where a custom model's options come from. */
export const KEEP_OPTIONS = "__keep__";
export const NO_OPTIONS = "__none__";

export type CustomModelDraft = {
  id: string;
  key: string;
  name: string;
  /** Options stored with the entry (kept with KEEP_OPTIONS). */
  options: EngineOptionDescriptor[] | undefined;
  /** KEEP_OPTIONS, NO_OPTIONS, or the id of a model to copy options from. */
  optionsFrom: string;
};

export function toCustomModelDrafts(
  customModels: readonly CustomEngineModel[],
): CustomModelDraft[] {
  return customModels.map((model) => ({
    id: model.id,
    key: newDraftKey("model"),
    name: model.name ?? "",
    options: model.options,
    optionsFrom: model.options?.length ? KEEP_OPTIONS : NO_OPTIONS,
  }));
}

export function emptyCustomModelDraft(): CustomModelDraft {
  return {
    id: "",
    key: newDraftKey("model"),
    name: "",
    options: undefined,
    optionsFrom: NO_OPTIONS,
  };
}

/**
 * Models whose options a custom model can copy: the ones the engine
 * reports that have option descriptors.
 */
export function getOptionTemplateModels(models: readonly EngineModel[]) {
  return models.filter(
    (model) => model.source !== "custom" && model.options.length > 0,
  );
}

/** engine_instance.custom_models from the editor rows, or the first problem. */
export function toCustomModels(
  drafts: readonly CustomModelDraft[],
  templateModels: readonly Pick<EngineModel, "id" | "options">[],
): { customModels: CustomEngineModel[] } | { error: string } {
  const customModels: CustomEngineModel[] = [];
  const seen = new Set<string>();

  for (const draft of drafts) {
    const id = draft.id.trim();
    const name = draft.name.trim();
    if (!id && !name) {
      continue;
    }
    if (!id) {
      return { error: "Give every custom model an id or remove its row." };
    }
    if (!ENGINE_MODEL_ID_PATTERN.test(id)) {
      return {
        error: `"${id}" is not a valid model id (up to 128 letters, digits and . _ : / [ ] @ -).`,
      };
    }
    if (seen.has(id)) {
      return { error: `${id} is listed twice.` };
    }
    seen.add(id);
    if (name.length > 200) {
      return { error: `The name of ${id} is longer than 200 characters.` };
    }

    const options =
      draft.optionsFrom === KEEP_OPTIONS
        ? draft.options
        : draft.optionsFrom === NO_OPTIONS
          ? undefined
          : templateModels.find((model) => model.id === draft.optionsFrom)
              ?.options;
    customModels.push({
      id,
      ...(name && name !== id ? { name } : {}),
      ...(options?.length ? { options } : {}),
    });
  }

  if (customModels.length > MAX_ENGINE_CUSTOM_MODELS) {
    return {
      error: `At most ${MAX_ENGINE_CUSTOM_MODELS} custom models are allowed.`,
    };
  }
  return { customModels };
}

/**
 * A hint for the model id field, from the ids the engine reports (OpenCode
 * ids name their provider: provider/model).
 */
export function getCustomModelIdHint(
  models: readonly Pick<EngineModel, "id">[],
) {
  const example = models.find((model) => model.id.includes("/"))?.id;
  return example
    ? `The id the engine uses, provider/model like ${example}.`
    : "The id the engine accepts as its model name.";
}
