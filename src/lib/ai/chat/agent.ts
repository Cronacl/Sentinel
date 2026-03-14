import {
  hasToolCall,
  stepCountIs,
  ToolLoopAgent,
  type ToolSet,
  type Experimental_DownloadFunction,
} from "ai";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { PermissionMode } from "@/lib/security";
import type { SearchProviderRuntimeMap } from "@/lib/search/providers/runtime";
import type { SearchSettings } from "@/lib/search";
import type { MemorySettings } from "@/lib/memory";
import type { SkillMetadata } from "@/lib/skills";
import type { WebFetchSettings } from "@/lib/webfetch";
import type { ThreadMode } from "@/lib/plan";
import { z } from "zod";

import type { ToolApprovalPolicyMap } from "./tool-approval-policy";
import { buildTools } from "./tools";
import { buildThreadAgentInstructions } from "./instructions";

// ---------------------------------------------------------------------------
// Call options schema
// ---------------------------------------------------------------------------

const threadAgentCallOptionsSchema = z.object({
  defaultDirectory: z.string().optional(),
  memorySettings: z.custom<MemorySettings>(),
  mcpTools: z.custom<ToolSet>().optional(),
  permissionMode: z.custom<PermissionMode>(),
  searchProviders: z.custom<SearchProviderRuntimeMap>(),
  searchSettings: z.custom<SearchSettings>(),
  availableSkills: z.array(z.custom<SkillMetadata>()),
  skillRoots: z.array(z.string()),
  sourceMessageId: z.string().nullable().optional(),
  systemPrompt: z.string(),
  threadId: z.string(),
  threadMode: z.custom<ThreadMode>(),
  toolApprovalPolicies: z.custom<ToolApprovalPolicyMap>(),
  toolsEnabled: z.boolean(),
  userId: z.string(),
  webFetchSettings: z.custom<WebFetchSettings>(),
  workspaceId: z.string().nullable().optional(),
});

export type ThreadAgentCallOptions = z.infer<
  typeof threadAgentCallOptionsSchema
>;

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

export function createThreadAgent({
  attachmentDownload,
  languageModel,
  providerOptions,
}: {
  attachmentDownload?: Experimental_DownloadFunction;
  languageModel: unknown;
  providerOptions?: SharedV3ProviderOptions;
}) {
  return new ToolLoopAgent({
    ...(attachmentDownload
      ? { experimental_download: attachmentDownload }
      : {}),
    model: languageModel as ConstructorParameters<
      typeof ToolLoopAgent
    >[0]["model"],
    ...(providerOptions ? { providerOptions } : {}),
    callOptionsSchema: threadAgentCallOptionsSchema,
    stopWhen: [stepCountIs(12), hasToolCall("ask_question")],
    prepareCall: ({ options, ...settings }) => {
      const tools = buildTools(options);
      return {
        ...settings,
        instructions: buildThreadAgentInstructions(options, Object.keys(tools)),
        tools,
      };
    },
  });
}
