import "server-only";

import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isSafeAuthUrl } from "./terminal-command";

// A BROWSER helper for agents that open their sign-in page themselves
// (Antigravity, some ACP agents; critique G13): with BROWSER pointing at it,
// the agent's "open this URL" prints the URL behind a marker on stderr
// instead of opening a browser, and the driver shows it as a browser
// interaction. On POSIX it is a /bin/sh script, so it needs no Node
// interpreter in packaged builds, and it never evaluates the URL. Windows
// cannot use a script: CreateProcess runs a .cmd through cmd.exe, which
// splits Google's unquoted URL at every `&` (running the rest as commands)
// and fails, and Python's webbrowser then opens the real browser. There the
// helper is Sentinel's own runtime (process.execPath, Electron run as Node)
// with an inline script, as t3code does. Either way it always exits 0, and
// verifyAuthBrowserCommand proves it works before an agent relies on it.
// Marker, Node helper and preflight from t3code
// (apps/server/src/provider/antigravityAuthSupport.ts, MIT).

export const AUTH_URL_MARKER = "__SENTINEL_AUTH_URL__";

const DIRECTORY_MODE = 0o700;
const SCRIPT_MODE = 0o700;

/** The POSIX helper script (SIGPIPE ignored so it exits 0 even then). */
export function buildAuthBrowserHelperScript() {
  return {
    content: [
      "#!/bin/sh",
      "# Written by Sentinel: prints the sign-in URL an agent opens for Sentinel to show.",
      "trap '' PIPE",
      `printf '%s"%s"\\n' '${AUTH_URL_MARKER}' "$1" >&2`,
      "exit 0",
      "",
    ].join("\n"),
    fileName: "sentinel-auth-browser.sh",
  };
}

/**
 * Writes the POSIX helper into `directory` (an instance's state directory)
 * when it is missing or outdated, and returns its path.
 */
export async function ensureAuthBrowserHelper(
  directory: string,
  options: {
    fs?: {
      chmod: typeof chmod;
      mkdir: typeof mkdir;
      readFile: typeof readFile;
      writeFile: typeof writeFile;
    };
  } = {},
) {
  const fs = options.fs ?? { chmod, mkdir, readFile, writeFile };
  const { content, fileName } = buildAuthBrowserHelperScript();
  const target = path.posix.join(directory, fileName);

  const current = await fs.readFile(target, "utf8").catch(() => null);
  if (current !== content) {
    await fs.mkdir(directory, { mode: DIRECTORY_MODE, recursive: true });
    await fs.writeFile(target, content, {
      encoding: "utf8",
      mode: SCRIPT_MODE,
    });
  }
  await fs.chmod(target, SCRIPT_MODE);
  return target;
}

/** How an agent's browser reaches the helper. */
export type AuthBrowserCommand = {
  /** BROWSER's value. */
  browser: string;
  /** Variables the helper needs in the agent's env. */
  env: Record<string, string>;
  /** Runs the helper for one URL, as Python's webbrowser does. */
  executable: string;
  args(url: string): string[];
};

// Python splits BROWSER on the path separator before it parses quotes, so
// this stays free of both `:` and `;`. EPIPE still exits 0.
const NODE_HELPER_SOURCE =
  `process.stderr.on("error",()=>process.exit(0)).write(` +
  `"${AUTH_URL_MARKER}"+JSON.stringify(process.argv[process.argv.length-1])+"\\n",` +
  `()=>process.exit(0))`;

/** Python's webbrowser parses a BROWSER holding `%s` with shlex (POSIX quoting). */
function quoteBrowserArgument(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/**
 * The helper for `platform`: the /bin/sh script on POSIX (written into
 * `directory`), Sentinel's runtime with an inline script on Windows.
 */
export async function ensureAuthBrowserCommand(
  directory: string,
  options: {
    /** A Node-compatible runtime (default: this process's, as Node). */
    nodeExecutable?: string;
    platform?: NodeJS.Platform;
  } = {},
): Promise<AuthBrowserCommand> {
  const platform = options.platform ?? process.platform;
  const separator = platform === "win32" ? ";" : ":";
  let command: AuthBrowserCommand;
  if (platform === "win32") {
    const executable = options.nodeExecutable ?? process.execPath;
    command = {
      browser: [
        // shlex treats backslashes as escapes.
        executable.replaceAll("\\", "/"),
        "-e",
        NODE_HELPER_SOURCE,
        "--",
        "%s",
      ]
        .map(quoteBrowserArgument)
        .join(" "),
      env: { ELECTRON_RUN_AS_NODE: "1" },
      executable,
      args: (url) => ["-e", NODE_HELPER_SOURCE, "--", url],
    };
    if (/[\r\n\0]|%s/.test(executable)) {
      throw new Error(
        "Sentinel's runtime path cannot be used as the sign-in browser helper.",
      );
    }
  } else {
    const helper = await ensureAuthBrowserHelper(directory);
    command = {
      args: (url) => [url],
      browser: helper,
      env: {},
      executable: helper,
    };
  }
  if (command.browser.includes(separator)) {
    throw new Error(
      `The sign-in browser helper path contains "${separator}"; move Sentinel's data folder.`,
    );
  }
  return command;
}

const PREFLIGHT_URL =
  "https://example.invalid/sentinel-auth-browser-preflight?a=1&b=$(x)&c=%25";
const PREFLIGHT_TIMEOUT_MS = 5_000;
const PREFLIGHT_MAX_BYTES = 4_096;
const verified = new Map<string, Promise<void>>();

/**
 * Runs the helper once with a test URL holding `&` and `$(…)` under the
 * agent's env and requires exactly the marker line and exit 0, so a broken
 * helper fails the launch instead of letting the agent fall back to the
 * system browser. Remembered per helper once it passed.
 */
export function verifyAuthBrowserCommand(
  command: AuthBrowserCommand,
  env: Record<string, string | undefined>,
  options: { timeoutMs?: number } = {},
) {
  const key = JSON.stringify([
    command.browser,
    command.executable,
    command.env,
  ]);
  let pending = verified.get(key);
  if (!pending) {
    pending = runPreflight(command, env, options.timeoutMs);
    verified.set(key, pending);
    pending.catch(() => verified.delete(key));
  }
  return pending;
}

function runPreflight(
  command: AuthBrowserCommand,
  env: Record<string, string | undefined>,
  timeoutMs = PREFLIGHT_TIMEOUT_MS,
) {
  return new Promise<void>((resolve, reject) => {
    const failed = (detail: string) =>
      new Error(
        `Sentinel could not verify its sign-in browser helper (${detail}), so the agent was not started.`,
      );
    const child = spawn(command.executable, command.args(PREFLIGHT_URL), {
      env: { ...env, ...command.env } as NodeJS.ProcessEnv,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let overflow = false;
    const collect = (append: (text: string) => void) => (chunk: Buffer) => {
      if (stdout.length + stderr.length + chunk.length > PREFLIGHT_MAX_BYTES) {
        overflow = true;
        child.kill("SIGKILL");
        return;
      }
      append(chunk.toString("utf8"));
    };
    child.stdout.on(
      "data",
      collect((text) => {
        stdout += text;
      }),
    );
    child.stderr.on(
      "data",
      collect((text) => {
        stderr += text;
      }),
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(failed("timed out"));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(failed(error.message));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (
        code === 0 &&
        !overflow &&
        stdout === "" &&
        stderr === `${AUTH_URL_MARKER}"${PREFLIGHT_URL}"\n`
      ) {
        resolve();
      } else {
        reject(failed(`unexpected output, exit ${code ?? "signal"}`));
      }
    });
  });
}

/** The variables that route an agent's browser through the helper. */
export function authBrowserEnv(helperPath: string) {
  return { BROWSER: helperPath };
}

/**
 * The sign-in URL in one line of an agent's stderr, or null. Only https
 * (or loopback http) URLs are taken.
 */
export function parseAuthBrowserMarker(line: string) {
  const index = line.indexOf(AUTH_URL_MARKER);
  if (index === -1) {
    return null;
  }

  const rest = line.slice(index + AUTH_URL_MARKER.length).trim();
  const end = rest.lastIndexOf('"');
  if (!rest.startsWith('"') || end <= 0) {
    return null;
  }

  const url = rest.slice(1, end).trim();
  return isSafeAuthUrl(url) ? url : null;
}
