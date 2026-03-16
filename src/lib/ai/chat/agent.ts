import {
  generateText,
  hasToolCall,
  stepCountIs,
  ToolLoopAgent,
  type StopCondition,
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
import type { ThreadPromptContext } from "./prompt-context";
import { buildTools } from "./tools";
import { buildThreadAgentInstructions } from "./instructions";

// ---------------------------------------------------------------------------
// Call options schema
// ---------------------------------------------------------------------------

const threadAgentCallOptionsSchema = z.object({
  defaultDirectory: z.string().optional(),
  globalSkillsBasePath: z.string().nullable().optional(),
  integrationTools: z.custom<ToolSet>().optional(),
  memorySettings: z.custom<MemorySettings>(),
  mcpTools: z.custom<ToolSet>().optional(),
  permissionMode: z.custom<PermissionMode>(),
  promptContext: z.custom<ThreadPromptContext>(),
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
// Custom stop condition: all tasks resolved
// ---------------------------------------------------------------------------

type TaskSnapshot = { id: string; status: string };

function extractTaskState(steps: Array<{ toolResults?: unknown[] }>) {
  const tasks = new Map<string, string>();
  for (const step of steps) {
    for (const result of (step.toolResults ?? []) as Array<{
      toolName?: string;
      result?: { action?: string; task?: TaskSnapshot | null };
    }>) {
      if (result.toolName !== "manage_task") continue;
      const task = result.result?.task;
      if (!task?.id) continue;
      if (result.result?.action === "delete") {
        tasks.delete(task.id);
      } else {
        tasks.set(task.id, task.status);
      }
    }
  }
  return tasks;
}

const TERMINAL_TASK_STATUSES = new Set(["completed", "blocked"]);

const allTasksResolved: StopCondition<ToolSet> = ({ steps }) => {
  const tasks = extractTaskState(steps);
  if (tasks.size === 0) return false;
  for (const status of tasks.values()) {
    if (!TERMINAL_TASK_STATUSES.has(status)) return false;
  }
  return true;
};

// ---------------------------------------------------------------------------
// prepareStep helpers
// ---------------------------------------------------------------------------

const MUTATION_TOOLS = new Set([
  "edit",
  "multiedit",
  "create_file",
  "delete_file",
  "move_file",
  "apply_patch",
]);

const TASK_ENFORCEMENT_ADDON = [
  "",
  "## Step Directive: Task Tracking Required",
  "You have not created any tasks yet. Before continuing with execution, break down your remaining work into tasks using manage_task.",
  "Always track your progress with tasks: create them before starting, mark in_progress while working, and completed after validation.",
].join("\n");

const VALIDATION_ADDON = [
  "",
  "## Step Directive: Validate Your Changes",
  "You just made file changes. Before proceeding to the next task:",
  "1. Read the modified files to verify correctness.",
  "2. Run relevant checks via diagnostics or run_task (lint, typecheck, test) when available.",
  "3. Update the corresponding task status with manage_task.",
  "Do not mark a task as completed until the changes are validated.",
].join("\n");

function buildStepProgressAddon(
  steps: Array<{ toolResults?: unknown[] }>,
  stepNumber: number,
) {
  const tasks = extractTaskState(steps);
  if (tasks.size === 0) return "";

  const completed = [...tasks.values()].filter((s) => s === "completed").length;
  const blocked = [...tasks.values()].filter((s) => s === "blocked").length;
  const remaining = tasks.size - completed - blocked;

  if (remaining === 0) return "";

  return [
    "",
    `## Step Progress (step ${stepNumber})`,
    `Tasks: ${completed}/${tasks.size} completed${blocked > 0 ? `, ${blocked} blocked` : ""}, ${remaining} remaining.`,
    "Keep working through remaining tasks. Do not stop until all tasks are completed or blocked.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

const MAX_AGENT_STEPS = 75;

function isNoSuchToolError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "NoSuchToolError" ||
    error.constructor?.name === "NoSuchToolError"
  );
}

export function createThreadAgent({
  attachmentDownload,
  languageModel,
  providerOptions,
}: {
  attachmentDownload?: Experimental_DownloadFunction;
  languageModel: unknown;
  providerOptions?: SharedV3ProviderOptions;
}) {
  let cachedInstructions: string | undefined;

  const model = languageModel as ConstructorParameters<
    typeof ToolLoopAgent
  >[0]["model"];

  return new ToolLoopAgent({
    ...(attachmentDownload
      ? { experimental_download: attachmentDownload }
      : {}),
    model,
    ...(providerOptions ? { providerOptions } : {}),
    callOptionsSchema: threadAgentCallOptionsSchema,
    stopWhen: [
      stepCountIs(MAX_AGENT_STEPS),
      hasToolCall("ask_question"),
      allTasksResolved,
    ],
    experimental_repairToolCall: async ({
      toolCall,
      inputSchema,
      error,
    }) => {
      if (isNoSuchToolError(error)) {
        return null;
      }

      const schema = await inputSchema({ toolName: toolCall.toolName });
      const result = await generateText({
        model,
        ...(providerOptions ? { providerOptions } : {}),
        system: [
          "You are a tool call repair agent.",
          "The user will provide a malformed tool call and the JSON Schema for that tool.",
          "Return ONLY a valid JSON object that conforms to the schema. Do not wrap in markdown.",
        ].join(" "),
        prompt: [
          `Tool: ${toolCall.toolName}`,
          `Malformed input: ${toolCall.input}`,
          `Error: ${error.message}`,
          `Schema: ${JSON.stringify(schema)}`,
        ].join("\n"),
      });

      try {
        return { ...toolCall, input: result.text };
      } catch {
        return null;
      }
    },
    prepareCall: ({ options, ...settings }) => {
      const tools = buildTools(options);
      const instructions = buildThreadAgentInstructions({
        activeToolNames: Object.keys(tools),
        promptContext: options.promptContext,
        systemPrompt: options.systemPrompt,
      });
      cachedInstructions = instructions;
      return {
        ...settings,
        instructions,
        tools,
      };
    },
    prepareStep: async ({ stepNumber, steps }) => {
      const baseSystem = cachedInstructions ?? "";

      const allToolCalls = steps.flatMap((s) => s.toolCalls ?? []);
      const hasCreatedTasks = allToolCalls.some(
        (c) => c.toolName === "manage_task",
      );
      const lastStep = steps.at(-1);
      const lastStepHadMutations = (lastStep?.toolCalls ?? []).some((c) =>
        MUTATION_TOOLS.has(c.toolName),
      );

      const progressAddon = buildStepProgressAddon(steps, stepNumber);

      if (stepNumber >= 3 && !hasCreatedTasks) {
        return {
          system: baseSystem + TASK_ENFORCEMENT_ADDON + progressAddon,
        };
      }

      if (lastStepHadMutations) {
        return {
          system: baseSystem + VALIDATION_ADDON + progressAddon,
        };
      }

      if (progressAddon) {
        return { system: baseSystem + progressAddon };
      }

      return {};
    },
  });
}
