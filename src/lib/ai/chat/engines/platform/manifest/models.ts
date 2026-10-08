import {
  computeEngineSnapshotUsable,
  type CustomEngineModel,
  type EngineModel,
  type EngineOptionDescriptor,
  type EngineSnapshot,
} from "../../contract";
import {
  AGENT_OPTION_ID,
  REASONING_OPTION_ID,
  VARIANT_OPTION_ID,
} from "../../model-options";
import { isEngineVersionBelow } from "./compatibility";
import type {
  EngineManifest,
  EngineManifestDriver,
  EngineManifestModel,
  EngineManifestProfile,
} from "./schema";

// How a snapshot's model list is put together (driver-contract.md §5):
//   1. the models the runtime reported (live);
//   2. the manifest overlay: badge, legacy flag, aliases, a missing context
//      window and missing option descriptors;
//   3. manifest catalog models: always for "catalog" drivers, and for
//      "overlay" drivers that are usable but reported nothing;
//   4. the instance's custom models, deduplicated by id.
// Pure functions over snapshots; both steps strip what they added before,
// so applying them again (a stale snapshot re-enriched) is a no-op.

/**
 * The option ids each runtime reads from a request today. The manifest
 * describes more (fast mode, context window variants) for the native ports
 * to come; descriptors outside this list are not offered, so the composer
 * never shows a control the runtime would ignore. Drivers missing here get
 * the reasoning effort only.
 */
export const RUNTIME_OPTION_IDS: Record<string, readonly string[]> = {
  claude: [REASONING_OPTION_ID],
  codex: [REASONING_OPTION_ID],
  copilot: [REASONING_OPTION_ID],
  cursor: [REASONING_OPTION_ID],
  opencode: [AGENT_OPTION_ID, VARIANT_OPTION_ID],
};

export function getRuntimeOptionIds(driver: string): readonly string[] {
  return RUNTIME_OPTION_IDS[driver] ?? [REASONING_OPTION_ID];
}

const CONTEXT_SUFFIX = /\[[^\]]*\]$/;

function baseId(id: string) {
  return id.replace(CONTEXT_SUFFIX, "");
}

/** The manifest entry for a model id: by id, then by alias. */
export function findManifestModel(
  catalog: Pick<EngineManifestDriver, "models">,
  ids: readonly (string | undefined)[],
): EngineManifestModel | null {
  const candidates = ids.filter((id): id is string => Boolean(id));
  for (const id of candidates) {
    const found = catalog.models.find(
      (entry) => entry.id === id || entry.id === baseId(id),
    );
    if (found) {
      return found;
    }
  }
  for (const id of candidates) {
    const found = catalog.models.find((entry) =>
      entry.aliases?.some((alias) => alias === id || alias === baseId(id)),
    );
    if (found) {
      return found;
    }
  }
  return null;
}

function profileOf(
  catalog: Pick<EngineManifestDriver, "profiles">,
  entry: Pick<EngineManifestModel, "profile"> | null,
): EngineManifestProfile | null {
  return entry?.profile ? (catalog.profiles[entry.profile] ?? null) : null;
}

function supportedOptions(
  options: readonly EngineOptionDescriptor[],
  optionIds: readonly string[],
) {
  return options.filter((option) => optionIds.includes(option.id));
}

function overlayModel(
  model: EngineModel,
  catalog: EngineManifestDriver,
  optionIds: readonly string[],
): EngineModel {
  const entry = findManifestModel(catalog, [model.id, model.runtimeId]);
  if (!entry) {
    return model;
  }

  const profile = profileOf(catalog, entry);
  const known = new Set(model.options.map((option) => option.id));
  const missing = supportedOptions(profile?.options ?? [], optionIds).filter(
    (option) => !known.has(option.id),
  );
  const aliases = [
    ...new Set([...(model.aliases ?? []), ...(entry.aliases ?? [])]),
  ];
  const contextWindow =
    model.contextWindow ?? entry.contextWindow ?? profile?.contextWindow;

  return {
    ...model,
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(entry.badge && entry.status === "current"
      ? { badge: entry.badge }
      : {}),
    ...(contextWindow ? { contextWindow } : {}),
    ...(entry.status === "legacy" ? { isLegacy: true } : {}),
    options:
      missing.length > 0 ? [...model.options, ...missing] : model.options,
  };
}

function catalogModel(input: {
  catalog: EngineManifestDriver;
  driver: string;
  entry: EngineManifestModel;
  installedVersion: string | null;
  optionIds: readonly string[];
}): EngineModel {
  const { catalog, entry } = input;
  const profile = profileOf(catalog, entry);
  const contextWindow = entry.contextWindow ?? profile?.contextWindow;
  const tooOld =
    entry.minRuntimeVersion !== undefined &&
    isEngineVersionBelow(
      input.driver,
      input.installedVersion,
      entry.minRuntimeVersion,
    );

  return {
    ...(entry.aliases?.length ? { aliases: [...entry.aliases] } : {}),
    ...(entry.badge && entry.status === "current"
      ? { badge: entry.badge }
      : {}),
    ...(contextWindow ? { contextWindow } : {}),
    ...(entry.description ? { description: entry.description } : {}),
    ...(tooOld
      ? {
          disabledReason: `Needs version ${entry.minRuntimeVersion} or newer.`,
        }
      : {}),
    id: entry.id,
    inputModalities: [
      ...(entry.inputModalities ?? profile?.inputModalities ?? ["text"]),
    ],
    isCustom: false,
    ...(entry.status === "legacy" ? { isLegacy: true } : {}),
    ...(entry.minRuntimeVersion
      ? { minRuntimeVersion: entry.minRuntimeVersion }
      : {}),
    name: entry.name,
    options: supportedOptions(profile?.options ?? [], input.optionIds),
    ...(entry.runtimeId ? { runtimeId: entry.runtimeId } : {}),
    ...(entry.shortName ? { shortName: entry.shortName } : {}),
    source: "manifest",
    ...(entry.subProvider ? { subProvider: entry.subProvider } : {}),
  };
}

function withDefaultModel(
  snapshot: EngineSnapshot,
  models: EngineModel[],
  catalog: EngineManifestDriver,
): Pick<EngineSnapshot, "defaultModelId" | "models"> {
  const current =
    snapshot.defaultModelId &&
    models.some((model) => model.id === snapshot.defaultModelId)
      ? snapshot.defaultModelId
      : null;
  if (current) {
    return { defaultModelId: current, models };
  }

  // Only when the runtime names no default (or one that is gone): the
  // runtime's own choice is never overridden.
  const marked = models.find(
    (model) => model.isDefault && !model.disabledReason,
  );
  const chat = catalog.defaults?.chat;
  const fromManifest = chat
    ? models.find(
        (model) =>
          !model.disabledReason &&
          (model.id === chat ||
            model.runtimeId === chat ||
            model.aliases?.includes(chat)),
      )
    : undefined;
  const chosen = marked ?? fromManifest ?? null;
  if (!chosen) {
    return { defaultModelId: null, models };
  }

  return {
    defaultModelId: chosen.id,
    models: models.map((model) =>
      model.id === chosen.id && !model.isDefault
        ? { ...model, isDefault: true }
        : model,
    ),
  };
}

/**
 * Steps 2 and 3: the manifest's view of the snapshot's models. Snapshots
 * of drivers the manifest does not describe are returned as they are.
 */
export function applyManifestModels(
  snapshot: EngineSnapshot,
  manifest: Pick<EngineManifest, "drivers">,
  options: { optionIds?: readonly string[] } = {},
): EngineSnapshot {
  const catalog = manifest.drivers[snapshot.driver];
  if (!catalog) {
    return snapshot;
  }

  const optionIds = options.optionIds ?? getRuntimeOptionIds(snapshot.driver);
  const live = snapshot.models
    .filter((model) => model.source !== "manifest")
    .map((model) =>
      model.isCustom ? model : overlayModel(model, catalog, optionIds),
    );

  const liveIds = new Set(live.flatMap((model) => [model.id, model.runtimeId]));
  const reported = live.filter((model) => !model.isCustom);
  const fill =
    catalog.mode === "catalog" ||
    (reported.length === 0 &&
      snapshot.install.installed &&
      computeEngineSnapshotUsable(snapshot));
  const added = fill
    ? catalog.models
        .filter(
          (entry) => catalog.mode === "catalog" || entry.status === "current",
        )
        .filter(
          (entry) =>
            !liveIds.has(entry.id) &&
            !(entry.aliases ?? []).some((alias) => liveIds.has(alias)),
        )
        .map((entry) =>
          catalogModel({
            catalog,
            driver: snapshot.driver,
            entry,
            installedVersion: snapshot.install.version,
            optionIds,
          }),
        )
    : [];

  // Custom models stay last (step 4 runs after this one).
  const models = [
    ...live.filter((model) => !model.isCustom),
    ...added,
    ...live.filter((model) => model.isCustom),
  ];
  return { ...snapshot, ...withDefaultModel(snapshot, models, catalog) };
}

/** Descriptors for a custom model: its own, else the manifest's. */
function customModelOptions(
  custom: CustomEngineModel,
  catalog: EngineManifestDriver | undefined,
  optionIds: readonly string[],
) {
  if (custom.options) {
    return custom.options;
  }
  if (!catalog) {
    return [];
  }
  const entry = findManifestModel(catalog, [custom.id]);
  const profile =
    profileOf(catalog, entry) ??
    (catalog.defaults?.customModelProfile
      ? (catalog.profiles[catalog.defaults.customModelProfile] ?? null)
      : null);
  return supportedOptions(profile?.options ?? [], optionIds);
}

/**
 * Step 4: the instance's custom models. A custom entry whose id the runtime
 * or manifest already lists overrides that model's name and descriptors
 * (when it carries them); the others are appended (isCustom, source
 * "custom"). Runtimes that are not installed get none, so an engine that
 * cannot run never looks connected in the composer.
 */
export function applyCustomModels(
  snapshot: EngineSnapshot,
  customModels: readonly CustomEngineModel[],
  options: {
    manifest?: Pick<EngineManifest, "drivers">;
    optionIds?: readonly string[];
  } = {},
): EngineSnapshot {
  const base = snapshot.models.filter((model) => model.source !== "custom");
  if (customModels.length === 0 || !snapshot.install.installed) {
    return base.length === snapshot.models.length
      ? snapshot
      : { ...snapshot, models: base };
  }

  const catalog = options.manifest?.drivers[snapshot.driver];
  const optionIds = options.optionIds ?? getRuntimeOptionIds(snapshot.driver);
  const byId = new Map(customModels.map((custom) => [custom.id, custom]));
  const models = base.map((model) => {
    const custom = byId.get(model.id);
    if (!custom) {
      return model;
    }
    byId.delete(model.id);
    return {
      ...model,
      ...(custom.name ? { name: custom.name } : {}),
      ...(custom.options ? { options: custom.options } : {}),
    };
  });

  for (const custom of byId.values()) {
    models.push({
      id: custom.id,
      inputModalities: ["text"],
      isCustom: true,
      name: custom.name ?? custom.id,
      options: customModelOptions(custom, catalog, optionIds),
      source: "custom",
    });
  }

  return { ...snapshot, models };
}
