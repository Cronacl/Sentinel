import { decrypt } from "@/lib/ai/providers/encrypt";
import {
  createMcpServerDecryptionError,
  validateMcpServerConfig,
  type McpServerConfigMap,
} from "@/lib/mcp/config";
import type { MCPTransportId } from "@/server/db/enums";

type McpServerRuntimeEntryBase = {
  catalogId?: string;
  id: string;
  isEnabled: boolean;
  name: string;
};

export type McpHttpRuntimeEntry = McpServerRuntimeEntryBase & {
  config: McpServerConfigMap["http"];
  transport: "http";
};

export type McpStdioRuntimeEntry = McpServerRuntimeEntryBase & {
  config: McpServerConfigMap["stdio"];
  transport: "stdio";
};

export type McpServerRuntimeEntry = McpHttpRuntimeEntry | McpStdioRuntimeEntry;

type StoredMcpServerRecord = {
  catalogId?: string | null;
  encryptedConfig: string;
  id: string;
  isEnabled: boolean;
  name: string;
  transport: MCPTransportId;
};

export function parseStoredMcpServer(
  record: StoredMcpServerRecord,
): McpServerRuntimeEntry {
  let config: Record<string, unknown>;

  try {
    config = JSON.parse(decrypt(record.encryptedConfig)) as Record<
      string,
      unknown
    >;
  } catch {
    throw createMcpServerDecryptionError(record.name);
  }

  if (record.transport === "http") {
    return {
      config: validateMcpServerConfig("http", config),
      ...(record.catalogId ? { catalogId: record.catalogId } : {}),
      id: record.id,
      isEnabled: record.isEnabled,
      name: record.name,
      transport: "http",
    };
  }

  return {
    config: validateMcpServerConfig("stdio", config),
    ...(record.catalogId ? { catalogId: record.catalogId } : {}),
    id: record.id,
    isEnabled: record.isEnabled,
    name: record.name,
    transport: "stdio",
  };
}

export function buildMcpServerRuntimeEntries(
  records: readonly StoredMcpServerRecord[],
) {
  const entries: McpServerRuntimeEntry[] = [];

  for (const record of records) {
    try {
      entries.push(parseStoredMcpServer(record));
    } catch {
      continue;
    }
  }

  return entries;
}
