import "server-only";

import { execFile as nodeExecFile } from "node:child_process";

// The Cursor CLI keeps its macOS login in the Keychain (service
// "cursor-access-token", account "cursor-user"). Sentinel reads it with
// the system `security` tool, and ONLY when the user asks for it from
// Settings → Engines: macOS then asks them to allow the access. Nothing
// reads the Keychain on its own (probes, refresh loops, usage reads).
// The token stays in this process's memory, per user and instance, until
// Cursor refuses it, the account signs out, the instance changes or
// Sentinel restarts; it is never persisted or sent anywhere but Cursor's
// own endpoint.

const KEYCHAIN_SERVICE = "cursor-access-token";
const KEYCHAIN_ACCOUNT = "cursor-user";
/** Long enough for the user to answer the macOS access prompt. */
const KEYCHAIN_PROMPT_TIMEOUT_MS = 60_000;

export type ExecFileRunner = (
  file: string,
  args: readonly string[],
  options: { timeout: number },
) => Promise<{ stdout: string }>;

const runExecFile: ExecFileRunner = (file, args, options) =>
  new Promise((resolve, reject) => {
    nodeExecFile(
      file,
      [...args],
      { encoding: "utf8", timeout: options.timeout, windowsHide: true },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout: String(stdout) });
      },
    );
  });

declare global {
  // eslint-disable-next-line no-var
  var __sentinelCursorKeychainTokens: Map<string, string> | undefined;
}

// Keyed by user and instance: another user's default "cursor" instance
// never reuses a login they did not let Sentinel read.
const tokens =
  globalThis.__sentinelCursorKeychainTokens ??
  (globalThis.__sentinelCursorKeychainTokens = new Map<string, string>());

const tokenKey = (userId: string, instanceId: string) =>
  `${userId}\u0000${instanceId}`;

export class CursorKeychainUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CursorKeychainUnavailableError";
  }
}

/** The token this user let Sentinel read for this instance, if any. */
export function getCursorKeychainToken(
  userId: string | undefined,
  instanceId: string,
) {
  return userId ? (tokens.get(tokenKey(userId, instanceId)) ?? null) : null;
}

/**
 * Drops kept logins: one user's for an instance, every user's for an
 * instance (no `userId`), or all of them (no arguments).
 */
export function forgetCursorKeychainToken(
  input: { instanceId?: string; userId?: string } = {},
) {
  if (input.instanceId === undefined) {
    tokens.clear();
    return;
  }
  if (input.userId !== undefined) {
    tokens.delete(tokenKey(input.userId, input.instanceId));
    return;
  }
  for (const key of [...tokens.keys()]) {
    if (key.endsWith(`\u0000${input.instanceId}`)) {
      tokens.delete(key);
    }
  }
}

/**
 * Reads the Cursor CLI login from the macOS Keychain for one user's
 * instance. Call only from an explicit user action: it may show a macOS
 * prompt.
 */
export async function readCursorKeychainToken(
  userId: string,
  instanceId: string,
  deps: { execFile?: ExecFileRunner; platform?: NodeJS.Platform } = {},
) {
  if ((deps.platform ?? process.platform) !== "darwin") {
    throw new CursorKeychainUnavailableError(
      "Reading Cursor's login from the Keychain is only possible on macOS.",
    );
  }

  let stdout: string;
  try {
    ({ stdout } = await (deps.execFile ?? runExecFile)(
      "/usr/bin/security",
      [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
      ],
      { timeout: KEYCHAIN_PROMPT_TIMEOUT_MS },
    ));
  } catch {
    throw new CursorKeychainUnavailableError(
      "Cursor's login could not be read from the Keychain. Sign in with the Cursor CLI, then allow access when macOS asks.",
    );
  }

  const token = stdout.trim();
  if (!token) {
    throw new CursorKeychainUnavailableError(
      "The Keychain has no Cursor login. Sign in with the Cursor CLI first.",
    );
  }
  tokens.set(tokenKey(userId, instanceId), token);
  return token;
}
