import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";

const CODEX_PATH_START_MARKER = "__SENTINEL_CODEX_PATH_START__";
const CODEX_PATH_END_MARKER = "__SENTINEL_CODEX_PATH_END__";
const SHELL_PATH_START_MARKER = "__SENTINEL_PATH_START__";
const SHELL_PATH_END_MARKER = "__SENTINEL_PATH_END__";
const CODEX_RESOLUTION_CACHE_TTL_MS = 15_000;

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

function buildInteractiveShellLookupArgs(shellPath: string, script: string) {
  const shellName = path.basename(shellPath).toLowerCase();

  if (shellName === "fish") {
    return ["-i", "-c", script];
  }

  return ["-i", "-c", script];
}

function buildShellLookupScript() {
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

async function resolveCodexCliFromShell() {
  if (process.platform === "win32") {
    return null;
  }

  const shellPath = process.env.SHELL?.trim() || "/bin/zsh";

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      shellPath,
      buildInteractiveShellLookupArgs(shellPath, buildShellLookupScript()),
      {
        env: {
          ...process.env,
          HOME: process.env.HOME ?? os.homedir(),
          TERM: process.env.TERM ?? "dumb",
        },
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
    const directCommand = await findExecutableInPath("codex", process.env.PATH);
    if (directCommand) {
      return {
        command: directCommand,
        env: process.env,
      } satisfies ResolvedCodexCli;
    }

    return await resolveCodexCliFromShell();
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

export async function readCodexCliVersion() {
  const resolvedCli = await resolveCodexCli();
  if (!resolvedCli) {
    return null;
  }

  return await new Promise<string>((resolve, reject) => {
    execFile(
      resolvedCli.command,
      ["--version"],
      { env: resolvedCli.env },
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

export async function spawnCodexCli(args: string[]) {
  const resolvedCli = await resolveCodexCli();
  if (!resolvedCli) {
    throw new Error("Codex CLI is not installed or not available on PATH.");
  }

  return spawn(resolvedCli.command, args, {
    env: resolvedCli.env,
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;
}
