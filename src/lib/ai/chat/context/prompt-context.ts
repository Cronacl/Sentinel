import type { MemoryRuntimeState } from "@/lib/memory";
import type {
  AIProvider,
  IntegrationProvider,
  MCPTransportId,
} from "@/server/db/enums";
import type { ThreadMode, ThreadPlanAudience } from "@/lib/plan";
import type { PermissionMode } from "@/lib/security";
import type { SearchSettings } from "@/lib/search";
import type { SearchProviderRuntimeMap } from "@/lib/search/providers/runtime";
import type { SkillMetadata } from "@/lib/skills";
import type { WebFetchSettings } from "@/lib/webfetch";
import {
  normalizeSentinelComposerToolTags,
  type SentinelComposerToolTag,
} from "@/lib/ai/chat/tools/selection/tags";

import type { ToolApprovalPolicyMap } from "../tools/policy";

export type ThreadPromptIntegration = {
  capabilitySummary?: string;
  provider: IntegrationProvider;
  label: string;
  toolCount: number;
  toolPrefix: string | null;
};

export type ThreadAgentRole = "primary" | "subagent";

export type ThreadPromptPlanSummary = {
  audience: ThreadPlanAudience;
  goal: string;
  hasPendingQuestions: boolean;
  summary: string;
  taskCount: number;
  title: string;
};

export type ThreadPromptProjectCandidate = {
  confidence: number;
  kind: "app" | "package" | "repo";
  path: string;
  signals: string[];
};

export type ThreadPromptLatentToolSummary = {
  categories: string[];
  integrationNamespaces: string[];
  mcpNamespaces: string[];
};

export type ThreadPromptMcpServer = {
  capabilitySummary?: string;
  catalogId?: string;
  id: string;
  name: string;
  namespace: string;
  toolCount: number;
  transport: MCPTransportId;
};

export type ThreadPromptImageGeneration = {
  available: boolean;
  defaultProvider: AIProvider | null;
  enabledProviders: Array<{
    modelId: string;
    provider: AIProvider;
  }>;
};

export type ThreadPromptVideoGeneration = {
  available: boolean;
  defaultProvider: AIProvider | null;
  enabledProviders: Array<{
    modelId: string;
    provider: AIProvider;
  }>;
};

export type ThreadPromptContext = {
  agentRole?: ThreadAgentRole;
  availableSkills: SkillMetadata[];
  allowedInspectionRoots: string[];
  allowedMutationRoot: string | null;
  enabledIntegrations: ThreadPromptIntegration[];
  imageGeneration: ThreadPromptImageGeneration;
  videoGeneration: ThreadPromptVideoGeneration;
  enabledMcpServers: ThreadPromptMcpServer[];
  latestUserText: string | null;
  latentToolSummary: ThreadPromptLatentToolSummary;
  mcpToolNames: string[];
  memoryPromptLines: string[];
  memoryRuntime: MemoryRuntimeState;
  permissionMode: PermissionMode;
  planSummary: ThreadPromptPlanSummary | null;
  preferredProjectRoot: string | null;
  projectCandidates: ThreadPromptProjectCandidate[];
  searchProviders: SearchProviderRuntimeMap;
  searchSettings: SearchSettings;
  shellStartDirectory: string | null;
  skillRoots: string[];
  sourceMessageId: string | null;
  threadMode: ThreadMode;
  toolApprovalPolicies: ToolApprovalPolicyMap;
  toolTags?: SentinelComposerToolTag[];
  webFetchSettings: WebFetchSettings;
  workspaceRoot: string | null;
};

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  ).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function createMcpPromptNamespace(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "server";
}

export function buildThreadPromptContext(
  input: ThreadPromptContext,
): ThreadPromptContext {
  return {
    ...input,
    agentRole: input.agentRole ?? "primary",
    allowedInspectionRoots: uniqueStrings(input.allowedInspectionRoots ?? []),
    allowedMutationRoot: input.allowedMutationRoot?.trim() || null,
    availableSkills: [...input.availableSkills],
    latestUserText: input.latestUserText?.trim() || null,
    enabledIntegrations: [...(input.enabledIntegrations ?? [])]
      .map((integration) => ({
        ...integration,
        capabilitySummary: integration.capabilitySummary?.trim() ?? "",
      }))
      .sort((left, right) =>
        left.label.localeCompare(right.label, undefined, {
          sensitivity: "base",
        }),
      ),
    imageGeneration: {
      available: Boolean(input.imageGeneration?.available),
      defaultProvider: input.imageGeneration?.defaultProvider ?? null,
      enabledProviders: [...(input.imageGeneration?.enabledProviders ?? [])]
        .filter(
          (entry) =>
            entry.provider.trim().length > 0 && entry.modelId.trim().length > 0,
        )
        .sort((left, right) =>
          left.provider.localeCompare(right.provider, undefined, {
            sensitivity: "base",
          }),
        ),
    },
    videoGeneration: {
      available: Boolean(input.videoGeneration?.available),
      defaultProvider: input.videoGeneration?.defaultProvider ?? null,
      enabledProviders: [...(input.videoGeneration?.enabledProviders ?? [])]
        .filter(
          (entry) =>
            entry.provider.trim().length > 0 && entry.modelId.trim().length > 0,
        )
        .sort((left, right) =>
          left.provider.localeCompare(right.provider, undefined, {
            sensitivity: "base",
          }),
        ),
    },
    enabledMcpServers: [...(input.enabledMcpServers ?? [])]
      .map((server) => ({
        ...server,
        capabilitySummary: server.capabilitySummary?.trim() ?? "",
      }))
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
      ),
    latentToolSummary: {
      categories: uniqueStrings(input.latentToolSummary?.categories ?? []),
      integrationNamespaces: uniqueStrings(
        input.latentToolSummary?.integrationNamespaces ?? [],
      ),
      mcpNamespaces: uniqueStrings(
        input.latentToolSummary?.mcpNamespaces ?? [],
      ),
    },
    mcpToolNames: uniqueStrings(input.mcpToolNames),
    memoryPromptLines: input.memoryPromptLines
      .map((line) => line.trim())
      .filter(Boolean),
    skillRoots: uniqueStrings(input.skillRoots),
    preferredProjectRoot: input.preferredProjectRoot?.trim() || null,
    projectCandidates: [...(input.projectCandidates ?? [])].sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.path.localeCompare(right.path, undefined, {
          sensitivity: "base",
        }),
    ),
    shellStartDirectory: input.shellStartDirectory?.trim() || null,
    sourceMessageId: input.sourceMessageId?.trim() || null,
    toolTags: normalizeSentinelComposerToolTags(input.toolTags),
    workspaceRoot: input.workspaceRoot?.trim() || null,
  };
}
