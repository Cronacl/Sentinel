import "server-only";

import {
  forwardedMcpServersKey,
  MCP_NAME_PREFIX,
  NO_FORWARDED_MCP_SERVERS,
  resolveForwardedMcpServers,
  type ForwardedMcpServers,
} from "@/lib/ai/chat/engines/platform/mcp-forwarding";
import { getMcpServerRuntime } from "@/lib/ai/chat/runtime/workspace";
import { createLogger } from "@/lib/logger";
import { createMcpOAuthProvider, requiresMcpOAuth } from "@/lib/mcp/oauth";
import type { McpHttpRuntimeEntry } from "@/lib/mcp/runtime";

// The user's MCP servers for one external-agent turn (design acp-and-agents
// §2.15): loaded from Settings > MCP, resolved against the instance's
// environment and stored OAuth tokens. Shared by the ACP, Codex, Claude,
// Copilot and OpenCode runs; each turns the result into its own shape.

const log = createLogger("McpForwarding");

export type LoadedMcpServers = ForwardedMcpServers & {
  /** forwardedMcpServersKey(servers): changes when anything forwarded does. */
  key: string;
};

/** The stored access token of an OAuth server; null when there is none. */
async function resolveOAuthToken(userId: string, entry: McpHttpRuntimeEntry) {
  const provider = createMcpOAuthProvider({
    redirectUrl: "http://127.0.0.1/",
    serverId: entry.id,
    userId,
  });
  const tokens = await Promise.resolve()
    .then(() => provider.tokens())
    .catch(() => undefined);
  return tokens?.access_token ?? null;
}

export async function loadForwardedMcpServers(input: {
  /** The environment the agent runs with (passthrough and header env). */
  env: Record<string, string | undefined>;
  /** False for agents that only take stdio servers. */
  http?: boolean;
  /** For agents that merge them into their own config by name. */
  prefixNames?: boolean;
  /** False: the turn runs without tools, so no servers are forwarded. */
  toolsEnabled?: boolean;
  userId: string;
}): Promise<LoadedMcpServers> {
  if (input.toolsEnabled === false) {
    return { ...NO_FORWARDED_MCP_SERVERS, key: "" };
  }
  const entries = await getMcpServerRuntime(input.userId).catch(() => []);
  if (!entries.some((entry) => entry.isEnabled)) {
    return { ...NO_FORWARDED_MCP_SERVERS, key: "" };
  }
  const forwarded = await resolveForwardedMcpServers(entries, {
    env: input.env,
    http: input.http,
    namePrefix: input.prefixNames ? MCP_NAME_PREFIX : undefined,
    requiresOAuth: requiresMcpOAuth,
    resolveOAuthToken: (entry) => resolveOAuthToken(input.userId, entry),
  });
  return { ...forwarded, key: forwardedMcpServersKey(forwarded.servers) };
}

/** Logs which servers an agent did not get: names and reasons only. */
export function logSkippedMcpServers(
  engine: string,
  skipped: ForwardedMcpServers["skipped"],
) {
  if (skipped.length > 0) {
    log.warn("mcp_servers_not_forwarded", { engine, skipped });
  }
}
