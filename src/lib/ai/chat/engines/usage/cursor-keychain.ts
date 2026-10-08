import "server-only";

import { execFile as nodeExecFile } from "node:child_process";

// The Cursor CLI keeps its macOS login in the Keychain (service
// "cursor-access-token", account "cursor-user"). Sentinel reads it with
// the system `security` tool, and ONLY when the user asks for it from
// Settings → Engines: macOS then asks them to allow the access. Nothing
// reads the Keychain on its own (probes, refresh loops, usage reads).
// The token stays in this process's memory, per instance, until Cursor
// refuses it or Sentinel restarts; it is never persisted or sent anywhere
// but Cursor's own endpoint.

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

const tokens =
  globalThis.__sentinelCursorKeychainTokens ??
  (globalThis.__sentinelCursorKeychainTokens = new Map<string, string>());

export class CursorKeychainUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CursorKeychainUnavailableError";
  }
}

/** The token the user let Sentinel read for this instance, if any. */
export function getCursorKeychainToken(instanceId: string) {
  return tokens.get(instanceId) ?? null;
}

export function forgetCursorKeychainToken(instanceId?: string) {
  if (instanceId === undefined) {
    tokens.clear();
    return;
  }
  tokens.delete(instanceId);
}

/**
 * Reads the Cursor CLI login from the macOS Keychain for one instance.
 * Call only from an explicit user action: it may show a macOS prompt.
 */
export async function readCursorKeychainToken(
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
  tokens.set(instanceId, token);
  return token;
}
