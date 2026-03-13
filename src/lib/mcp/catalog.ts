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
