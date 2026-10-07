import "server-only";

import { execFile as nodeExecFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access as nodeAccess,
  realpath as nodeRealpath,
} from "node:fs/promises";
import path from "node:path";

import { setLocalRuntimeEnvValue } from "@/lib/runtime/local-runtime-env";
import { buildManagedExecutablePathValue } from "@/lib/runtime/platform-paths";

import type {
  EngineInstallSource,
  ResolvedEngineInstance,
} from "../../contract";
import {
  lookupInLoginShell,
  type ExecFileLike,
  type LoginShellLookup,
  type LoginShellLookupOptions,
} from "./login-shell";
import { getRuntimePathsStore, type RuntimePathsStore } from "./paths-cache";

// Binary discovery shared by every engine. The order of the usual pipeline:
//   1. the instance's configured binaryPath           (source "config")
//   2. SENTINEL_<X>_PATH-style variables, default instance only ("env")
//   3. the managed PATH: PATH plus version-manager and
//      package-manager bin directories                  ("managed-path")
//   4. `where` on Windows, the login shell elsewhere    ("login-shell")
// with an optional verification (version probe) of each candidate. The
// engines that predate the platform keep their own step order through the
// same steps (see each engine's resolve<X>Runtime). Resolved binaries are
// recorded per instance in <state root>/engines/runtime-paths.json; the
// legacy engines also keep their SENTINEL_<X>_PATH hint in desktop.env for
// the default instance.

export type ProcessEnv = Record<string, string | undefined>;

/**
 * How a bare command maps to file names on Windows:
 * - "spawnable": PATHEXT names Node can spawn (.exe/.cmd/.bat/.com); skips
 *   npm's extensionless sh script, which Windows cannot run.
 * - "pathext": every PATHEXT name, never the bare name.
 * - "pathext-or-bare": the bare name, then every PATHEXT name.
 * POSIX always uses the bare name.
 */
export type WindowsExecutableNames =
  "pathext" | "pathext-or-bare" | "spawnable";

const WINDOWS_SPAWNABLE_EXTENSIONS = new Set([".bat", ".cmd", ".com", ".exe"]);
const DEFAULT_PATHEXT = ".EXE;.CMD;.BAT;.COM";

export type ExecutableNameOptions = {
  pathExt?: string;
  platform?: NodeJS.Platform;
  strategy?: WindowsExecutableNames;
};

function parsePathExt(value: string) {
  return value
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);
}

export function getExecutableNames(
  command: string,
  options: ExecutableNameOptions = {},
) {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") {
    return [command];
  }

  const strategy = options.strategy ?? "spawnable";
  const lowerCommand = command.toLowerCase();

  if (strategy === "spawnable") {
    if (WINDOWS_SPAWNABLE_EXTENSIONS.has(path.extname(command).toLowerCase())) {
      return [command];
    }

    const pathExt = parsePathExt(
      options.pathExt ?? process.env.PATHEXT ?? "",
    ).filter((extension) =>
      WINDOWS_SPAWNABLE_EXTENSIONS.has(extension.toLowerCase()),
    );
    const extensions =
      pathExt.length > 0 ? pathExt : parsePathExt(DEFAULT_PATHEXT);
    return [
      ...new Set(extensions.map((extension) => `${command}${extension}`)),
    ];
  }

  const pathExt = parsePathExt(
    options.pathExt ?? process.env.PATHEXT ?? DEFAULT_PATHEXT,
  );

  if (strategy === "pathext") {
    if (
      pathExt.some((extension) =>
        lowerCommand.endsWith(extension.toLowerCase()),
      )
    ) {
      return [command];
    }
    return pathExt.map((extension) => `${command}${extension}`);
  }

  const names = new Set<string>([command]);
  for (const extension of pathExt) {
    if (!lowerCommand.endsWith(extension.toLowerCase())) {
      names.add(`${command}${extension}`);
    }
  }
  return [...names];
}

export type FileAccess = (target: string, mode: number) => Promise<void>;

export type BinaryFsDeps = {
  access?: FileAccess;
  cwd?: () => string;
  platform?: NodeJS.Platform;
};

/** Resolves a relative candidate against the working directory. */
export function normalizeCandidatePath(
  candidatePath: string,
  options: Pick<BinaryFsDeps, "cwd"> = {},
) {
  const trimmed = candidatePath.trim();
  if (!trimmed) {
    return null;
  }

  return path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve((options.cwd ?? (() => process.cwd()))(), trimmed);
}

/** X_OK on POSIX; on Windows any existing file (PATHEXT decides). */
export async function isExecutableFile(
  candidatePath: string,
  options: BinaryFsDeps = {},
) {
  const platform = options.platform ?? process.platform;
  try {
    await (options.access ?? nodeAccess)(
      candidatePath,
      platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

/** Readable regardless of the execute bit (Node scripts run under node). */
export async function isReadableFile(
  candidatePath: string,
  options: Pick<BinaryFsDeps, "access"> = {},
) {
  try {
    await (options.access ?? nodeAccess)(candidatePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/** The first `command` file in a PATH value; relative entries resolve against cwd. */
export async function findExecutableInPath(
  command: string,
  pathValue: string | null | undefined,
  options: BinaryFsDeps & ExecutableNameOptions = {},
) {
  if (!pathValue) {
    return null;
  }

  const directories = pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const names = getExecutableNames(command, options);

  for (const directory of directories) {
    const absoluteDirectory = path.isAbsolute(directory)
      ? directory
      : path.resolve((options.cwd ?? (() => process.cwd()))(), directory);
    for (const name of names) {
      const candidatePath = path.join(absoluteDirectory, name);
      if (await isExecutableFile(candidatePath, options)) {
        return candidatePath;
      }
    }
  }

  return null;
}

/**
 * The runnable file for a known path: the path itself, or on Windows its
 * PATHEXT sibling (`%APPDATA%\npm\codex` → `codex.cmd`). `where codex` and a
 * remembered path can both name npm's extensionless shim.
 */
export async function resolveRunnablePath(
  candidatePath: string,
  options: BinaryFsDeps & ExecutableNameOptions = {},
) {
  for (const executablePath of getExecutableNames(candidatePath, options)) {
    if (await isExecutableFile(executablePath, options)) {
      return executablePath;
    }
  }

  return null;
}

/** `where <command>` on Windows; [] elsewhere or when it fails. */
export async function listWindowsWhereCandidates(
  command: string,
  options: {
    env?: ProcessEnv;
    execFile?: ExecFileLike;
    platform?: NodeJS.Platform;
  } = {},
) {
  if ((options.platform ?? process.platform) !== "win32") {
    return [];
  }

  const execFile = options.execFile ?? (nodeExecFile as ExecFileLike);
  const stdout = await new Promise<string>((resolve) => {
    try {
      execFile(
        "where",
        [command],
        {
          env: (options.env ?? process.env) as NodeJS.ProcessEnv,
          windowsHide: true,
        },
        (error, output) => resolve(error ? "" : String(output ?? "")),
      );
    } catch {
      resolve("");
    }
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * fnm creates a per-shell symlink directory (fnm_multishells/<id>) that
 * disappears with the shell, so such paths are used but never remembered.
 */
export function isPersistableBinaryPath(binaryPath: string) {
  return !binaryPath.replaceAll("\\", "/").includes("/fnm_multishells/");
}

export type EngineBinaryInstance = Pick<
  ResolvedEngineInstance,
  "config" | "envOverrides" | "envUnset" | "id" | "isDefault"
>;

/**
 * The environment a legacy engine resolves and runs with: process.env as it
 * is now, minus the variables the instance cannot decrypt, plus the
 * instance's own variables (home directory, instance env). Without an
 * instance, process.env itself.
 */
export function getInstanceProcessEnv(
  instance:
    Pick<EngineBinaryInstance, "envOverrides" | "envUnset"> | null | undefined,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (!instance) {
    return baseEnv;
  }

  const env: NodeJS.ProcessEnv = { ...baseEnv };
  for (const name of instance.envUnset) {
    delete env[name];
  }
  return Object.assign(env, instance.envOverrides);
}

/**
 * Cache and resource key for an instance's runtime: "default" for no
 * instance or a default instance without its own binary or variables (both
 * resolve exactly like the engine did before instances), else the instance
 * id with a digest of what shapes its runtime, so a configuration change gets
 * a fresh runtime.
 */
export function getInstanceRuntimeKey(
  instance:
    | Pick<
        EngineBinaryInstance,
        "config" | "envOverrides" | "envUnset" | "id" | "isDefault"
      >
    | null
    | undefined,
) {
  if (!instance) {
    return "default";
  }

  const binaryPath = instance.config.binaryPath?.trim() || null;
  const customized =
    binaryPath !== null ||
    Object.keys(instance.envOverrides).length > 0 ||
    instance.envUnset.length > 0;
  if (instance.isDefault && !customized) {
    return "default";
  }

  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        binaryPath,
        Object.entries(instance.envOverrides).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
        [...instance.envUnset].sort(),
      ]),
    )
    .digest("hex")
    .slice(0, 16);
  return `${instance.id}:${digest}`;
}

/** First non-empty value among `keys`, as the legacy engines read it. */
export function readEnvOverride(
  env: ProcessEnv,
  keys: readonly string[],
): { key: string; path: string } | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return { key, path: value };
    }
  }
  return null;
}

/**
 * The binary an instance is configured to run before any discovery: its
 * binaryPath, else (default instance only) the first legacy override
 * variable set in `env`.
 */
export function getConfiguredBinaryOverride(
  instance:
    Pick<EngineBinaryInstance, "config" | "isDefault"> | null | undefined,
  env: ProcessEnv,
  legacyEnvKeys: readonly string[],
): { key: string | null; path: string; source: "config" | "env" } | null {
  const configured = instance?.config.binaryPath?.trim();
  if (configured) {
    return { key: null, path: configured, source: "config" };
  }
  if (instance && !instance.isDefault) {
    return null;
  }

  const override = readEnvOverride(env, legacyEnvKeys);
  return override
    ? { key: override.key, path: override.path, source: "env" }
    : null;
}

export type ResolvedBinary = {
  env: ProcessEnv;
  path: string;
  source: EngineInstallSource;
  version: string | null;
};

export type BinaryVerifier = (
  candidatePath: string,
  env: ProcessEnv,
) => Promise<{ path: string; version: string | null } | null>;

export type StandardBinaryResolutionOptions = BinaryFsDeps &
  ExecutableNameOptions & {
    command: string;
    /** Environment for discovery and for the resolved binary. */
    env?: ProcessEnv;
    execFile?: ExecFileLike;
    instance?: Pick<EngineBinaryInstance, "config" | "isDefault"> | null;
    legacyEnvKeys?: readonly string[];
    loginShell?: Omit<LoginShellLookupOptions, "command" | "env" | "platform">;
    /** Precomputed managed PATH (tests). */
    managedPathValue?: string;
    /** Accept and describe a candidate; null rejects it. */
    verify?: BinaryVerifier;
  };

export type StandardBinaryResolution = {
  /** A configured or override path that could not be used. */
  rejectedOverride: { path: string; source: "config" | "env" } | null;
  resolved: ResolvedBinary | null;
};

/**
 * The standard pipeline for drivers without legacy quirks: configured path,
 * legacy override (default instance), managed PATH, `where` (Windows) or the
 * login shell, each candidate checked by `verify`.
 */
export async function resolveBinaryStandard(
  options: StandardBinaryResolutionOptions,
): Promise<StandardBinaryResolution> {
  const platform = options.platform ?? process.platform;
  const baseEnv = options.env ?? process.env;
  const managedPathValue =
    options.managedPathValue ??
    (await buildManagedExecutablePathValue(baseEnv.PATH, {
      env: baseEnv as NodeJS.ProcessEnv,
      platform,
    }));
  const managedEnv = { ...baseEnv, PATH: managedPathValue };
  const fsOptions = { ...options, platform };
  const verify: BinaryVerifier =
    options.verify ??
    (async (candidatePath) => {
      const runnable = await resolveRunnablePath(candidatePath, fsOptions);
      return runnable ? { path: runnable, version: null } : null;
    });

  const accept = async (
    candidatePath: string | null,
    env: ProcessEnv,
    source: EngineInstallSource,
  ): Promise<ResolvedBinary | null> => {
    if (!candidatePath) {
      return null;
    }
    const verified = await verify(candidatePath, env);
    return verified
      ? { env, path: verified.path, source, version: verified.version }
      : null;
  };

  const override = getConfiguredBinaryOverride(
    options.instance,
    baseEnv,
    options.legacyEnvKeys ?? [],
  );
  if (override) {
    const resolved = await accept(
      normalizeCandidatePath(override.path, fsOptions),
      managedEnv,
      override.source,
    );
    if (resolved) {
      return { rejectedOverride: null, resolved };
    }
  }
  const rejectedOverride = override
    ? { path: override.path, source: override.source }
    : null;

  const fromPath = await accept(
    await findExecutableInPath(options.command, managedPathValue, fsOptions),
    managedEnv,
    "managed-path",
  );
  if (fromPath) {
    return { rejectedOverride, resolved: fromPath };
  }

  for (const candidate of await listWindowsWhereCandidates(options.command, {
    env: baseEnv,
    execFile: options.execFile,
    platform,
  })) {
    const resolved = await accept(candidate, baseEnv, "login-shell");
    if (resolved) {
      return { rejectedOverride, resolved };
    }
  }

  const lookup = await lookupInLoginShell({
    ...options.loginShell,
    command: options.command,
    env: baseEnv,
    execFile: options.execFile,
    platform,
  });
  const shellResolved = await resolveFromLoginShellLookup(lookup, {
    ...fsOptions,
    accept: (candidatePath, env) => accept(candidatePath, env, "login-shell"),
    baseEnv,
    command: options.command,
  });

  return { rejectedOverride, resolved: shellResolved };
}

/**
 * A login shell's answer as a candidate: the reported path when it is
 * executable, else `command` searched in the shell's PATH; launched with the
 * shell's PATH.
 */
export async function resolveFromLoginShellLookup(
  lookup: LoginShellLookup | null,
  options: BinaryFsDeps &
    ExecutableNameOptions & {
      accept: (
        candidatePath: string,
        env: ProcessEnv,
      ) => Promise<ResolvedBinary | null>;
      baseEnv: ProcessEnv;
      command: string;
    },
): Promise<ResolvedBinary | null> {
  if (!lookup) {
    return null;
  }

  const env = lookup.pathValue
    ? { ...options.baseEnv, PATH: lookup.pathValue }
    : options.baseEnv;
  const reported =
    lookup.commandPath && (await isExecutableFile(lookup.commandPath, options))
      ? lookup.commandPath
      : null;
  const candidate =
    reported ??
    (await findExecutableInPath(options.command, lookup.pathValue, options));

  return candidate ? await options.accept(candidate, env) : null;
}

export type RecordResolvedBinaryOptions = {
  instanceId: string;
  /** Default instance only: the legacy desktop.env key to keep in sync. */
  legacyEnvKey?: string | null;
  realpath?: (target: string) => Promise<string>;
  setLegacyEnvValue?: (key: string, value: string) => Promise<void>;
  store?: Pick<RuntimePathsStore, "get" | "set">;
};

/**
 * Remembers a resolved binary: in runtime-paths.json for the instance and,
 * for a legacy engine's default instance, as its SENTINEL_<X>_PATH (in
 * desktop.env when the path is stable, else only in this process, as the
 * legacy engines did). Best effort; never throws.
 */
export async function recordResolvedBinary(
  binary: Pick<ResolvedBinary, "path" | "source" | "version">,
  options: RecordResolvedBinaryOptions,
) {
  const persistable = isPersistableBinaryPath(binary.path);

  if (options.legacyEnvKey) {
    try {
      if (persistable) {
        await (options.setLegacyEnvValue ?? setLocalRuntimeEnvValue)(
          options.legacyEnvKey,
          binary.path,
        );
      } else {
        process.env[options.legacyEnvKey] = binary.path;
      }
    } catch {
      process.env[options.legacyEnvKey] = binary.path;
    }
  }

  if (!persistable) {
    return;
  }

  try {
    const store = options.store ?? getRuntimePathsStore();
    const realPath = await (options.realpath ?? nodeRealpath)(binary.path)
      .then((value) => (value === binary.path ? null : value))
      .catch(() => null);
    const current = await store.get(options.instanceId);
    if (
      current?.binaryPath === binary.path &&
      current.realPath === realPath &&
      current.source === binary.source &&
      current.version === binary.version
    ) {
      return;
    }
    await store.set(options.instanceId, {
      binaryPath: binary.path,
      realPath,
      source: binary.source,
      version: binary.version,
    });
  } catch {
    // The paths cache is an optimization; discovery works without it.
  }
}
