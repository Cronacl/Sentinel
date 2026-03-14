import type { MemorySettings } from "@/lib/memory";
import type { ThreadMode, ThreadPlanAudience } from "@/lib/plan";
import type { PermissionMode } from "@/lib/security";
import type { SearchSettings } from "@/lib/search";
import type { SearchProviderRuntimeMap } from "@/lib/search/providers/runtime";
import type { SkillMetadata } from "@/lib/skills";
import type { WebFetchSettings } from "@/lib/webfetch";

import type { ToolApprovalPolicyMap } from "./tool-approval-policy";

export type ThreadPromptPlanSummary = {
  audience: ThreadPlanAudience;
  goal: string;
  hasPendingQuestions: boolean;
  summary: string;
  taskCount: number;
  title: string;
};

export type ThreadPromptContext = {
  availableSkills: SkillMetadata[];
  mcpToolNames: string[];
  memoryPromptLines: string[];
  memorySettings: MemorySettings;
  permissionMode: PermissionMode;
  planSummary: ThreadPromptPlanSummary | null;
  searchProviders: SearchProviderRuntimeMap;
  searchSettings: SearchSettings;
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

export function buildThreadPromptContext(
  input: ThreadPromptContext,
): ThreadPromptContext {
  return {
    ...input,
    availableSkills: [...input.availableSkills],
    mcpToolNames: uniqueStrings(input.mcpToolNames),
    memoryPromptLines: input.memoryPromptLines
      .map((line) => line.trim())
      .filter(Boolean),
    skillRoots: uniqueStrings(input.skillRoots),
    sourceMessageId: input.sourceMessageId?.trim() || null,
    workspaceRoot: input.workspaceRoot?.trim() || null,
  };
}
