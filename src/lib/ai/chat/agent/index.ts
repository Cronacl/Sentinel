import {
  generateText,
  hasToolCall,
  isStepCount,
  ToolLoopAgent,
  type StopCondition,
  type ToolSet,
  type Experimental_DownloadFunction,
} from "ai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { ImageGenerationRuntime } from "@/lib/ai/providers/images";
import type { VideoGenerationRuntime } from "@/lib/ai/providers/videos";
import type { PermissionMode } from "@/lib/security";
import type { SearchProviderRuntimeMap } from "@/lib/search/providers/runtime";
import type { SearchSettings } from "@/lib/search";
import type { MemoryRuntimeState } from "@/lib/memory";
import type { SkillMetadata } from "@/lib/skills";
import type { WebFetchSettings } from "@/lib/webfetch";
import type { ThreadMode } from "@/lib/plan";
import { z } from "zod";
import { AI_PROVIDERS, type AIProvider } from "@/server/db/enums";

import type { ToolApprovalPolicyMap } from "../tools/policy";
import type { ThreadPromptContext } from "../context/prompt-context";
import { computeLatentToolSummary } from "../tools/selection";
import { buildToolRoutingEvidence, routeToolExposure } from "../tools/router";
import { buildTools } from "../tools";
import { buildThreadAgentInstructions } from "../context/instructions";

// ---------------------------------------------------------------------------
// Call options schema
// ---------------------------------------------------------------------------

type TaskSnapshot = { id: string; status: string };

const threadAgentCallOptionsSchema = z.object({
  agentRole: z.enum(["primary", "subagent"]).optional(),
  defaultDirectory: z.string().optional(),
  globalSkillsBasePath: z.string().nullable().optional(),
  imageGenerationRuntime: z.custom<ImageGenerationRuntime>(),
  integrationTools: z.custom<ToolSet>().optional(),
  memoryRuntime: z.custom<MemoryRuntimeState>(),
  mcpTools: z.custom<ToolSet>().optional(),
  permissionMode: z.custom<PermissionMode>(),
  // Task statuses of the thread plan when the run started, so task tracking
  // sees tasks created by earlier runs.
  planTasks: z.array(z.custom<TaskSnapshot>()).optional(),
  preferredProjectRoot: z.string().nullable().optional(),
  promptContext: z.custom<ThreadPromptContext>(),
  resolvedModelId: z.string().optional(),
  resolvedProviderId: z.enum(AI_PROVIDERS).optional(),
  searchProviders: z.custom<SearchProviderRuntimeMap>(),
  searchSettings: z.custom<SearchSettings>(),
  shellStartDirectory: z.string().nullable().optional(),
  availableSkills: z.array(z.custom<SkillMetadata>()),
  skillRoots: z.array(z.string()),
  sourceMessageId: z.string().nullable().optional(),
  systemPrompt: z.string(),
  threadId: z.string(),
  threadMode: z.custom<ThreadMode>(),
  toolApprovalPolicies: z.custom<ToolApprovalPolicyMap>(),
  toolsEnabled: z.boolean(),
  userId: z.string(),
  videoGenerationRuntime: z.custom<VideoGenerationRuntime>(),
  webFetchSettings: z.custom<WebFetchSettings>(),
  workspaceId: z.string().nullable().optional(),
});

export type ThreadAgentCallOptions = z.infer<
  typeof threadAgentCallOptionsSchema
>;

// ---------------------------------------------------------------------------
// Custom stop condition: all tasks resolved
// ---------------------------------------------------------------------------

type TaskSteps = Array<{ toolResults?: unknown[] }>;

// Applies this run's manage_task results on top of the plan's task statuses
// from when the run started. `touched` stays false until this run changes a
// task, so tasks left over from earlier runs never end or steer a run alone.
function extractTaskState(
  steps: TaskSteps,
  initialTasks: ReadonlyMap<string, string>,
) {
  const tasks = new Map(initialTasks);
  let touched = false;
  for (const step of steps) {
    for (const result of (step.toolResults ?? []) as Array<{
      toolName?: string;
      output?: { action?: string; task?: TaskSnapshot | null };
    }>) {
      if (result.toolName !== "manage_task") continue;
      const task = result.output?.task;
      if (!task?.id) continue;
      touched = true;
      if (result.output?.action === "delete") {
        tasks.delete(task.id);
      } else {
        tasks.set(task.id, task.status);
      }
    }
  }
  return { tasks, touched };
}

const TERMINAL_TASK_STATUSES = new Set(["completed", "blocked"]);

function areTasksResolved({
  tasks,
  touched,
}: ReturnType<typeof extractTaskState>) {
  if (!touched || tasks.size === 0) return false;
  for (const status of tasks.values()) {
    if (!TERMINAL_TASK_STATUSES.has(status)) return false;
  }
  return true;
}

// Stops the step after the one that resolved the last open task: that step
// lets the model report back, but it cannot keep working past it. A step
// that opens new tasks keeps the run going.
function createAllTasksResolvedCondition(
  getInitialTasks: () => ReadonlyMap<string, string>,
): StopCondition<ToolSet> {
  return ({ steps }) =>
    steps.length > 1 &&
    areTasksResolved(extractTaskState(steps.slice(0, -1), getInitialTasks())) &&
    areTasksResolved(extractTaskState(steps, getInitialTasks()));
}

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

// No step number here: the text only changes with the task counts, so it does
// not break prompt-prefix caching on every step.
function buildStepProgressAddon(
  steps: TaskSteps,
  initialTasks: ReadonlyMap<string, string>,
) {
  const { tasks, touched } = extractTaskState(steps, initialTasks);
  if (!touched || tasks.size === 0) return "";

  const completed = [...tasks.values()].filter((s) => s === "completed").length;
  const blocked = [...tasks.values()].filter((s) => s === "blocked").length;
  const remaining = tasks.size - completed - blocked;

  if (remaining === 0) return "";

  return [
    "",
    "## Step Progress",
    `Tasks: ${completed}/${tasks.size} completed${blocked > 0 ? `, ${blocked} blocked` : ""}, ${remaining} remaining.`,
    "Keep working through remaining tasks. Do not stop until all tasks are completed or blocked.",
  ].join("\n");
}

function mergeToolRoutingContext(
  runtimeContext: Record<string, unknown> | undefined,
  toolRouting: unknown,
): Record<string, unknown> | undefined {
  if (!toolRouting) {
    return runtimeContext;
  }

  return {
    ...runtimeContext,
    toolRouting,
  };
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
  providerOptions?: ProviderOptions;
}) {
  let cachedInstructions: string | undefined;
  let cachedActiveToolNames: string[] = [];
  let cachedAllToolNames: string[] = [];
  let cachedPromptContext: ThreadPromptContext | null = null;
  let cachedInitialActiveTools: string[] = [];
  let cachedPlanTasks: ReadonlyMap<string, string> = new Map();
  let cachedResolvedProviderId: AIProvider | undefined;
  let cachedRoutingAudit: unknown = null;
  let cachedRoutingEvidenceSignature: string | null = null;
  let cachedSystemPrompt = "";
  let cachedUserId = "";

  const model = languageModel as ConstructorParameters<
    typeof ToolLoopAgent
  >[0]["model"];

  return new ToolLoopAgent({
    ...(attachmentDownload
      ? { experimental_download: attachmentDownload }
      : {}),
    model,
    ...(providerOptions ? { providerOptions } : {}),
    // Context compaction feeds its summary back as a synthetic system message
    // built server-side (runtime/context-compaction.ts); AI SDK 7 rejects
    // system messages in the prompt unless this is set.
    allowSystemInMessages: true,
    callOptionsSchema: threadAgentCallOptionsSchema,
    stopWhen: [
      isStepCount(MAX_AGENT_STEPS),
      hasToolCall("ask_question"),
      createAllTasksResolvedCondition(() => cachedPlanTasks),
    ],
    repairToolCall: async ({ toolCall, inputSchema, error }) => {
      if (isNoSuchToolError(error)) {
        return null;
      }

      const schema = await inputSchema({ toolName: toolCall.toolName });
      const result = await generateText({
        model,
        ...(providerOptions ? { providerOptions } : {}),
        instructions: [
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
    prepareCall: async ({ options, ...settings }) => {
      const tools = buildTools(options);
      const allToolNames = Object.keys(tools);
      const initialRouting = await routeToolExposure({
        availableToolNames: allToolNames,
        mainLanguageModel: model,
        mainProviderOptions: providerOptions,
        promptContext: {
          ...options.promptContext,
          latentToolSummary: computeLatentToolSummary(
            allToolNames,
            [],
            options.promptContext,
          ),
        },
        ...(options.resolvedProviderId
          ? { resolvedProviderId: options.resolvedProviderId }
          : {}),
        stage: "initial",
        userId: options.userId,
      });
      const initialActiveTools = initialRouting.activeToolNames;
      const promptContext = {
        ...options.promptContext,
        latentToolSummary: computeLatentToolSummary(
          allToolNames,
          initialActiveTools,
          options.promptContext,
        ),
      };
      const instructions = buildThreadAgentInstructions({
        activeToolNames: initialActiveTools,
        allToolNames,
        promptContext,
        systemPrompt: options.systemPrompt,
      });
      cachedInstructions = instructions;
      cachedActiveToolNames = initialActiveTools;
      cachedAllToolNames = allToolNames;
      cachedPromptContext = promptContext;
      cachedInitialActiveTools = initialActiveTools;
      cachedPlanTasks = new Map(
        (options.planTasks ?? []).map((task) => [task.id, task.status]),
      );
      cachedResolvedProviderId = options.resolvedProviderId;
      cachedRoutingAudit = initialRouting.audit;
      cachedRoutingEvidenceSignature = null;
      cachedSystemPrompt = options.systemPrompt;
      cachedUserId = options.userId;
      return {
        ...settings,
        activeTools: initialActiveTools as never[],
        instructions,
        runtimeContext: {
          ...settings.runtimeContext,
          toolRouting: initialRouting.audit,
        },
        tools,
      };
    },
    // AI SDK 7 carries instructions returned here forward to later steps, so
    // every branch returns the full instructions for this step; otherwise a
    // step directive would stick to every step after it.
    prepareStep: async ({ runtimeContext, stepNumber, steps }) => {
      const promptContext = cachedPromptContext;
      let activeToolNames = cachedActiveToolNames;

      if (promptContext && cachedAllToolNames.length > 0 && steps.length > 0) {
        const evidence = buildToolRoutingEvidence(steps);
        const evidenceSignature = JSON.stringify(evidence);
        const hasMaterialEvidence =
          evidence.inspectionPerformed ||
          evidence.projectContextFound ||
          evidence.targetFilesFound ||
          evidence.localInspectionWasInsufficient ||
          evidence.executionFailed ||
          evidence.integrationNamespaces.length > 0 ||
          evidence.mcpNamespaces.length > 0 ||
          evidence.missingCommand !== null ||
          evidence.missingToolchain ||
          evidence.suggestedNextAction === "install";

        if (
          hasMaterialEvidence &&
          evidenceSignature !== cachedRoutingEvidenceSignature
        ) {
          const reroute = await routeToolExposure({
            availableToolNames: cachedAllToolNames,
            evidence,
            initialActiveTools: cachedInitialActiveTools,
            mainLanguageModel: model,
            mainProviderOptions: providerOptions,
            promptContext,
            ...(cachedResolvedProviderId
              ? { resolvedProviderId: cachedResolvedProviderId }
              : {}),
            stage: "step",
            steps,
            userId: cachedUserId,
          });
          activeToolNames = reroute.activeToolNames;
          cachedRoutingAudit = reroute.audit;
          cachedRoutingEvidenceSignature = evidenceSignature;
        }
      }

      cachedActiveToolNames = activeToolNames;
      const stepPromptContext =
        promptContext && cachedAllToolNames.length > 0
          ? {
              ...promptContext,
              latentToolSummary: computeLatentToolSummary(
                cachedAllToolNames,
                activeToolNames,
                promptContext,
              ),
            }
          : promptContext;
      const baseSystem =
        stepPromptContext && cachedAllToolNames.length > 0
          ? buildThreadAgentInstructions({
              activeToolNames,
              allToolNames: cachedAllToolNames,
              promptContext: stepPromptContext,
              systemPrompt: cachedSystemPrompt,
            })
          : (cachedInstructions ?? "");

      const allToolCalls = steps.flatMap((s) => s.toolCalls ?? []);
      const hasCreatedTasks = allToolCalls.some(
        (c) => c.toolName === "manage_task",
      );
      const lastStep = steps.at(-1);
      const lastStepHadMutations = (lastStep?.toolCalls ?? []).some((c) =>
        MUTATION_TOOLS.has(c.toolName),
      );

      const progressAddon = buildStepProgressAddon(steps, cachedPlanTasks);
      const stepSettings = {
        activeTools: activeToolNames as never[],
        runtimeContext: mergeToolRoutingContext(
          runtimeContext,
          cachedRoutingAudit,
        ),
      };
      if (stepNumber >= 3 && !hasCreatedTasks) {
        return {
          ...stepSettings,
          instructions: baseSystem + TASK_ENFORCEMENT_ADDON + progressAddon,
        };
      }

      if (lastStepHadMutations) {
        return {
          ...stepSettings,
          instructions: baseSystem + VALIDATION_ADDON + progressAddon,
        };
      }

      return {
        ...stepSettings,
        instructions: baseSystem + progressAddon,
      };
    },
  });
}
