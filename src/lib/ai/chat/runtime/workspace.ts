import { and, eq } from "drizzle-orm";

import {
  buildToolApprovalOverrideMap,
  resolveToolApprovalPolicies,
  type ToolApprovalPolicyMap,
} from "@/lib/ai/chat/tool-approval-policy";
import {
  buildMcpServerRuntimeEntries,
  type McpServerRuntimeEntry,
} from "@/lib/mcp/runtime";
import {
  buildSearchProviderRuntimeMap,
  type SearchProviderRuntimeMap,
} from "@/lib/search/providers/runtime";
import { normalizeSearchSettings, type SearchSettings } from "@/lib/search";
import { normalizeMemorySettings, type MemorySettings } from "@/lib/memory";
import {
  normalizeWebFetchSettings,
  type WebFetchSettings,
} from "@/lib/webfetch";
import type { PermissionMode } from "@/server/db/enums";
import { db } from "@/server/db";
import {
  mcpServerConfigs,
  searchProviderConfigs,
  searchSettings,
  memorySettings,
  toolApprovalPolicies,
  users,
  workspaces,
} from "@/server/db/schema";

export async function getWorkspaceRootPath(
  workspaceId: string,
  userId: string,
) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(
      eq(workspaces.id, workspaceId),
      eq(workspaces.userId, userId),
      eq(workspaces.isArchived, false),
    ),
    columns: { rootPath: true },
  });

  return workspace?.rootPath?.trim() || null;
}

export async function getToolPermissionMode(
  userId: string,
): Promise<PermissionMode> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { permissionMode: true },
  });

  return user?.permissionMode ?? "default";
}

export async function getWebFetchSettings(
  userId: string,
): Promise<WebFetchSettings> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      webFetchBatchEnabled: true,
      webFetchBatchLimit: true,
    },
  });

  return normalizeWebFetchSettings(user);
}

export async function getToolApprovalPolicies(
  userId: string,
): Promise<ToolApprovalPolicyMap> {
  const rows = await db.query.toolApprovalPolicies.findMany({
    where: eq(toolApprovalPolicies.userId, userId),
    columns: {
      requireApproval: true,
      toolName: true,
    },
  });

  return resolveToolApprovalPolicies(buildToolApprovalOverrideMap(rows));
}

export async function getSearchSettings(
  userId: string,
): Promise<SearchSettings> {
  const row = await db.query.searchSettings.findFirst({
    where: eq(searchSettings.userId, userId),
    columns: {
      defaultProvider: true,
      defaultResultCount: true,
      maxResultCount: true,
    },
  });

  return normalizeSearchSettings(row ?? null);
}

export async function getSearchProviderRuntime(
  userId: string,
): Promise<SearchProviderRuntimeMap> {
  const rows = await db.query.searchProviderConfigs.findMany({
    where: eq(searchProviderConfigs.userId, userId),
    columns: {
      encryptedConfig: true,
      isEnabled: true,
      provider: true,
      settings: true,
    },
  });

  return buildSearchProviderRuntimeMap(rows);
}

export async function getMcpServerRuntime(
  userId: string,
): Promise<McpServerRuntimeEntry[]> {
  const rows = await db.query.mcpServerConfigs.findMany({
    where: eq(mcpServerConfigs.userId, userId),
    columns: {
      catalogId: true,
      encryptedConfig: true,
      id: true,
      isEnabled: true,
      name: true,
      transport: true,
    },
  });

  return buildMcpServerRuntimeEntries(rows);
}

export async function getMemorySettings(
  userId: string,
): Promise<MemorySettings> {
  const row = await db.query.memorySettings.findFirst({
    where: eq(memorySettings.userId, userId),
    columns: {
      autoSaveEnabled: true,
      autoSavePerTurnLimit: true,
      defaultScope: true,
      enabled: true,
      memoryDimensions: true,
      memoryModel: true,
      memoryProvider: true,
      retrievalLimit: true,
    },
  });

  return normalizeMemorySettings(row ?? null);
}
