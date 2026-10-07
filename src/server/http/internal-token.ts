import { createHash, timingSafeEqual } from "node:crypto";

// Internal routes (/api/internal/*) are called by the Electron main process,
// never by the renderer. Besides the loopback guard every /api route gets,
// they require the per-launch token Electron main passes to the server as
// SENTINEL_INTERNAL_TOKEN. Without a configured token (dev server, web
// mode) internal routes do not exist.

export const INTERNAL_TOKEN_ENV_KEY = "SENTINEL_INTERNAL_TOKEN";
export const INTERNAL_TOKEN_HEADER = "x-sentinel-internal-token";

const MIN_TOKEN_LENGTH = 32;

export type InternalTokenDecision =
  { allowed: true } | { allowed: false; status: 403 | 404 };

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function getConfiguredInternalToken(
  env: Record<string, string | undefined> = process.env,
) {
  const token = env[INTERNAL_TOKEN_ENV_KEY]?.trim();
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
