import type { McpServerRuntimeEntry } from "@/lib/mcp/runtime";

import {
  resolveForwardedMcpServers,
  wrapStdioCommand,
  type ForwardedMcpServer,
  type ForwardedMcpServers,
  type ForwardedMcpSkipped,
  type McpForwardingOptions,
} from "../platform/mcp-forwarding";
import type { AcpAgentCapabilityFlags } from "./schema";

export {
  resolveForwardedStdioCwd,
  wrapStdioCommand,
} from "../platform/mcp-forwarding";

// The user's configured MCP servers in ACP session/new|load|resume
// `mcpServers` (design §2.15; resolution in platform/mcp-forwarding.ts).
// Every agent must accept stdio servers; http servers only go to agents
// that advertise mcpCapabilities.http. ACP stdio servers have no cwd, so a
// configured one wraps the command.

export type AcpMcpServer =
  | {
      args: string[];
      command: string;
      env: Array<{ name: string; value: string }>;
      name: string;
    }
  | {
      headers: Array<{ name: string; value: string }>;
      name: string;
      type: "http";
      url: string;
    };

export type AcpMcpSkipped = ForwardedMcpSkipped;

export type AcpMcpForwarding = {
  servers: AcpMcpServer[];
  skipped: AcpMcpSkipped[];
};

export type AcpMcpForwardingOptions = Omit<McpForwardingOptions, "http"> & {
  capabilities: Pick<AcpAgentCapabilityFlags, "mcpHttp">;
  platform?: NodeJS.Platform;
};

const toPairs = (record: Record<string, string>) =>
  Object.entries(record).map(([name, value]) => ({ name, value }));

export function toAcpMcpServers(
  servers: readonly ForwardedMcpServer[],
  platform: NodeJS.Platform = process.platform,
): AcpMcpServer[] {
  return servers.map((server) =>
    server.transport === "http"
      ? {
          headers: toPairs(server.headers),
          name: server.name,
          type: "http",
          url: server.url,
        }
      : {
          ...wrapStdioCommand(server, platform),
          env: toPairs(server.env),
          name: server.name,
        },
  );
}

export async function buildAcpMcpServers(
  entries: readonly McpServerRuntimeEntry[],
  options: AcpMcpForwardingOptions,
): Promise<AcpMcpForwarding> {
  const { capabilities, platform, ...rest } = options;
  const forwarded: ForwardedMcpServers = await resolveForwardedMcpServers(
    entries,
    { ...rest, http: capabilities.mcpHttp },
  );
  return {
    servers: toAcpMcpServers(forwarded.servers, platform),
    skipped: forwarded.skipped,
  };
}
