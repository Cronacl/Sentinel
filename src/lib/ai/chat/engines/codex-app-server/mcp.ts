import type { ForwardedMcpServer } from "../platform/mcp-forwarding";

// The user's MCP servers as Codex `mcp_servers` (config.toml shape), sent in
// the `config` overrides of thread/start and thread/resume (design
// acp-and-agents §6.2). Codex layers these over the user's and project's
// config.toml and merges the table, so the user's own Codex servers stay.
// Pure.

export type CodexMcpServerConfig =
  | {
      args: string[];
      command: string;
      cwd?: string;
      env?: Record<string, string>;
    }
  | { http_headers?: Record<string, string>; url: string };

export function buildCodexMcpServers(
  servers: readonly ForwardedMcpServer[],
): Record<string, CodexMcpServerConfig> {
  const config: Record<string, CodexMcpServerConfig> = {};
  for (const server of servers) {
    config[server.name] =
      server.transport === "http"
        ? {
            ...(Object.keys(server.headers).length > 0
              ? { http_headers: server.headers }
              : {}),
            url: server.url,
          }
        : {
            args: server.args,
            command: server.command,
            ...(server.cwd ? { cwd: server.cwd } : {}),
            ...(Object.keys(server.env).length > 0 ? { env: server.env } : {}),
          };
  }
  return config;
}

/** thread/start|resume `config` for the servers; null without any. */
export function buildCodexThreadMcpConfig(
  servers: readonly ForwardedMcpServer[],
): Record<string, unknown> | null {
  return servers.length > 0
    ? { mcp_servers: buildCodexMcpServers(servers) }
    : null;
}
