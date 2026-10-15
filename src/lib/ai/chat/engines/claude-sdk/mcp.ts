import type {
  McpHttpServerConfig,
  McpStdioServerConfig,
} from "@anthropic-ai/claude-agent-sdk";

import {
  wrapStdioCommand,
  type ForwardedMcpServer,
} from "../platform/mcp-forwarding";

// The user's MCP servers as Agent SDK query `mcpServers` (design
// acp-and-agents §6.1). Claude Code adds them to the servers its own
// settings configure (strictMcpConfig stays off). Its stdio servers have no
// cwd, so a configured one wraps the command. Sentinel's http transport is
// streamable HTTP (`type: "http"`); it has no SSE servers to forward. Pure.

export function buildClaudeMcpServers(
  servers: readonly ForwardedMcpServer[],
  platform: NodeJS.Platform = process.platform,
): Record<string, McpHttpServerConfig | McpStdioServerConfig> {
  const config: Record<string, McpHttpServerConfig | McpStdioServerConfig> = {};
  for (const server of servers) {
    config[server.name] =
      server.transport === "http"
        ? { headers: server.headers, type: "http", url: server.url }
        : {
            ...wrapStdioCommand(server, platform),
            env: server.env,
            type: "stdio",
          };
  }
  return config;
}
