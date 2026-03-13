import type { McpServerConfigMap } from "@/lib/mcp/config";
import type { MCPTransportId, McpServerCatalogId } from "@/server/db/enums";

type McpCatalogEntryBase<TTransport extends MCPTransportId> = {
  description: string;
  id: McpServerCatalogId;
  installLabel?: string;
  name: string;
  transport: TTransport;
  vendor: string;
};

export type McpCatalogHttpEntry = McpCatalogEntryBase<"http"> & {
  config: McpServerConfigMap["http"];
  requiresAuthentication: boolean;
};

export type McpCatalogStdioEntry = McpCatalogEntryBase<"stdio"> & {
  config: McpServerConfigMap["stdio"];
  requiresAuthentication?: false;
};

export type McpCatalogEntry = McpCatalogHttpEntry | McpCatalogStdioEntry;

export const MCP_SERVER_CATALOG: readonly McpCatalogEntry[] = [
  {
    config: {
      args: ["mcp-server-git"],
      command: "uvx",
      envPassthrough: [],
      envVars: [],
    },
    description:
      "Inspect repository status, diffs, history, branches, and commits from Git.",
    id: "git",
    installLabel: "Install with uvx",
    name: "Git",
    transport: "stdio",
    vendor: "Model Context Protocol",
  },
  {
    config: {
      args: ["@playwright/mcp@latest"],
      command: "npx",
      envPassthrough: [],
      envVars: [],
    },
    description:
      "Integrate browser automation to implement design and test UI.",
    id: "playwright",
    name: "Playwright",
    transport: "stdio",
    vendor: "Microsoft",
  },
] as const;

export function getMcpCatalogEntry(catalogId: string) {
  return MCP_SERVER_CATALOG.find((entry) => entry.id === catalogId);
}
