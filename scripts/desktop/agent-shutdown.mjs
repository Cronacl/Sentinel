import { randomBytes } from "node:crypto";

// The local server's /api/internal/* routes answer only Electron main, which
// passes the server a per-launch secret (src/server/http/internal-token.ts).
export const INTERNAL_TOKEN_ENV_KEY = "SENTINEL_INTERNAL_TOKEN";
export const INTERNAL_TOKEN_HEADER = "x-sentinel-internal-token";
const AGENT_SHUTDOWN_TIMEOUT_MS = 2_500;

export function createInternalToken() {
  return randomBytes(32).toString("hex");
}

/**
 * Asks the server to end the agent processes it started (SIGTERM, then
 * SIGKILL for stragglers) before it is stopped: once the server is gone its
 * detached agents would be orphaned. Best effort and bounded; resolves
 * whether or not the server answered.
 *
 * @param {{ internalToken?: string | null; url?: string | null } | null | undefined} serverState
 * @param {{ fetchImpl?: (url: URL, init: RequestInit) => Promise<Response>; timeoutMs?: number }} [options]
 * @returns {Promise<boolean>}
 */
export async function requestAgentShutdown(
  serverState,
  { fetchImpl = fetch, timeoutMs = AGENT_SHUTDOWN_TIMEOUT_MS } = {},
) {
  if (!serverState?.internalToken || !serverState.url) {
    return false;
  }

  try {
    const response = await fetchImpl(
      new URL("/api/internal/shutdown-agents", serverState.url),
      {
        headers: { [INTERNAL_TOKEN_HEADER]: serverState.internalToken },
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
