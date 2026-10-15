import { spawn } from "node:child_process";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import path from "node:path";
import type {
  SpawnedProcess,
  SpawnOptions,
} from "@anthropic-ai/claude-agent-sdk";

// How Sentinel launches the user's Claude Code CLI.
//
// Since 0.2.113 the Agent SDK spawns `pathToClaudeCodeExecutable` directly
// unless the path ends in .js/.mjs/.ts/.tsx/.jsx, in which case it runs it with
// `node`/`bun` from PATH. Desktop builds often have neither `node` on PATH nor
// a way to run an npm `claude` shim's `#!/usr/bin/env node` shebang, so Node
// scripts run under the server's own runtime (Electron with
// ELECTRON_RUN_AS_NODE=1 in packaged builds). Native binaries are left to the
// SDK, which spawns them itself.

const NODE_SCRIPT_EXTENSIONS = new Set([".cjs", ".js", ".mjs"]);
// Commands the SDK uses when it decides the executable is a JS file.
const SDK_SCRIPT_RUNTIME_COMMANDS = new Set(["bun", "node"]);
const SHEBANG_PROBE_BYTES = 256;

type ClaudeCliEnv = { [envVar: string]: string | undefined };

export type ClaudeCliLaunch = {
  args: string[];
  command: string;
  env: ClaudeCliEnv;
};

export type ReadExecutableHead = (filePath: string) => string | null;

export function readExecutableHead(filePath: string): string | null {
  let fd: number | null = null;

  try {
    fd = openSync(filePath, "r");
    const buffer = Buffer.alloc(SHEBANG_PROBE_BYTES);
    const bytesRead = readSync(fd, buffer, 0, SHEBANG_PROBE_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // Ignore close failures on a probe read.
      }
    }
  }
}

/**
 * Whether `filePath` is a JavaScript entry point that needs a Node runtime: a
 * .js/.mjs/.cjs file, or a script whose shebang runs `node` (the npm
 * `@anthropic-ai/claude-code` shim, `#!/usr/bin/env node`).
 */
export function isClaudeNodeScript(
  filePath: string,
  readHead: ReadExecutableHead = readExecutableHead,
) {
  if (NODE_SCRIPT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return true;
  }

  const head = readHead(filePath);
  if (!head?.startsWith("#!")) {
    return false;
  }

  const interpreterLine = head.slice(2).split(/\r?\n/, 1)[0] ?? "";
  return interpreterLine
    .trim()
    .split(/\s+/)
    .some((token) => path.posix.basename(token) === "node");
}

function withNodeRuntimeEnv(env: ClaudeCliEnv): ClaudeCliEnv {
  // process.execPath is the Electron binary in packaged builds; this makes it
  // behave as plain Node. It is a no-op for node/bun in dev and tests.
  return { ...env, ELECTRON_RUN_AS_NODE: "1" };
}

/**
 * Builds the process to run for a Claude CLI invocation. Node scripts run
 * under `process.execPath`; anything else (the native binary, shell wrappers)
 * is spawned as-is.
 */
export function buildClaudeCliLaunch(
  input: ClaudeCliLaunch,
  readHead: ReadExecutableHead = readExecutableHead,
): ClaudeCliLaunch {
  if (SDK_SCRIPT_RUNTIME_COMMANDS.has(input.command)) {
    return {
      args: input.args,
      command: process.execPath,
      env: withNodeRuntimeEnv(input.env),
    };
  }

  if (isClaudeNodeScript(input.command, readHead)) {
    return {
      args: [input.command, ...input.args],
      command: process.execPath,
      env: withNodeRuntimeEnv(input.env),
    };
  }

  return input;
}

/**
 * `spawnClaudeCodeProcess` for a Claude CLI that is a Node script. The SDK
 * hands us either `node`/`bun` plus the script path (for .js paths) or the
 * script itself (for an extension-less npm shim); both run under
 * `process.execPath`.
 */
export function createClaudeNodeScriptSpawner(options?: {
  onStderr?: (data: string) => void;
}) {
  return (spawnOptions: SpawnOptions): SpawnedProcess => {
    const launch = buildClaudeCliLaunch({
      args: spawnOptions.args,
      command: spawnOptions.command,
      env: spawnOptions.env,
    });
    const child = spawn(launch.command, launch.args, {
      cwd: spawnOptions.cwd,
      env: launch.env as NodeJS.ProcessEnv,
      // A forwarded signal: the SDK aborts it only after its graceful
      // stdin-EOF shutdown window, so it is safe to hand to spawn().
      signal: spawnOptions.signal,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    // Always drain stderr so a chatty CLI cannot block on a full pipe.
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data: string) => {
      options?.onStderr?.(data);
    });

    return child;
  };
}

// Windows npm launcher shims, ported from t3code
// (apps/server/src/provider/Drivers/ClaudeExecutable.ts, MIT). Node cannot
// spawn .cmd/.bat/.ps1 files without a shell (`spawn EINVAL` since Node
// 20.12) and the SDK offers no shell fallback, so follow the shim to the real
// package entry instead.
const WINDOWS_SHIM_EXTENSIONS = new Set([".bat", ".cmd", ".ps1"]);
const NPM_PACKAGE_ENTRY_CANDIDATES = [
  // Newer @anthropic-ai/claude-code packages ship a native binary.
  ["node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"],
  // Older ones only ship cli.js.
  ["node_modules", "@anthropic-ai", "claude-code", "cli.js"],
] as const;

function isExistingFile(filePath: string) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function isWindowsClaudeLauncherShimPath(filePath: string) {
  return WINDOWS_SHIM_EXTENSIONS.has(
    path.win32.extname(filePath).toLowerCase(),
  );
}

/**
 * On Windows, resolves an npm `claude.cmd` (or .bat/.ps1) shim to the package
 * entry it launches. Other paths and platforms are returned unchanged, as is a
 * shim with no known entry next to it.
 */
export function resolveClaudeWindowsLauncherShim(
  filePath: string,
  options?: {
    isFile?: (candidatePath: string) => boolean;
    platform?: NodeJS.Platform;
  },
) {
  const platform = options?.platform ?? process.platform;
  if (platform !== "win32" || !isWindowsClaudeLauncherShimPath(filePath)) {
    return filePath;
  }

  const isFile = options?.isFile ?? isExistingFile;
  const shimDirectory = path.win32.dirname(filePath);
  for (const entrySegments of NPM_PACKAGE_ENTRY_CANDIDATES) {
    const candidate = path.win32.join(shimDirectory, ...entrySegments);
    if (isFile(candidate)) {
      return candidate;
    }
  }

  return filePath;
}
