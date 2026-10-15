import "server-only";

import { execFile as nodeExecFile } from "node:child_process";
import path from "node:path";

import { getPlatformHomeDirectory } from "@/lib/runtime/platform-paths";

// GUI apps start with launchd's minimal PATH, so a CLI installed through a
// version manager, Homebrew or a shell rc file is often only visible to the
// user's login shell. The lookup runs `<shell> -l -c <script>`, which prints
// `command -v <cmd>` and the shell's PATH between markers so rc-file noise
// (banners, prompts) cannot be mistaken for either.

export type LoginShellMarkers = {
  commandEnd: string;
  commandStart: string;
  pathEnd: string;
  pathStart: string;
};

export type LoginShellLookup = {
  commandPath: string | null;
  pathValue: string | null;
  shellPath: string;
};

export type ExecFileLike = (
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    windowsHide?: boolean;
    windowsVerbatimArguments?: boolean;
  },
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => unknown;

export const LOGIN_SHELL_LOOKUP_TIMEOUT_MS = 1_200;

/** `__SENTINEL_<NAME>_PATH_START__` and `__SENTINEL_<NAME>_SHELL_PATH_START__`. */
export function getLoginShellMarkers(name: string): LoginShellMarkers {
  const key = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return {
    commandEnd: `__SENTINEL_${key}_PATH_END__`,
    commandStart: `__SENTINEL_${key}_PATH_START__`,
    pathEnd: `__SENTINEL_${key}_SHELL_PATH_END__`,
    pathStart: `__SENTINEL_${key}_SHELL_PATH_START__`,
  };
}

function isFishShell(shellPath: string) {
  return path.basename(shellPath).toLowerCase().startsWith("fish");
}

/**
 * The lookup script for a POSIX shell (bash, zsh, sh) or fish. `command`
 * must be a bare command name.
 */
export function buildLoginShellLookupScript(
  command: string,
  options: { fish: boolean; markers: LoginShellMarkers },
) {
  if (!/^[A-Za-z0-9._-]+$/.test(command)) {
    throw new Error(`Not a bare command name: ${command}`);
  }

  const { markers } = options;
  return options.fish
    ? [
        `if command -v ${command} >/dev/null 2>/dev/null`,
        `  printf '%s\\n' '${markers.commandStart}'`,
        `  command -v ${command}`,
        `  printf '%s\\n' '${markers.commandEnd}'`,
        "end",
        `printf '%s\\n' '${markers.pathStart}'`,
        "printf '%s\\n' (string join : -- $PATH)",
        `printf '%s\\n' '${markers.pathEnd}'`,
      ].join("\n")
    : [
        `if command -v ${command} >/dev/null 2>&1; then`,
        `  printf '%s\\n' '${markers.commandStart}'`,
        `  command -v ${command}`,
        `  printf '%s\\n' '${markers.commandEnd}'`,
        "fi",
        `printf '%s\\n' '${markers.pathStart}'`,
        `printf '%s\\n' "$PATH"`,
        `printf '%s\\n' '${markers.pathEnd}'`,
      ].join("\n");
}

/**
 * Reads the command path and PATH between their marker lines. With
 * `commandBasenamePrefix`, only a reported path whose file name starts with
 * it counts (`command -v` also prints aliases and functions).
 */
export function parseLoginShellLookupOutput(
  stdout: string,
  options: {
    commandBasenamePrefix?: string | null;
    markers: LoginShellMarkers;
  },
): Omit<LoginShellLookup, "shellPath"> {
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

  const prefix = options.commandBasenamePrefix ?? null;
  const commandBlock = readBlock(
    options.markers.commandStart,
    options.markers.commandEnd,
  );
  const commandPath =
    commandBlock.find((line) =>
      prefix ? path.basename(line).startsWith(prefix) : Boolean(line),
    ) ?? null;
  const pathValue =
    readBlock(options.markers.pathStart, options.markers.pathEnd).find(
      Boolean,
    ) ?? null;

  return { commandPath, pathValue };
}

/**
 * Shells to try: the user's ($SHELL, else zsh), optionally followed by
 * fallbacks for a $SHELL that is missing or broken.
 */
export function getLoginShellCandidates(
  env: Record<string, string | undefined>,
  fallbacks: readonly string[] = [],
) {
  const userShell = env.SHELL?.trim();
  return [
    ...new Set(
      [userShell || (fallbacks.length > 0 ? null : "/bin/zsh"), ...fallbacks]
        .map((candidate) => candidate?.trim())
        .filter((candidate): candidate is string => Boolean(candidate)),
    ),
  ];
}

export type LoginShellLookupOptions = {
  command: string;
  commandBasenamePrefix?: string | null;
  env?: Record<string, string | undefined>;
  execFile?: ExecFileLike;
  markers?: LoginShellMarkers;
  platform?: NodeJS.Platform;
  /** Shells tried in order (default: the user's shell). */
  shells?: readonly string[];
  /**
   * When a shell's answer is good enough to stop: it reported the command,
   * or it reported the command or at least its PATH.
   */
  stopWhen?: "command" | "command-or-path";
  timeoutMs?: number;
};

function runShell(
  execFile: ExecFileLike,
  shellPath: string,
  script: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
) {
  return new Promise<string>((resolve) => {
    try {
      const child = execFile(
        shellPath,
        ["-l", "-c", script],
        { env, timeout: timeoutMs, windowsHide: true },
        // A shell that timed out or exited non-zero (a failing rc file) may
        // still have printed complete marker blocks.
        (_error, stdout) => resolve(String(stdout ?? "")),
      ) as { on?: (event: "error", listener: () => void) => void } | undefined;
      child?.on?.("error", () => resolve(""));
    } catch {
      resolve("");
    }
  });
}

/**
 * Asks login shells where `command` is. Null on Windows, or when no shell
 * gave a usable answer.
 */
export async function lookupInLoginShell(
  options: LoginShellLookupOptions,
): Promise<LoginShellLookup | null> {
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    return null;
  }

  const baseEnv = options.env ?? process.env;
  const env = {
    ...baseEnv,
    HOME: getPlatformHomeDirectory({
      env: baseEnv as NodeJS.ProcessEnv,
      platform,
    }),
    TERM: baseEnv.TERM ?? "dumb",
  } as unknown as NodeJS.ProcessEnv;
  const markers = options.markers ?? getLoginShellMarkers(options.command);
  const execFile = options.execFile ?? (nodeExecFile as ExecFileLike);
  const shells = options.shells ?? getLoginShellCandidates(baseEnv);
  const stopWhen = options.stopWhen ?? "command";

  for (const shellPath of shells) {
    const stdout = await runShell(
      execFile,
      shellPath,
      buildLoginShellLookupScript(options.command, {
        fish: isFishShell(shellPath),
        markers,
      }),
      env,
      options.timeoutMs ?? LOGIN_SHELL_LOOKUP_TIMEOUT_MS,
    );
    const parsed = parseLoginShellLookupOutput(stdout, {
      commandBasenamePrefix: options.commandBasenamePrefix,
      markers,
    });

    if (
      parsed.commandPath ||
      (stopWhen === "command-or-path" && parsed.pathValue)
    ) {
      return { ...parsed, shellPath };
    }
  }

  return null;
}
