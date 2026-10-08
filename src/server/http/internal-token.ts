import { createHash, timingSafeEqual } from "node:crypto";

// Internal routes (/api/internal/*) are called by the Electron main process,
// never by the renderer. Besides the loopback guard every /api route gets,
// they require the per-launch token Electron main passes to the server as
// SENTINEL_INTERNAL_TOKEN. Without a configured token (dev server, web
// mode) internal routes do not exist.
//
// At server start (src/instrumentation.ts) the token moves out of
// process.env into server memory, so no process the server starts inherits
// it: agents and their tools, the Claude SDK and its Bash tool, the shell
// tool, git, MCP servers. Agent spawns also strip it (spawn.ts) in case
// the capture did not run.

export const INTERNAL_TOKEN_ENV_KEY = "SENTINEL_INTERNAL_TOKEN";
export const INTERNAL_TOKEN_HEADER = "x-sentinel-internal-token";

const MIN_TOKEN_LENGTH = 32;

export type InternalTokenDecision =
  { allowed: true } | { allowed: false; status: 403 | 404 };

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

const globalForInternalToken = globalThis as unknown as {
  __sentinelInternalToken?: string;
};

/**
 * Moves the token from `env` (process.env) into server memory, on
 * globalThis so every route bundle reads the same value. Idempotent.
 */
export function captureInternalToken(
  env: Record<string, string | undefined> = process.env,
) {
  const value = env[INTERNAL_TOKEN_ENV_KEY];
  if (value === undefined) {
    return;
  }
  globalForInternalToken.__sentinelInternalToken = value;
  delete env[INTERNAL_TOKEN_ENV_KEY];
}

/**
 * The configured token: from `env` when given, else process.env, else the
 * one captured at server start. Null unless at least 32 characters.
 */
export function getConfiguredInternalToken(
  env?: Record<string, string | undefined>,
) {
  const raw = env
    ? env[INTERNAL_TOKEN_ENV_KEY]
    : (process.env[INTERNAL_TOKEN_ENV_KEY] ??
      globalForInternalToken.__sentinelInternalToken);
  const token = raw?.trim();
  return token && token.length >= MIN_TOKEN_LENGTH ? token : null;
}

/**
 * 404 when no token is configured (the route is hidden), 403 when the header
 * is missing or wrong. Compared in constant time over fixed-length digests.
 */
export function verifyInternalToken(
  headers: Pick<Headers, "get">,
  expected: string | null,
): InternalTokenDecision {
  if (!expected) {
    return { allowed: false, status: 404 };
  }

  const provided = headers.get(INTERNAL_TOKEN_HEADER)?.trim();
  if (!provided) {
    return { allowed: false, status: 403 };
  }

  return timingSafeEqual(digest(provided), digest(expected))
    ? { allowed: true }
    : { allowed: false, status: 403 };
}
