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
import {
  normalizeMemorySettings,
  type MemoryRuntimeState,
  type MemorySettings,
} from "@/lib/memory";
import { resolveMemoryRuntimeState } from "@/lib/memory/runtime";
import { buildPersonalizationPrompt } from "@/lib/personalization";
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

type BootstrapUserRecord = {
  aboutUser: string | null;
  contextCompactionEnabled: boolean | null;
  contextCompactionFixedWindowSize: number | null;
  contextCompactionUseFixedWindow: boolean | null;
  contextCompactionWindowPercent: number | null;
  customInstructions: string | null;
  nickname: string | null;
  occupation: string | null;
  personalityPreset: (typeof users.$inferSelect)["personalityPreset"] | null;
  permissionMode: PermissionMode | null;
  skillsBasePath: string | null;
  webFetchBatchEnabled: boolean | null;
  webFetchBatchLimit: number | null;
};

type BootstrapWorkspaceRecord = {
  permissionModeOverride: PermissionMode | null;
  rootPath: string | null;
};

const THREAD_RUNTIME_BOOTSTRAP_CACHE_TTL_MS = 5_000;
const threadRuntimeBootstrapCache = new Map<
  string,
  { expiresAt: number; promise: Promise<ThreadRuntimeBootstrap> }
>();

export type ThreadRuntimeBootstrap = {
  contextCompactionSettings: {
    enabled: boolean;
    fixedWindowSize: number;
    useFixedWindow: boolean;
    windowPercent: number;
  };
  permissionMode: PermissionMode;
  personalizationPrompt: string;
  skillsBasePath: string | null;
  webFetchSettings: WebFetchSettings;
  workspaceRoot: string | null;
};

async function loadThreadRuntimeBootstrapRows(
  userId: string,
  workspaceId?: string | null,
): Promise<{
  user: BootstrapUserRecord | null;
  workspace: BootstrapWorkspaceRecord | null;
}> {
  const [user, workspace] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        aboutUser: true,
        contextCompactionEnabled: true,
        contextCompactionFixedWindowSize: true,
        contextCompactionUseFixedWindow: true,
        contextCompactionWindowPercent: true,
        customInstructions: true,
        nickname: true,
        occupation: true,
        personalityPreset: true,
        permissionMode: true,
        skillsBasePath: true,
        webFetchBatchEnabled: true,
        webFetchBatchLimit: true,
      },
    }),
    workspaceId
      ? db.query.workspaces.findFirst({
          where: and(
            eq(workspaces.id, workspaceId),
            eq(workspaces.userId, userId),
            eq(workspaces.isArchived, false),
          ),
          columns: {
            permissionModeOverride: true,
            rootPath: true,
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    user: user ?? null,
    workspace: workspace ?? null,
  };
}

export async function getThreadRuntimeBootstrap(
  userId: string,
  workspaceId?: string | null,
): Promise<ThreadRuntimeBootstrap> {
  const cacheKey = `${userId}:${workspaceId ?? "__none__"}`;
  const cached = threadRuntimeBootstrapCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return await cached.promise;
  }

  const pending = (async () => {
    const { user, workspace } = await loadThreadRuntimeBootstrapRows(
      userId,
      workspaceId,
    );

    return {
      contextCompactionSettings: {
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
      },
      permissionMode:
        workspace?.permissionModeOverride ?? user?.permissionMode ?? "default",
      personalizationPrompt: user
        ? buildPersonalizationPrompt({
            aboutUser: user.aboutUser,
            customInstructions: user.customInstructions,
            nickname: user.nickname,
            occupation: user.occupation,
            personality: user.personalityPreset,
          })
        : "",
      skillsBasePath: user?.skillsBasePath ?? null,
      webFetchSettings: normalizeWebFetchSettings(user),
      workspaceRoot: await resolveAvailableWorkspaceRootPath(
        workspace?.rootPath,
      ),
    } satisfies ThreadRuntimeBootstrap;
  })().catch((error) => {
    const current = threadRuntimeBootstrapCache.get(cacheKey);
    if (current?.promise === pending) {
      threadRuntimeBootstrapCache.delete(cacheKey);
    }
    throw error;
  });

  threadRuntimeBootstrapCache.set(cacheKey, {
    expiresAt: Date.now() + THREAD_RUNTIME_BOOTSTRAP_CACHE_TTL_MS,
    promise: pending,
  });

  return await pending;
}

export async function getWorkspaceRootPath(
  workspaceId: string,
  userId: string,
) {
  const { workspace } = await loadThreadRuntimeBootstrapRows(
    userId,
    workspaceId,
  );
  return await resolveAvailableWorkspaceRootPath(workspace?.rootPath);
}

export async function getToolPermissionMode(
  userId: string,
  workspaceId?: string | null,
): Promise<PermissionMode> {
  const { user, workspace } = await loadThreadRuntimeBootstrapRows(
    userId,
    workspaceId,
  );

  return workspace?.permissionModeOverride ?? user?.permissionMode ?? "default";
}

export async function getWebFetchSettings(
  userId: string,
): Promise<WebFetchSettings> {
  const { user } = await loadThreadRuntimeBootstrapRows(userId);

  return normalizeWebFetchSettings(user);
}

export async function getContextCompactionSettings(userId: string): Promise<{
  enabled: boolean;
  fixedWindowSize: number;
  useFixedWindow: boolean;
  windowPercent: number;
}> {
  const { user } = await loadThreadRuntimeBootstrapRows(userId);

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
  const { user } = await loadThreadRuntimeBootstrapRows(userId);

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

export async function getMemoryRuntimeState(
  userId: string,
): Promise<MemoryRuntimeState> {
  const settings = await getMemorySettings(userId);
  return await resolveMemoryRuntimeState({ settings, userId });
}
