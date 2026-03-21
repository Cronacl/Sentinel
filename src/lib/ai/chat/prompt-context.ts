import type { MemorySettings } from "@/lib/memory";
import type { IntegrationProvider, MCPTransportId } from "@/server/db/enums";
import type { ThreadMode, ThreadPlanAudience } from "@/lib/plan";
import type { PermissionMode } from "@/lib/security";
import type { SearchSettings } from "@/lib/search";
import type { SearchProviderRuntimeMap } from "@/lib/search/providers/runtime";
import type { SkillMetadata } from "@/lib/skills";
import type { WebFetchSettings } from "@/lib/webfetch";

import type { ToolApprovalPolicyMap } from "./tool-approval-policy";

export type ThreadPromptIntegration = {
  aliases?: string[];
  capabilitySummary?: string;
  provider: IntegrationProvider;
  label: string;
  toolCount: number;
};

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
  aliases?: string[];
  capabilitySummary?: string;
  catalogId?: string;
  id: string;
  name: string;
  namespace: string;
  toolCount: number;
  transport: MCPTransportId;
};

export type ThreadPromptContext = {
  availableSkills: SkillMetadata[];
  allowedInspectionRoots: string[];
  allowedMutationRoot: string | null;
  enabledIntegrations: ThreadPromptIntegration[];
  enabledMcpServers: ThreadPromptMcpServer[];
  latestUserText: string | null;
  latentToolSummary: ThreadPromptLatentToolSummary;
  mcpToolNames: string[];
  memoryPromptLines: string[];
  memorySettings: MemorySettings;
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
    allowedInspectionRoots: uniqueStrings(input.allowedInspectionRoots ?? []),
    allowedMutationRoot: input.allowedMutationRoot?.trim() || null,
    availableSkills: [...input.availableSkills],
    latestUserText: input.latestUserText?.trim() || null,
    enabledIntegrations: [...(input.enabledIntegrations ?? [])]
      .map((integration) => ({
        ...integration,
        aliases: uniqueStrings(integration.aliases ?? []),
        capabilitySummary: integration.capabilitySummary?.trim() ?? "",
      }))
      .sort((left, right) =>
        left.label.localeCompare(right.label, undefined, {
          sensitivity: "base",
        }),
      ),
    enabledMcpServers: [...(input.enabledMcpServers ?? [])]
      .map((server) => ({
        ...server,
        aliases: uniqueStrings(server.aliases ?? []),
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
    workspaceRoot: input.workspaceRoot?.trim() || null,
  };
}
