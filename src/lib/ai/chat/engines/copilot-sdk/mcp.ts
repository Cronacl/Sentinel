import type { MCPServerConfig } from "@github/copilot-sdk";

import type { ForwardedMcpServer } from "../platform/mcp-forwarding";

// The user's MCP servers as Copilot session `mcpServers` (design
// acp-and-agents §6.3), sent on createSession and resumeSession. Every tool
// is included; calls to them ask through onPermissionRequest (kind "mcp").
// Pure.

export function buildCopilotMcpServers(
  servers: readonly ForwardedMcpServer[],
): Record<string, MCPServerConfig> {
  const config: Record<string, MCPServerConfig> = {};
  for (const server of servers) {
    config[server.name] =
      server.transport === "http"
        ? {
            headers: server.headers,
            tools: ["*"],
            type: "http",
            url: server.url,
          }
        : {
            args: server.args,
            command: server.command,
            env: server.env,
            tools: ["*"],
            type: "local",
            ...(server.cwd ? { workingDirectory: server.cwd } : {}),
          };
  }
  return config;
}
