import "server-only";

import {
  access as nodeAccess,
  readFile as nodeReadFile,
  realpath as nodeRealpath,
  stat as nodeStat,
} from "node:fs/promises";
import path from "node:path";

import { findExecutableInPath } from "../runtime/resolve-binary";
import { runCommandProbe } from "../runtime/version-probe";
import {
  normalizeCommandPath,
  type EngineMaintenanceDefinition,
} from "./definitions";

// Which program updates an installed CLI, decided from where its binary
// actually lives. Ported from t3code's providerMaintenance.ts
// (resolvePackageManagedProviderMaintenance, MIT): every package-manager
// branch needs evidence that the manager owns that path (its global
// directory, an npm prefix naming the package, a Homebrew keg or cask under
// the prefix of the `brew` that will run), so Sentinel never points a
// package manager at an install it did not make. An install no manager can
// be proven to own falls back to the CLI's own updater, which detects its
// installer itself; mise installs and copies inside a project's
// node_modules stay manual.

export type EngineUpdateOwner =
  | "bun"
  | "homebrew-cask"
  | "homebrew-formula"
  | "native"
  | "npm"
  | "pnpm"
  | "vite-plus"
  | "volta"
  | "yarn";

export type EngineUpdateCommand = {
  args: string[];
  /** The exact command, as the user confirms it. */
  display: string;
  /** Variables set for this command (the CLI's own updater may need some). */
  env?: Record<string, string>;
  executable: string;
  /** Updates with the same key never run at the same time. */
  lockKey: string;
};

export type EngineUpdatePlan =
  | {
      command: EngineUpdateCommand;
      /** For Homebrew: what `brew upgrade` can deliver (cask/formula name). */
      homebrew?: { brewPath: string; cask: boolean; name: string };
      kind: "command";
      owner: EngineUpdateOwner;
      ownerLabel: string;
    }
  | { kind: "manual"; reason: string };

export type OwnershipDeps = {
  /** File exists. */
  exists?: (target: string) => Promise<boolean>;
  platform?: NodeJS.Platform;
  readFile?: (target: string) => Promise<string>;
  realpath?: (target: string) => Promise<string>;
  /** `brew <args>`: stdout, or null on failure. */
  runBrew?: (
    brewPath: string,
    args: string[],
    env: Record<string, string | undefined>,
  ) => Promise<string | null>;
  size?: (target: string) => Promise<number>;
  /** A program on the given PATH value. */
  which?: (
    command: string,
    pathValue: string | undefined,
  ) => Promise<string | null>;
};

const MISE_WRAPPER_MAX_BYTES = 16 * 1024;
const BREW_TIMEOUT_MS = 10_000;

/** A word as it pastes into the host's shell (t3code quoteShellWord). */
export function quoteShellWord(word: string, platform: NodeJS.Platform) {
  const safe = platform === "win32" ? /^[\w./:\\@=-]+$/ : /^[\w./:@=+-]+$/;
  if (safe.test(word)) {
    return word;
  }
  return platform === "win32"
    ? `'${word.replace(/['‘’]/g, "$&$&")}'`
    : `'${word.replaceAll("'", "'\\''")}'`;
}

function formatCommand(
  displayExecutable: string,
  args: readonly string[],
  platform: NodeJS.Platform,
) {
  const executable = quoteShellWord(displayExecutable, platform);
  return [
    platform === "win32" && executable !== displayExecutable
      ? `& ${executable}`
      : executable,
    ...args.map((arg) => quoteShellWord(arg, platform)),
  ].join(" ");
}

function isBunGlobal(commandPath: string) {
  return normalizeCommandPath(commandPath).includes("/.bun/bin/");
}

function isVitePlusGlobal(commandPath: string) {
  return normalizeCommandPath(commandPath).includes("/.vite-plus/bin/");
}

function isYarnGlobal(commandPath: string) {
  return /\/yarn\/(?:data\/)?global\/node_modules\//.test(
    normalizeCommandPath(commandPath),
  );
}

function isPnpmGlobal(commandPath: string) {
  const normalized = normalizeCommandPath(commandPath);
  return (
    normalized.includes("/.local/share/pnpm/") ||
    normalized.includes("/library/pnpm/") ||
    normalized.includes("/local/share/pnpm/") ||
    normalized.includes("/appdata/local/pnpm/") ||
    normalized.includes("/pnpm/global/")
  );
}

function isMisePath(commandPath: string) {
  const normalized = normalizeCommandPath(commandPath);
  return (
    normalized.includes("/mise/installs/") ||
    normalized.includes("/mise/shims/")
  );
}

/**
 * The npm prefix that owns a package, from the real path of its entry
 * point: `<prefix>/lib/node_modules/<pkg>/…`. A project's node_modules is
 * not a global install (null).
 */
export function npmGlobalPrefixFromCommandPath(
  realCommandPath: string,
  packageName: string,
) {
  const slashed = realCommandPath.replaceAll("\\", "/");
  const normalized = slashed.toLowerCase();
  const segment = `/lib/node_modules/${packageName.toLowerCase()}/`;
  const index = normalized.lastIndexOf(segment);
  if (index < 0 || normalized.slice(0, index).includes("/node_modules/")) {
    return null;
  }
  // mise's npm backend uses a global-looking layout inside a tool version;
  // globals of a mise-installed Node still belong to npm.
  const miseTool = /\/mise\/installs\/([^/]+)\/[^/]+$/.exec(
    normalized.slice(0, index),
  )?.[1];
  if (miseTool && miseTool !== "node") {
    return null;
  }
  return index === 0 ? "/" : slashed.slice(0, index);
}

export type HomebrewOwnership = {
  kind: "cask" | "formula";
  name: string;
  prefix: string;
};

// `<prefix>/Cellar/<name>/<version>/…` or `<prefix>/Caskroom/<name>/<version>/…`.
const HOMEBREW_KEG = /^(.*)\/(cellar|caskroom)\/([^/]+)\/[^/]+\//i;

export function homebrewOwnershipFromCommandPath(
  realCommandPath: string,
): HomebrewOwnership | null {
  const match = HOMEBREW_KEG.exec(realCommandPath.replaceAll("\\", "/"));
  return match
    ? {
        kind: match[2]!.toLowerCase() === "cellar" ? "formula" : "cask",
        name: match[3]!,
        prefix: match[1]!,
      }
    : null;
}

const defaultDeps: Required<OwnershipDeps> = {
  exists: async (target) => {
    try {
      await nodeAccess(target);
      return true;
    } catch {
      return false;
    }
  },
  platform: process.platform,
  readFile: (target) => nodeReadFile(target, "utf8"),
  realpath: (target) => nodeRealpath(target),
  runBrew: async (brewPath, args, env) => {
    const result = await runCommandProbe({
      args,
      command: brewPath,
      env,
      timeoutMs: BREW_TIMEOUT_MS,
    });
    return result.error ? null : result.stdout;
  },
  size: async (target) => (await nodeStat(target)).size,
  which: (command, pathValue) => findExecutableInPath(command, pathValue),
};

export type ResolveUpdatePlanInput = {
  /** The binary the instance runs (snapshot install.path). */
  binaryPath: string | null;
  definition: EngineMaintenanceDefinition;
  driver: string;
  env: Record<string, string | undefined>;
  installedVersion: string | null;
  /** Latest release of the installed generation, when known. */
  targetVersion: string | null;
};

export async function resolveUpdatePlan(
  input: ResolveUpdatePlanInput,
  overrides: OwnershipDeps = {},
): Promise<EngineUpdatePlan> {
  const deps = { ...defaultDeps, ...overrides };
  const platform = deps.platform;
  const binaryPath = input.binaryPath?.trim();
  if (!binaryPath) {
    return { kind: "manual", reason: "The runtime was not found." };
  }
  const realCommandPath = await deps.realpath(binaryPath).catch(() => null);
  if (!realCommandPath) {
    return { kind: "manual", reason: "The runtime was not found." };
  }
  const commandPaths = [binaryPath, realCommandPath];
  const packageName = input.definition.packageName(input.installedVersion);

  const nativeArgs = input.definition.nativeUpdate?.args({
    targetVersion: input.targetVersion,
  });
  const nativeDisplayName = await (async () => {
    // Shown by name when that name finds this very binary on PATH.
    const name = path.basename(binaryPath);
    const found = await deps.which(name, input.env.PATH).catch(() => null);
    return found && path.resolve(found) === path.resolve(binaryPath)
      ? name.replace(/\.(?:exe|cmd|bat)$/i, "")
      : binaryPath;
  })();
  const nativeEnv =
    input.definition.nativeUpdate?.env?.(realCommandPath) ??
    input.definition.nativeUpdate?.env?.(binaryPath) ??
    null;
  const native: EngineUpdatePlan | null = nativeArgs
    ? {
        command: {
          args: [...nativeArgs],
          display: formatCommand(nativeDisplayName, nativeArgs, platform),
          ...(nativeEnv ? { env: nativeEnv } : {}),
          executable: binaryPath,
          lockKey: `${input.driver}-native:${normalizeCommandPath(realCommandPath)}`,
        },
        kind: "command",
        owner: "native",
        ownerLabel: "Its own updater",
      }
    : null;
  const nativeUnavailable: EngineUpdatePlan = {
    kind: "manual",
    reason: input.definition.nativeUpdate
      ? "The latest version could not be determined, so Sentinel cannot pick a safe update target."
      : "Sentinel cannot tell how this runtime was installed. Update it the way you installed it.",
  };

  if (
    native &&
    input.definition.nativeUpdate?.ownsPath &&
    commandPaths.some(input.definition.nativeUpdate.ownsPath)
  ) {
    return native;
  }

  // A node_modules path not proven below belongs to a project or another
  // package; the CLI's own updater could act on the wrong install.
  const fallback: EngineUpdatePlan = commandPaths.some((commandPath) =>
    normalizeCommandPath(commandPath).includes("/node_modules/"),
  )
    ? {
        kind: "manual",
        reason:
          "This runtime is installed inside a project's node_modules. Update it with that project.",
      }
    : (native ?? nativeUnavailable);

  const packageManager = (
    owner: EngineUpdateOwner,
    ownerLabel: string,
    executable: string,
    args: string[],
    lockKey: string,
  ): EngineUpdatePlan => ({
    command: {
      args,
      display: formatCommand(executable, args, platform),
      executable,
      lockKey,
    },
    kind: "command",
    owner,
    ownerLabel,
  });
  const target = packageName
    ? `${packageName}@${input.targetVersion ?? "latest"}`
    : null;

  if (packageName && target) {
    if (commandPaths.some(isVitePlusGlobal)) {
      return packageManager(
        "vite-plus",
        "Vite+ global",
        "vp",
        ["i", "-g", target],
        "vite-plus-global",
      );
    }
    if (commandPaths.some(isBunGlobal)) {
      return packageManager(
        "bun",
        "bun global",
        "bun",
        ["i", "-g", target],
        "bun-global",
      );
    }
    if (commandPaths.some(isPnpmGlobal)) {
      return packageManager(
        "pnpm",
        "pnpm global",
        "pnpm",
        ["add", "-g", target],
        "pnpm-global",
      );
    }
    if (commandPaths.some(isYarnGlobal)) {
      return packageManager(
        "yarn",
        "yarn global",
        "yarn",
        ["global", "add", target],
        "yarn-global",
      );
    }
    if (
      path
        .basename(normalizeCommandPath(realCommandPath))
        .replace(/\.exe$/, "") === "volta-shim"
    ) {
      const voltaHome = path.dirname(path.dirname(binaryPath));
      const packageDir = path.join(
        voltaHome,
        "tools",
        "image",
        "packages",
        ...packageName.split("/"),
      );
      if (await deps.exists(packageDir)) {
        return packageManager(
          "volta",
          "Volta",
          "volta",
          ["install", target],
          "volta",
        );
      }
    }

    // npm proof names the package, so it outranks a keg the path merely
    // passes through (a Homebrew Node keeps its globals under
    // Cellar/node/<v>/lib/node_modules/, and those are npm's).
    let npmPrefix = npmGlobalPrefixFromCommandPath(
      realCommandPath,
      packageName,
    );
    if (!npmPrefix && platform === "win32") {
      const shimDirectory = path.dirname(binaryPath);
      const manifest = path.join(
        shimDirectory,
        "node_modules",
        ...packageName.split("/"),
        "package.json",
      );
      npmPrefix = (await deps.exists(manifest)) ? shimDirectory : null;
    }
    if (npmPrefix) {
      return packageManager(
        "npm",
        "npm global",
        "npm",
        [
          "install",
          "-g",
          "--prefix",
          npmPrefix,
          `--allow-scripts=${packageName}`,
          target,
        ],
        `npm-global:${normalizeCommandPath(npmPrefix)}`,
      );
    }
  }

  if (
    commandPaths.some(isMisePath) ||
    (await isMiseWrapper(realCommandPath, deps))
  ) {
    return {
      kind: "manual",
      reason:
        "Installed with mise. Update it with mise (for example `mise upgrade`).",
    };
  }

  const homebrew = homebrewOwnershipFromCommandPath(realCommandPath);
  if (homebrew) {
    if (homebrew.kind === "formula" && homebrew.name.toLowerCase() === "mise") {
      return {
        kind: "manual",
        reason:
          "Installed with mise. Update it with mise (for example `mise upgrade`).",
      };
    }
    // The keg's own brew works even when a GUI-launched app has no Homebrew
    // on PATH; the prefix check below still applies to it.
    const kegBrew = path.join(homebrew.prefix, "bin", "brew");
    const brewPath = (await deps.exists(kegBrew))
      ? kegBrew
      : await deps.which("brew", input.env.PATH).catch(() => null);
    if (!brewPath) {
      return fallback;
    }
    const brewPrefix = (
      await deps.runBrew(brewPath, ["--prefix"], input.env)
    )?.trim();
    const realBrewPrefix = brewPrefix
      ? await deps.realpath(brewPrefix).catch(() => brewPrefix)
      : null;
    if (
      !realBrewPrefix ||
      normalizeCommandPath(realBrewPrefix) !==
        normalizeCommandPath(homebrew.prefix)
    ) {
      return fallback;
    }
    const args =
      homebrew.kind === "cask"
        ? ["upgrade", "--cask", homebrew.name]
        : ["upgrade", homebrew.name];
    return {
      command: {
        args,
        display: formatCommand("brew", args, platform),
        executable: brewPath,
        lockKey: "homebrew",
      },
      homebrew: {
        brewPath,
        cask: homebrew.kind === "cask",
        name: homebrew.name,
      },
      kind: "command",
      owner: homebrew.kind === "cask" ? "homebrew-cask" : "homebrew-formula",
      ownerLabel:
        homebrew.kind === "cask"
          ? `Homebrew cask ${homebrew.name}`
          : `Homebrew formula ${homebrew.name}`,
    };
  }

  return fallback;
}

/** A launcher that runs the CLI through mise (`exec mise x codex -- codex`). */
async function isMiseWrapper(
  realCommandPath: string,
  deps: Required<OwnershipDeps>,
) {
  const size = await deps.size(realCommandPath).catch(() => Infinity);
  if (size > MISE_WRAPPER_MAX_BYTES) {
    return false;
  }
  const script = await deps.readFile(realCommandPath).catch(() => "");
  return script.startsWith("#!") && /\bmise\s+(?:x|exec)\b/.test(script);
}
