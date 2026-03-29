import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";

import { setLocalRuntimeEnvValue } from "@/lib/runtime/local-runtime-env";

const CODEX_PATH_START_MARKER = "__SENTINEL_CODEX_PATH_START__";
const CODEX_PATH_END_MARKER = "__SENTINEL_CODEX_PATH_END__";
const SHELL_PATH_START_MARKER = "__SENTINEL_PATH_START__";
const SHELL_PATH_END_MARKER = "__SENTINEL_PATH_END__";
const CODEX_RESOLUTION_CACHE_TTL_MS = 15_000;
const SHELL_LOOKUP_TIMEOUT_MS = 1_200;
const CLI_VERSION_TIMEOUT_MS = 1_200;

type ShellLookupResult = {
  codexPath: string | null;
  pathValue: string | null;
};

export type ResolvedCodexCli = {
  command: string;
  env: NodeJS.ProcessEnv;
};

let cachedResolution: {
  expiresAt: number;
  promise: Promise<ResolvedCodexCli | null>;
} | null = null;

async function persistResolvedCodexCli(command: string | null) {
  try {
    await setLocalRuntimeEnvValue("SENTINEL_CODEX_PATH", command);
  } catch {}
}

function getExecutableNames(command: string) {
  if (process.platform !== "win32") {
    return [command];
  }

  const pathExt = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);

  const names = new Set<string>([command]);
  const lowerCommand = command.toLowerCase();
  for (const extension of pathExt) {
    if (lowerCommand.endsWith(extension.toLowerCase())) {
      continue;
    }

    names.add(`${command}${extension}`);
  }

  return [...names];
}

async function isExecutable(candidatePath: string) {
  try {
    await access(
      candidatePath,
      process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

async function findExecutableInPath(
  command: string,
  pathValue?: string | null,
) {
  if (!pathValue) {
    return null;
  }

  const searchPaths = pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const directory of searchPaths) {
    for (const executableName of getExecutableNames(command)) {
      const candidatePath = path.join(directory, executableName);
      if (await isExecutable(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

function getPreferredPathValue(pathValue?: string | null) {
  const homePath = process.env.HOME ?? os.homedir();
  const candidateEntries =
    process.platform === "win32"
      ? []
      : [
          path.join(homePath, ".bun", "bin"),
          path.join(homePath, ".local", "bin"),
          path.join(homePath, "bin"),
          path.join(homePath, ".volta", "bin"),
          path.join(homePath, ".asdf", "shims"),
          path.join(homePath, ".nodenv", "shims"),
          path.join(homePath, ".nvm", "current", "bin"),
          path.join(homePath, ".fnm", "current", "bin"),
          path.join(homePath, "Library", "pnpm"),
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/opt/local/bin",
          "/usr/bin",
          "/bin",
        ];
  const entries = [
    ...(pathValue ?? "")
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean),
    ...candidateEntries,
  ];

  return Array.from(new Set(entries)).join(path.delimiter);
}

async function listSubdirectories(rootPath: string) {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootPath, entry.name));
  } catch {
    return [];
  }
}

async function getManagedPathValue(pathValue?: string | null) {
  const homePath = process.env.HOME ?? os.homedir();
  const managedEntries =
    process.platform === "win32"
      ? []
      : [
          ...(
            await listSubdirectories(
              path.join(homePath, ".nvm", "versions", "node"),
            )
          ).map((directory) => path.join(directory, "bin")),
          ...(
            await listSubdirectories(
              path.join(homePath, ".fnm", "node-versions"),
            )
          ).map((directory) => path.join(directory, "installation", "bin")),
          ...(
            await listSubdirectories(
              path.join(homePath, ".local", "share", "fnm", "node-versions"),
            )
          ).map((directory) => path.join(directory, "installation", "bin")),
        ];

  return getPreferredPathValue(
    [pathValue, ...managedEntries].filter(Boolean).join(path.delimiter),
  );
}

function buildLoginShellLookupArgs(script: string) {
  return ["-l", "-c", script];
}

function buildPosixShellLookupScript() {
  return [
    "if ! command -v codex >/dev/null 2>&1; then",
    "  exit 1",
    "fi",
    `printf '%s\\n' '${CODEX_PATH_START_MARKER}'`,
    "command -v codex",
    `printf '%s\\n' '${CODEX_PATH_END_MARKER}'`,
    `printf '%s\\n' '${SHELL_PATH_START_MARKER}'`,
    `printf '%s\\n' \"$PATH\"`,
    `printf '%s\\n' '${SHELL_PATH_END_MARKER}'`,
  ].join("\n");
}

function buildFishShellLookupScript() {
  return [
    "if not command -v codex >/dev/null 2>/dev/null",
    "  exit 1",
    "end",
    `printf '%s\\n' '${CODEX_PATH_START_MARKER}'`,
    "command -v codex",
    `printf '%s\\n' '${CODEX_PATH_END_MARKER}'`,
    `printf '%s\\n' '${SHELL_PATH_START_MARKER}'`,
    "printf '%s\\n' (string join : -- $PATH)",
    `printf '%s\\n' '${SHELL_PATH_END_MARKER}'`,
  ].join("\n");
}

export function parseShellLookupOutput(stdout: string): ShellLookupResult {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const readBlock = (startMarker: string, endMarker: string) => {
    const startIndex = lines.indexOf(startMarker);
    const endIndex = lines.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return [];
    }

    return lines.slice(startIndex + 1, endIndex);
  };

  const codexPathBlock = readBlock(
    CODEX_PATH_START_MARKER,
    CODEX_PATH_END_MARKER,
  );
  const pathBlock = readBlock(SHELL_PATH_START_MARKER, SHELL_PATH_END_MARKER);

  const codexPath =
    codexPathBlock.find((line) => path.basename(line).startsWith("codex")) ??
    null;
  const pathValue = pathBlock.find(Boolean) ?? null;

  return {
    codexPath,
    pathValue,
  };
}

async function resolveCodexCliFromWindowsWhere() {
  if (process.platform !== "win32") {
    return null;
  }

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile("where", ["codex"], { env: process.env }, (error, output) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(output.trim());
    });
  }).catch(() => null);

  if (!stdout) {
    return null;
  }

  const candidates = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const candidatePath of candidates) {
    if (await isExecutable(candidatePath)) {
      return {
        command: candidatePath,
        env: process.env,
      } satisfies ResolvedCodexCli;
    }
  }

  return null;
}

async function resolveCodexCliFromShell() {
  if (process.platform === "win32") {
    return null;
  }

  const shellPath = process.env.SHELL?.trim() || "/bin/zsh";
  const shellName = path.basename(shellPath).toLowerCase();
  const shellLookupScript =
    shellName === "fish"
      ? buildFishShellLookupScript()
      : buildPosixShellLookupScript();

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      shellPath,
      buildLoginShellLookupArgs(shellLookupScript),
      {
        env: {
          ...process.env,
          HOME: process.env.HOME ?? os.homedir(),
          TERM: process.env.TERM ?? "dumb",
        },
        timeout: SHELL_LOOKUP_TIMEOUT_MS,
      },
      (error, shellStdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(shellStdout.trim());
      },
    );
  }).catch(() => null);

  if (!stdout) {
    return null;
  }

  const { codexPath, pathValue } = parseShellLookupOutput(stdout);
  const resolvedCommand =
    (codexPath && (await isExecutable(codexPath)) ? codexPath : null) ??
    (await findExecutableInPath("codex", pathValue));

  if (!resolvedCommand) {
    return null;
  }

  return {
    command: resolvedCommand,
    env: pathValue
      ? {
          ...process.env,
          PATH: pathValue,
        }
      : process.env,
  } satisfies ResolvedCodexCli;
}

export async function resolveCodexCli(options?: { forceRefresh?: boolean }) {
  const forceRefresh = options?.forceRefresh ?? false;
  const now = Date.now();

  if (!forceRefresh && cachedResolution && cachedResolution.expiresAt > now) {
    return await cachedResolution.promise;
  }

  const promise = (async () => {
    const preferredPath = await getManagedPathValue(process.env.PATH);
    const overridePath =
      process.env.SENTINEL_CODEX_PATH?.trim() || process.env.CODEX_PATH?.trim();
    if (overridePath && (await isExecutable(overridePath))) {
      const resolvedCli = {
        command: overridePath,
        env: {
          ...process.env,
          PATH: preferredPath,
        },
      } satisfies ResolvedCodexCli;
      await persistResolvedCodexCli(resolvedCli.command);
      return resolvedCli;
    }

    const directCommand = await findExecutableInPath("codex", preferredPath);
    if (directCommand) {
      const resolvedCli = {
        command: directCommand,
        env: {
          ...process.env,
          PATH: preferredPath,
        },
      } satisfies ResolvedCodexCli;
      await persistResolvedCodexCli(resolvedCli.command);
      return resolvedCli;
    }

    const windowsWhereCommand = await resolveCodexCliFromWindowsWhere();
    if (windowsWhereCommand) {
      await persistResolvedCodexCli(windowsWhereCommand.command);
      return windowsWhereCommand;
    }

    const shellResolution = await resolveCodexCliFromShell();
    await persistResolvedCodexCli(shellResolution?.command ?? null);
    return shellResolution;
  })();

  cachedResolution = {
    expiresAt: now + CODEX_RESOLUTION_CACHE_TTL_MS,
    promise,
  };

  return await promise;
}

export function resetCodexCliResolutionCache() {
  cachedResolution = null;
}

export async function readCodexCliVersion(
  resolvedCliInput?: ResolvedCodexCli | null,
) {
  const resolvedCli = resolvedCliInput ?? (await resolveCodexCli());
  if (!resolvedCli) {
    return null;
  }

  return await new Promise<string>((resolve, reject) => {
    execFile(
      resolvedCli.command,
      ["--version"],
      { env: resolvedCli.env, timeout: CLI_VERSION_TIMEOUT_MS },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout.trim());
      },
    );
  }).catch(() => null);
}

export async function spawnCodexCli(
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
) {
  const resolvedCli = await resolveCodexCli();
  if (!resolvedCli) {
    throw new Error("Codex CLI is not installed or not available on PATH.");
  }

  return spawn(resolvedCli.command, args, {
    cwd: options?.cwd,
    env: {
      ...resolvedCli.env,
      ...(options?.env ?? {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;
}
