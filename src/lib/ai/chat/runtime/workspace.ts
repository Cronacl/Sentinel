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
import {
  DEFAULT_CONTEXT_COMPACTION_ENABLED,
  DEFAULT_CONTEXT_COMPACTION_USE_FIXED_WINDOW,
  DEFAULT_FIXED_CONTEXT_WINDOW_SIZE,
  DEFAULT_CONTEXT_COMPACTION_WINDOW_PERCENT,
} from "@/schemas/general-settings.schema";
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
import { resolveAvailableWorkspaceRootPath } from "./workspace-path";

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

  return resolveAvailableWorkspaceRootPath(workspace?.rootPath);
}

export async function getToolPermissionMode(
  userId: string,
  workspaceId?: string | null,
): Promise<PermissionMode> {
  const [user, workspace] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { permissionMode: true },
    }),
    workspaceId
      ? db.query.workspaces.findFirst({
          where: and(
            eq(workspaces.id, workspaceId),
            eq(workspaces.userId, userId),
            eq(workspaces.isArchived, false),
          ),
          columns: { permissionModeOverride: true },
        })
      : Promise.resolve(null),
  ]);

  return workspace?.permissionModeOverride ?? user?.permissionMode ?? "default";
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

export async function getContextCompactionSettings(userId: string): Promise<{
  enabled: boolean;
  fixedWindowSize: number;
  useFixedWindow: boolean;
  windowPercent: number;
}> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      contextCompactionEnabled: true,
      contextCompactionFixedWindowSize: true,
      contextCompactionUseFixedWindow: true,
      contextCompactionWindowPercent: true,
    },
  });

  return {
    enabled:
      user?.contextCompactionEnabled ?? DEFAULT_CONTEXT_COMPACTION_ENABLED,
    fixedWindowSize:
      user?.contextCompactionFixedWindowSize ??
      DEFAULT_FIXED_CONTEXT_WINDOW_SIZE,
    useFixedWindow:
      user?.contextCompactionUseFixedWindow ??
      DEFAULT_CONTEXT_COMPACTION_USE_FIXED_WINDOW,
    windowPercent:
      user?.contextCompactionWindowPercent ??
      DEFAULT_CONTEXT_COMPACTION_WINDOW_PERCENT,
  };
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

export async function getSkillsBasePath(
  userId: string,
): Promise<string | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { skillsBasePath: true },
  });

  return user?.skillsBasePath ?? null;
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
