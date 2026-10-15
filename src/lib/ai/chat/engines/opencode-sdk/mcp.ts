import {
  wrapStdioCommand,
  type ForwardedMcpServer,
} from "../platform/mcp-forwarding";

// The user's MCP servers for OpenCode (design acp-and-agents §5). Pure.
//
// - 1.x reads them from the server's OPENCODE_CONFIG_CONTENT: an `mcp`
//   block merged into the config content the user or caller already set
//   (never replacing it). The pooled server is keyed by them, so a change
//   starts a new server. Older 1.x releases reject a `cwd` on local
//   servers (strict config), so a configured one wraps the command.
// - 2.x adds them at runtime per directory (PUT /api/experimental/mcp/
//   :server, "add or replace"); its config `mcp` block has another shape.

export type OpenCodeV1McpServer =
  | {
      command: string[];
      environment?: Record<string, string>;
      type: "local";
    }
  | { headers?: Record<string, string>; type: "remote"; url: string };

export type OpenCodeV2McpServer =
  | {
      command: string[];
      cwd?: string;
      environment?: Record<string, string>;
      type: "local";
    }
  | { headers?: Record<string, string>; type: "remote"; url: string };

const nonEmpty = (record: Record<string, string>) =>
  Object.keys(record).length > 0 ? record : undefined;

function remote(server: Extract<ForwardedMcpServer, { transport: "http" }>) {
  const headers = nonEmpty(server.headers);
  return {
    ...(headers ? { headers } : {}),
    type: "remote" as const,
    url: server.url,
  };
}

export function buildOpenCodeV1McpConfig(
  servers: readonly ForwardedMcpServer[],
  platform: NodeJS.Platform = process.platform,
): Record<string, OpenCodeV1McpServer> {
  const config: Record<string, OpenCodeV1McpServer> = {};
  for (const server of servers) {
    if (server.transport === "http") {
      config[server.name] = remote(server);
      continue;
    }
    const launch = wrapStdioCommand(server, platform);
    const environment = nonEmpty(server.env);
    config[server.name] = {
      command: [launch.command, ...launch.args],
      ...(environment ? { environment } : {}),
      type: "local",
    };
  }
  return config;
}

export function buildOpenCodeV2McpServers(
  servers: readonly ForwardedMcpServer[],
): Record<string, OpenCodeV2McpServer> {
  const config: Record<string, OpenCodeV2McpServer> = {};
  for (const server of servers) {
    if (server.transport === "http") {
      config[server.name] = remote(server);
      continue;
    }
    const environment = nonEmpty(server.env);
    config[server.name] = {
      command: [server.command, ...server.args],
      ...(server.cwd ? { cwd: server.cwd } : {}),
      ...(environment ? { environment } : {}),
      type: "local",
    };
  }
  return config;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `content` (OPENCODE_CONFIG_CONTENT, unset meaning `{}`) with `mcp` merged
 * into its `mcp` block: the user's other settings and servers stay, and a
 * forwarded server replaces one of the same name. Null when the content is
 * not a JSON object (it is then left alone).
 */
export function mergeOpenCodeConfigContent(
  content: string | undefined,
  mcp: Record<string, OpenCodeV1McpServer>,
): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content?.trim() ? content : "{}");
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const existing = isRecord(parsed.mcp) ? parsed.mcp : {};
  return JSON.stringify({ ...parsed, mcp: { ...existing, ...mcp } });
}
