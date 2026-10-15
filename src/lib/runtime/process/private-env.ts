// Sentinel's own secrets never reach the processes it starts: agents, the
// shells, MCP servers and tools those start, the shell tool, git. Two layers:
//
//   1. At server start (src/instrumentation.ts) the secrets move out of
//      process.env into server memory, so no child can inherit them.
//   2. Every child env builder strips them again (spawn.ts, the instance
//      env, the Claude SDK env, the shell tool, git, runCommand), in case
//      the capture did not run (scripts, tests) or a variable was set again.
//
// No "server-only" here: the shell tool and git helpers import this and are
// loaded by tests without that shim.

/**
 * ENCRYPTION_KEY decrypts stored provider credentials;
 * SENTINEL_INTERNAL_TOKEN authorizes Electron's internal calls.
 */
export const SENTINEL_PRIVATE_ENV_KEYS: ReadonlySet<string> = new Set([
  "ENCRYPTION_KEY",
  "SENTINEL_INTERNAL_TOKEN",
]);

export function isSentinelPrivateEnvKey(name: string) {
  return SENTINEL_PRIVATE_ENV_KEYS.has(name);
}

/** A copy of `env` without Sentinel's private keys. */
export function withoutSentinelPrivateEnv<
  E extends Record<string, string | undefined>,
>(env: E): E {
  const copy = { ...env };
  for (const name of SENTINEL_PRIVATE_ENV_KEYS) {
    delete copy[name];
  }
  return copy;
}

const ENCRYPTION_KEY_ENV_KEY = "ENCRYPTION_KEY";

const globalForEncryptionKey = globalThis as unknown as {
  __sentinelEncryptionKey?: string;
};

/**
 * Moves ENCRYPTION_KEY from `env` (process.env) into server memory, on
 * globalThis so every route bundle's src/env.js reads the same value.
 * Idempotent. Without one in the environment, src/env.js keeps reading the
 * key from desktop.env, which never enters process.env.
 */
export function captureEncryptionKey(
  env: Record<string, string | undefined> = process.env,
) {
  const value = env[ENCRYPTION_KEY_ENV_KEY];
  if (value === undefined) {
    return;
  }
  globalForEncryptionKey.__sentinelEncryptionKey = value;
  delete env[ENCRYPTION_KEY_ENV_KEY];
}
