import "server-only";

import { buildManagedExecutablePathValue } from "@/lib/runtime/platform-paths";

import type {
  EngineCompatibilityAdvisory,
  EngineSnapshot,
} from "../../contract";
import {
  compareEngineVersions,
  normalizeEngineVersion,
  resolveEngineCompatibility,
} from "../manifest/compatibility";
import type { EngineManifest } from "../manifest/schema";
import { findExecutableInPath } from "../runtime/resolve-binary";
import {
  getEngineMaintenanceDefinition,
  type EngineInstallOption,
  type EngineMaintenanceDefinition,
} from "./definitions";
import type {
  LatestVersionLookup,
  LatestVersionSource,
} from "./latest-version";
import {
  resolveUpdatePlan,
  type EngineUpdatePlan,
  type OwnershipDeps,
} from "./ownership";

// What can be installed or updated for one instance, from its snapshot:
// the update plan for the binary it runs (ownership.ts), the newest
// release (latest-version.ts), whether that release is one this Sentinel
// supports (manifest compatibility), and which install commands are
// available on this machine. Shared by the update-state enricher (which
// never waits long) and the maintenance service (which acts on it).

export const MANAGED_INSTALL_OPTION_ID = "managed";
const PLAN_CACHE_TTL_MS = 60 * 60 * 1_000;
const TOOL_CACHE_TTL_MS = 60 * 1_000;

export type EngineInstallOptionView = {
  available: boolean;
  /** The exact command; null for a managed download. */
  command: string | null;
  description: string | null;
  id: string;
  label: string;
  /** Why it is not available. */
  reason: string | null;
};

export type MaintenanceInspection = {
  /** The runtime ships with Sentinel. */
  bundled: boolean;
  canUpdate: boolean;
  checkedAt: number | null;
  currentVersion: string | null;
  definition: EngineMaintenanceDefinition | null;
  installHint: string | null;
  installOptions: EngineInstallOptionView[];
  latestCompatibility: EngineCompatibilityAdvisory | null;
  latestVersion: string | null;
  plan: EngineUpdatePlan | null;
  /** Why the update action is not offered (null when it is). */
  updateBlockedReason: string | null;
  versionStatus: "behind_latest" | "current" | "unknown";
};

/**
 * cache: what is known, starting a lookup in the background when stale;
 * wait: as cache, but waits up to `waitMs` for a missing answer; force:
 * always looks up.
 */
export type LatestVersionMode = "cache" | "force" | "wait";

export type MaintenanceInspectDeps = {
  latest: LatestVersionLookup;
  manifest: () => Promise<Pick<EngineManifest, "compatibility">>;
  /** The PATH used to find npm, curl, brew… (default: managed PATH). */
  managedPath?: (env: Record<string, string | undefined>) => Promise<string>;
  ownership?: OwnershipDeps;
  platform?: NodeJS.Platform;
  /** Plans by binary and target, cached for an hour. */
  planCache?: Map<string, { at: number; plan: EngineUpdatePlan }>;
  /** Programs found on a PATH, cached for a minute (install options). */
  toolCache?: Map<string, { at: number; path: string | null }>;
  now?: () => number;
  updateChecksEnabled: () => Promise<boolean>;
  which?: (command: string, pathValue: string) => Promise<string | null>;
};

export type MaintenanceInspectInput = {
  driver: string | { kind: string; maintenance?: EngineMaintenanceDefinition };
  env: Record<string, string | undefined>;
  /** Re-derive ownership instead of using the cached plan. */
  freshPlan?: boolean;
  latestMode: LatestVersionMode;
  signal?: AbortSignal;
  snapshot: Pick<EngineSnapshot, "driver" | "install" | "label">;
  waitMs?: number;
};

async function resolveTools(
  option: EngineInstallOption,
  pathValue: string,
  which: (command: string, pathValue: string) => Promise<string | null>,
) {
  const tools: Record<string, string> = {};
  const missing: string[] = [];
  for (const tool of option.requires) {
    const found = await which(tool, pathValue).catch(() => null);
    if (found) {
      tools[tool] = found;
    } else {
      missing.push(tool);
    }
  }
  return { missing, tools };
}

function isIncompatible(advisory: EngineCompatibilityAdvisory | null) {
  return advisory?.status === "broken" || advisory?.status === "unsupported";
}

async function waitFor<T>(
  promise: Promise<T>,
  ms: number,
  signal: AbortSignal | undefined,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let onAbort: (() => void) | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
        if (signal) {
          onAbort = () => resolve(null);
          signal.addEventListener("abort", onAbort, { once: true });
        }
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export async function inspectMaintenance(
  input: MaintenanceInspectInput,
  deps: MaintenanceInspectDeps,
): Promise<MaintenanceInspection> {
  const definition = getEngineMaintenanceDefinition(input.driver);
  const driverKind =
    typeof input.driver === "string" ? input.driver : input.driver.kind;
  const platform = deps.platform ?? process.platform;
  const now = deps.now ?? (() => Date.now());
  const findTool =
    deps.which ??
    ((command: string, pathValue: string) =>
      findExecutableInPath(command, pathValue, { platform }));
  const which = async (command: string, pathValue: string) => {
    const key = `${command}\u0000${pathValue}`;
    const cached = deps.toolCache?.get(key);
    if (cached && now() - cached.at < TOOL_CACHE_TTL_MS) {
      return cached.path;
    }
    const found = await findTool(command, pathValue);
    deps.toolCache?.set(key, { at: now(), path: found });
    return found;
  };
  const managedPath =
    deps.managedPath ??
    ((env: Record<string, string | undefined>) =>
      buildManagedExecutablePathValue(env.PATH, {
        env: env as NodeJS.ProcessEnv,
        platform,
      }));
  const { install } = input.snapshot;
  const currentVersion =
    normalizeEngineVersion(driverKind, install.version) ?? install.version;

  const empty: MaintenanceInspection = {
    bundled: false,
    canUpdate: false,
    checkedAt: null,
    currentVersion,
    definition,
    installHint: definition?.installHint ?? null,
    installOptions: [],
    latestCompatibility: null,
    latestVersion: null,
    plan: null,
    updateBlockedReason: null,
    versionStatus: "unknown",
  };
  if (!definition) {
    return empty;
  }

  const manifest = await deps.manifest();

  if (!install.installed) {
    const pathValue = await managedPath(input.env);
    const options: EngineInstallOptionView[] = [];
    if (definition.managedInstall) {
      options.push({
        available: true,
        command: null,
        description: definition.managedInstall.description ?? null,
        id: MANAGED_INSTALL_OPTION_ID,
        label: definition.managedInstall.label,
        reason: null,
      });
    }
    for (const option of definition.install) {
      if (option.platforms && !option.platforms.includes(platform)) {
        continue;
      }
      const { missing, tools } = await resolveTools(option, pathValue, which);
      const display = option.command(
        Object.fromEntries(option.requires.map((tool) => [tool, tool])),
      ).display;
      const generation = option.representativeVersion
        ? resolveEngineCompatibility({
            driver: driverKind,
            label: input.snapshot.label,
            policies: manifest.compatibility,
            version: option.representativeVersion,
          })
        : null;
      const reason =
        missing.length > 0
          ? `Needs ${missing.join(", ")} on this machine.`
          : isIncompatible(generation)
            ? "This version of Sentinel does not support it yet."
            : null;
      options.push({
        available: reason === null,
        command: missing.length === 0 ? option.command(tools).display : display,
        description: option.description ?? null,
        id: option.id,
        label: option.label,
        reason,
      });
    }
    return { ...empty, installOptions: options };
  }

  if (install.source && definition.bundledSources?.includes(install.source)) {
    return {
      ...empty,
      bundled: true,
      updateBlockedReason:
        "This runtime ships with Sentinel and updates with it.",
    };
  }

  const planFor = async (targetVersion: string | null) => {
    const key = `${driverKind}\u0000${install.path}\u0000${install.version}\u0000${targetVersion}`;
    const cached = deps.planCache?.get(key);
    if (!input.freshPlan && cached && now() - cached.at < PLAN_CACHE_TTL_MS) {
      return cached.plan;
    }
    const plan = await resolveUpdatePlan(
      {
        binaryPath: install.path,
        definition,
        driver: driverKind,
        env: input.env,
        installedVersion: install.version,
        targetVersion,
      },
      { ...deps.ownership, platform },
    );
    deps.planCache?.set(key, { at: now(), plan });
    return plan;
  };

  // Where "latest" comes from depends on the owner: Homebrew's own
  // channel, else the npm package of the installed generation.
  const base = await planFor(null);
  const packageName = definition.packageName(install.version);
  const source: LatestVersionSource | null =
    base.kind === "command" && base.homebrew
      ? {
          brewPath: base.homebrew.brewPath,
          cask: base.homebrew.cask,
          env: input.env,
          kind: "homebrew",
          name: base.homebrew.name,
        }
      : packageName
        ? { kind: "npm", packageName }
        : null;

  let latest = source ? deps.latest.peek(source) : null;
  const checksEnabled = source ? await deps.updateChecksEnabled() : false;
  if (source && checksEnabled) {
    if (input.latestMode === "force") {
      latest = {
        ...(await deps.latest.get(source, { force: true })),
        fresh: true,
      };
    } else if (!latest?.fresh) {
      const pending = deps.latest.get(source);
      const answer =
        input.latestMode === "wait" || !latest
          ? await waitFor(pending, input.waitMs ?? 0, input.signal)
          : null;
      if (answer) {
        latest = { ...answer, fresh: true };
      } else {
        void pending.catch(() => undefined);
      }
    }
  }

  const latestVersion = latest?.version ?? null;
  const comparison = compareEngineVersions(
    driverKind,
    install.version,
    latestVersion,
  );
  const versionStatus =
    comparison === null
      ? "unknown"
      : comparison < 0
        ? "behind_latest"
        : "current";

  // Pin the update to the release whose compatibility was checked.
  const targetVersion =
    latestVersion &&
    normalizeEngineVersion(driverKind, latestVersion) === latestVersion
      ? latestVersion
      : null;
  const plan = targetVersion ? await planFor(targetVersion) : base;
  const latestCompatibility = latestVersion
    ? resolveEngineCompatibility({
        driver: driverKind,
        label: input.snapshot.label,
        policies: manifest.compatibility,
        version: latestVersion,
      })
    : null;

  let updateBlockedReason: string | null = null;
  if (plan.kind === "manual") {
    updateBlockedReason = plan.reason;
  } else if (isIncompatible(latestCompatibility)) {
    updateBlockedReason = `${input.snapshot.label} ${latestVersion} is not supported by this version of Sentinel yet.`;
  }

  return {
    ...empty,
    canUpdate: plan.kind === "command" && !isIncompatible(latestCompatibility),
    checkedAt: latest?.checkedAt ?? null,
    latestCompatibility,
    latestVersion,
    plan,
    updateBlockedReason,
    versionStatus,
  };
}
