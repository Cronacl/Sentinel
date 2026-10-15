import { stat } from "node:fs/promises";
import path from "node:path";

// Embedded terminals that run one command instead of a shell: the sign-in
// commands of engine CLIs (Settings → Engines). The renderer never chooses
// what runs. It passes the launch ticket of a server-side sign-in flow with
// the command it expects; Electron main redeems the ticket with the local
// server (once; POST /api/engines/auth/terminal), refuses the request unless
// it matches what the server answers, and spawns the server's command,
// never the renderer's.

export const TERMINAL_COMMAND_REDEEM_PATH = "/api/engines/auth/terminal";
export const INTERNAL_TOKEN_HEADER = "x-sentinel-internal-token";

const TICKET_PATTERN = /^[a-f0-9]{64}$/;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
// Sentinel's own secrets never reach a child process (see spawn.ts).
const PRIVATE_ENV_KEYS = new Set(["ENCRYPTION_KEY", "SENTINEL_INTERNAL_TOKEN"]);
const LIMITS = {
  argLength: 8_192,
  args: 64,
  cols: 500,
  envEntries: 128,
  envValueLength: 32_768,
  pathLength: 4_096,
  rows: 200,
  titleLength: 128,
};
const DEFAULT_REDEEM_TIMEOUT_MS = 5_000;

const INVALID_REQUEST = "Invalid terminal command request.";
const UNAVAILABLE =
  "This sign-in command is no longer available. Start the sign-in again.";

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function fail(message = INVALID_REQUEST) {
  throw new Error(message);
}

function readString(value, maxLength, { allowEmpty = false } = {}) {
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    (!allowEmpty && value.length === 0) ||
    value.includes("\0")
  ) {
    fail();
  }
  return value;
}

function readArgs(value) {
  if (!Array.isArray(value) || value.length > LIMITS.args) {
    fail();
  }
  return value.map((arg) =>
    readString(arg, LIMITS.argLength, { allowEmpty: true }),
  );
}

function readEnv(value) {
  if (!isPlainObject(value)) {
    fail();
  }
  const entries = Object.entries(value);
  if (entries.length > LIMITS.envEntries) {
    fail();
  }
  const env = {};
  for (const [name, entryValue] of entries) {
    if (!ENV_NAME_PATTERN.test(name) || PRIVATE_ENV_KEYS.has(name)) {
      fail();
    }
    env[name] = readString(entryValue, LIMITS.envValueLength, {
      allowEmpty: true,
    });
  }
  return env;
}

function readDimension(value, max) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail();
  }
  return Math.min(max, Math.max(2, Math.floor(value)));
}

function pathFor(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

/**
 * Validates what the renderer sends: the ticket plus the command, args,
 * cwd and env it expects to run (all strings, bounded).
 *
 * @param {unknown} input
 */
export function parseTerminalCommandRequest(input) {
  if (!isPlainObject(input)) {
    fail();
  }
  const ticket = input.ticket;
  if (typeof ticket !== "string" || !TICKET_PATTERN.test(ticket)) {
    fail();
  }
  if (
    input.windowsVerbatimArguments !== undefined &&
    typeof input.windowsVerbatimArguments !== "boolean"
  ) {
    fail();
  }

  return {
    args: readArgs(input.args),
    cols: readDimension(input.cols, LIMITS.cols),
    command: readString(input.command, LIMITS.pathLength),
    cwd: readString(input.cwd, LIMITS.pathLength),
    env: readEnv(input.env),
    rows: readDimension(input.rows, LIMITS.rows),
    ticket,
    title:
      input.title === undefined
        ? null
        : readString(input.title, LIMITS.titleLength, { allowEmpty: true }),
    windowsVerbatimArguments: input.windowsVerbatimArguments === true,
  };
}

/**
 * Validates the server's answer for a ticket: an absolute command and
 * working directory, bounded args and env.
 *
 * @param {unknown} value
 * @param {NodeJS.Platform} platform
 */
export function parseTerminalCommandSpec(value, platform = process.platform) {
  if (!isPlainObject(value)) {
    fail(UNAVAILABLE);
  }
  const paths = pathFor(platform);
  const spec = {
    args: readArgs(value.args),
    command: readString(value.command, LIMITS.pathLength),
    cwd: readString(value.cwd, LIMITS.pathLength),
    env: readEnv(value.env),
    title: readString(value.title ?? "Terminal", LIMITS.titleLength, {
      allowEmpty: true,
    }),
    windowsVerbatimArguments: value.windowsVerbatimArguments === true,
  };
  if (!paths.isAbsolute(spec.command) || !paths.isAbsolute(spec.cwd)) {
    fail(UNAVAILABLE);
  }
  return spec;
}

/**
 * Asks the local server for the command a ticket stands for. The ticket is
 * spent whatever the answer.
 *
 * @param {{
 *   fetchImpl?: typeof fetch;
 *   internalToken?: string | null;
 *   platform?: NodeJS.Platform;
 *   serverUrl: string;
 *   ticket: string;
 *   timeoutMs?: number;
 * }} options
 */
export async function redeemTerminalCommandTicket({
  fetchImpl = fetch,
  internalToken = null,
  platform = process.platform,
  serverUrl,
  ticket,
  timeoutMs = DEFAULT_REDEEM_TIMEOUT_MS,
}) {
  let response;
  try {
    response = await fetchImpl(
      new URL(TERMINAL_COMMAND_REDEEM_PATH, serverUrl),
      {
        body: JSON.stringify({ ticket }),
        headers: {
          "content-type": "application/json",
          ...(internalToken ? { [INTERNAL_TOKEN_HEADER]: internalToken } : {}),
        },
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
  } catch {
    fail(UNAVAILABLE);
  }
  if (!response.ok) {
    fail(UNAVAILABLE);
  }

  return parseTerminalCommandSpec(
    await response.json().catch(() => null),
    platform,
  );
}

function sameList(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameRecord(left, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    sameList(leftKeys, rightKeys) &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

/** Throws unless the renderer asked for exactly what the server vended. */
export function assertTerminalCommandMatches(request, spec) {
  if (
    request.command !== spec.command ||
    request.cwd !== spec.cwd ||
    request.windowsVerbatimArguments !== spec.windowsVerbatimArguments ||
    !sameList(request.args, spec.args) ||
    !sameRecord(request.env, spec.env)
  ) {
    fail("The terminal command does not match the sign-in request.");
  }
}

/**
 * Main's environment (minus Sentinel's secrets), the command's variables on
 * top, and a terminal type xterm.js renders.
 *
 * @param {Record<string, string | undefined>} baseEnv
 * @param {Record<string, string>} specEnv
 * @param {NodeJS.Platform} platform
 */
export function buildTerminalCommandEnv(baseEnv, specEnv, platform) {
  const env = {};
  for (const [name, value] of Object.entries(baseEnv)) {
    if (typeof value === "string" && !PRIVATE_ENV_KEYS.has(name)) {
      env[name] = value;
    }
  }
  for (const [name, value] of Object.entries(specEnv)) {
    if (!PRIVATE_ENV_KEYS.has(name)) {
      env[name] = value;
    }
  }
  env.COLORTERM = "truecolor";
  env.TERM = platform === "win32" ? "xterm" : "xterm-256color";
  return env;
}

async function isDirectoryPath(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Everything node-pty needs to run a renderer's terminal command request,
 * after the server confirmed it.
 *
 * @param {unknown} input
 * @param {{
 *   baseEnv?: Record<string, string | undefined>;
 *   fetchImpl?: typeof fetch;
 *   internalToken?: string | null;
 *   isDirectory?: (target: string) => Promise<boolean>;
 *   platform?: NodeJS.Platform;
 *   serverUrl: string;
 * }} options
 */
export async function prepareTerminalCommand(input, options) {
  const platform = options.platform ?? process.platform;
  const request = parseTerminalCommandRequest(input);
  const spec = await redeemTerminalCommandTicket({
    fetchImpl: options.fetchImpl,
    internalToken: options.internalToken ?? null,
    platform,
    serverUrl: options.serverUrl,
    ticket: request.ticket,
  });
  assertTerminalCommandMatches(request, spec);

  if (!(await (options.isDirectory ?? isDirectoryPath)(spec.cwd))) {
    fail("The sign-in command's working directory does not exist.");
  }

  return {
    // node-pty passes a string through as the Windows command line, which
    // is what pre-quoted cmd.exe arguments need.
    args:
      platform === "win32" && spec.windowsVerbatimArguments
        ? spec.args.join(" ")
        : spec.args,
    cols: request.cols ?? 100,
    command: spec.command,
    cwd: spec.cwd,
    env: buildTerminalCommandEnv(
      options.baseEnv ?? process.env,
      spec.env,
      platform,
    ),
    rows: request.rows ?? 24,
    title: spec.title,
  };
}
