import { INTEGRATION_METADATA } from "@/lib/integrations/metadata";
import { getMcpCatalogEntry } from "@/lib/mcp/catalog";
import type { McpServerCatalogId } from "@/server/db/enums";
import { MCP_SERVER_CATALOG_IDS } from "@/server/db/enums";

import type {
  ThreadPromptIntegration,
  ThreadPromptMcpServer,
} from "./prompt-context";

function isMcpServerCatalogId(
  value: string | null | undefined,
): value is McpServerCatalogId {
  return (
    typeof value === "string" &&
    (MCP_SERVER_CATALOG_IDS as readonly string[]).includes(value)
  );
}

export function getIntegrationRoutingProfile(
  integration: Pick<
    ThreadPromptIntegration,
    "capabilitySummary" | "label" | "provider"
  >,
) {
  const metadata = INTEGRATION_METADATA[integration.provider];

  return {
    capabilitySummary:
      integration.capabilitySummary?.trim() ||
      metadata?.description ||
      integration.label,
  };
}

export function getMcpRoutingProfile(
  server: Pick<
    ThreadPromptMcpServer,
    "capabilitySummary" | "catalogId" | "name" | "namespace"
  >,
) {
  const catalogId = isMcpServerCatalogId(server.catalogId)
    ? server.catalogId
    : null;
  const catalogEntry = catalogId ? getMcpCatalogEntry(catalogId) : null;

  return {
    capabilitySummary:
      server.capabilitySummary?.trim() ||
      catalogEntry?.description ||
      `${server.name} MCP server`,
  };
}
