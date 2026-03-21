import { INTEGRATION_METADATA } from "@/lib/integrations/metadata";
import { getMcpCatalogEntry } from "@/lib/mcp/catalog";
import type {
  IntegrationProvider,
  McpServerCatalogId,
} from "@/server/db/enums";
import { MCP_SERVER_CATALOG_IDS } from "@/server/db/enums";

import type {
  ThreadPromptIntegration,
  ThreadPromptMcpServer,
} from "./prompt-context";

const INTEGRATION_ALIAS_MAP: Record<IntegrationProvider, string[]> = {
  airtable: [
    "airtable",
    "base",
    "bases",
    "table",
    "tables",
    "record",
    "records",
  ],
  github: [
    "github",
    "github issue",
    "github issues",
    "github pr",
    "github prs",
    "pull request",
    "pull requests",
    "workflow",
    "workflows",
    "release",
    "releases",
  ],
  gmail: ["gmail", "email", "emails", "inbox", "draft email", "reply email"],
  google_calendar: [
    "calendar",
    "google calendar",
    "event",
    "events",
    "meeting",
    "meetings",
    "schedule",
    "availability",
  ],
  google_drive: [
    "drive",
    "google drive",
    "drive tool",
    "drive tools",
    "drive file",
    "drive files",
    "drive folder",
    "drive folders",
    "upload to drive",
    "download from drive",
  ],
  linear: [
    "linear",
    "linear issue",
    "linear issues",
    "sprint",
    "sprints",
    "cycle",
    "cycles",
  ],
  mongodb: [
    "mongodb",
    "mongo",
    "collection",
    "collections",
    "document",
    "documents",
  ],
  mysql: ["mysql", "sql table", "sql tables", "mysql database"],
  notion: ["notion", "notion page", "notion pages", "wiki", "knowledge base"],
  postgresql: [
    "postgres",
    "postgresql",
    "postgres database",
    "database schema",
    "sql query",
  ],
  slack: ["slack", "channel", "channels", "thread", "threads", "slack message"],
};

const MCP_ALIAS_MAP: Partial<Record<McpServerCatalogId, string[]>> = {
  figma: ["figma", "design file", "design files", "component", "components"],
  git: ["git history", "git log", "git diff", "git status", "git branch"],
  linear: ["linear", "linear issue", "linear issues", "linear project"],
  notion: ["notion", "notion page", "notion database", "notion docs"],
  playwright: [
    "playwright",
    "browser",
    "browser tool",
    "browser tools",
    "open the browser",
    "inspect the page",
    "web page",
    "screenshot",
    "page screenshot",
    "browser automation",
    "ui test",
  ],
};

function isMcpServerCatalogId(
  value: string | null | undefined,
): value is McpServerCatalogId {
  return (
    typeof value === "string" &&
    (MCP_SERVER_CATALOG_IDS as readonly string[]).includes(value)
  );
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => normalizeText(value)).filter(Boolean)),
  );
}

export function getIntegrationRoutingProfile(
  integration: Pick<
    ThreadPromptIntegration,
    "aliases" | "capabilitySummary" | "label" | "provider"
  >,
) {
  const metadata = INTEGRATION_METADATA[integration.provider];
  const aliases = uniqueStrings([
    ...(integration.aliases ?? []),
    ...(INTEGRATION_ALIAS_MAP[integration.provider] ?? []),
    integration.label,
    integration.provider,
    integration.provider.replaceAll("_", " "),
  ]);

  return {
    aliases,
    capabilitySummary:
      integration.capabilitySummary?.trim() ||
      metadata?.description ||
      integration.label,
  };
}

export function getMcpRoutingProfile(
  server: Pick<
    ThreadPromptMcpServer,
    "aliases" | "capabilitySummary" | "catalogId" | "name" | "namespace"
  >,
) {
  const catalogId = isMcpServerCatalogId(server.catalogId)
    ? server.catalogId
    : null;
  const catalogEntry = catalogId ? getMcpCatalogEntry(catalogId) : null;
  const aliases = uniqueStrings([
    ...(server.aliases ?? []),
    ...(catalogId ? (MCP_ALIAS_MAP[catalogId] ?? []) : []),
    server.name,
    server.namespace,
    server.namespace.replaceAll("_", " "),
    server.catalogId ?? "",
  ]);

  return {
    aliases,
    capabilitySummary:
      server.capabilitySummary?.trim() ||
      catalogEntry?.description ||
      `${server.name} MCP server`,
  };
}
