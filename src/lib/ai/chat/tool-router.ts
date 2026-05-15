import { Output, generateText, type StepResult, type ToolSet } from "ai";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import { z } from "zod";

import type { AIProvider } from "@/server/db/enums";
import { getReasoningProviderOptions } from "@/lib/ai/providers/models";
import {
  findIntegrationProviderByToolName,
  getIntegrationToolPrefix,
} from "@/lib/integrations/runtime";

import type { ThreadPromptContext } from "./prompt-context";
import {
  hasWorkspaceInspectionContext,
  selectAlwaysOnChatTools,
  selectInitialActiveTools,
  selectStepActiveTools,
} from "./tool-selection";
import { resolveToolSelectionModel } from "./tool-selection-model";
import {
  getActiveCategories,
  getToolsInCategory,
  type ToolCategory,
} from "./tools/catalog";

const toolCategoryValues = [
  "browser",
  "computer",
  "execution",
  "inspection",
  "integration",
  "memory",
  "mutation",
  "plan",
  "skill",
  "web",
] as const satisfies readonly ToolCategory[];

const toolRoutingDecisionSchema = z.object({
  categories: z
    .array(z.enum(toolCategoryValues))
    .max(toolCategoryValues.length),
  confidence: z.enum(["low", "medium", "high"]),
  integrationNamespaces: z.array(z.string().trim().min(1)).max(12),
  mcpNamespaces: z.array(z.string().trim().min(1)).max(12),
  reasoning: z.string().trim().min(1).max(600),
});

export type ToolRoutingDecision = z.infer<typeof toolRoutingDecisionSchema>;

export type ToolRoutingEvidence = {
  executionFailed: boolean;
  inspectionPerformed: boolean;
  integrationNamespaces: string[];
  lastExitCode: number | null;
  localInspectionWasInsufficient: boolean;
  mcpNamespaces: string[];
  missingCommand: string | null;
  missingToolchain: boolean;
  projectContextFound: boolean;
  suggestedNextAction: "install" | "inspect" | "none" | "retry" | null;
  targetFilesFound: boolean;
};

export type ToolRoutingManifest = {
  allowedInspectionRoots: string[];
  allowedMutationRoot: string | null;
  availableCategories: ToolCategory[];
  availableIntegrations: Array<{
    capabilitySummary: string;
    label: string;
    provider: string;
    toolCount: number;
  }>;
  availableMcpServers: Array<{
    capabilitySummary: string;
    catalogId?: string;
    name: string;
    namespace: string;
    toolCount: number;
  }>;
  availableIntegrationNamespaces: string[];
  availableMcpNamespaces: string[];
  permissionMode: ThreadPromptContext["permissionMode"];
  planSummary: ThreadPromptContext["planSummary"];
  preferredProjectRoot: string | null;
  projectCandidates: ThreadPromptContext["projectCandidates"];
  shellStartDirectory: string | null;
  stage: "initial" | "step";
  threadMode: ThreadPromptContext["threadMode"];
  toolUniverseSize: number;
  userRequest: string;
  workspaceRoot: string | null;
  evidence?: ToolRoutingEvidence;
};

export type ToolRoutingAudit = {
  decision: ToolRoutingDecision | null;
  evidence: ToolRoutingEvidence | null;
  finalActiveToolCount: number;
  mode: "deterministic-fallback" | "model-router";
  reason: string;
  remediationTriggerSource: "router" | null;
  rejectedSelections: string[];
  routerModelId: string | null;
  selectedCategories: string[];
  selectedIntegrationNamespaces: string[];
  selectedMcpNamespaces: string[];
  stage: "initial" | "step";
  usedFallbackModel: boolean;
};

export type ValidatedToolRoutingDecision = {
  activeToolNames: string[];
  audit: ToolRoutingAudit;
};

type RouteToolExposureInput = {
  availableToolNames: string[];
  evidence?: ToolRoutingEvidence;
  initialActiveTools?: string[];
  mainLanguageModel: unknown;
  mainProviderOptions?: SharedV3ProviderOptions;
  promptContext: ThreadPromptContext;
  resolvedProviderId?: AIProvider | null;
  stage: "initial" | "step";
  steps?: ReadonlyArray<StepResult<ToolSet>>;
  userId: string;
};

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  ).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function buildCoreTools(
  availableToolNames: string[],
  promptContext: ThreadPromptContext,
) {
  const coreTools = new Set<string>();

  if (promptContext.threadMode === "plan") {
    for (const toolName of [
      "create_plan",
      "update_plan",
      "manage_task",
      "ask_question",
    ]) {
      if (availableToolNames.includes(toolName)) {
        coreTools.add(toolName);
      }
    }
  } else if (availableToolNames.includes("manage_task")) {
    coreTools.add("manage_task");
  }

  if (availableToolNames.includes("run_subagent")) {
    coreTools.add("run_subagent");
  }

  if (
    promptContext.availableSkills.length > 0 &&
    availableToolNames.includes("load_skill")
  ) {
    coreTools.add("load_skill");
  }

  return coreTools;
}

function applyAlwaysOnChatBaseline(
  activeTools: Set<string>,
  availableToolNames: string[],
  promptContext: ThreadPromptContext,
) {
  for (const toolName of selectAlwaysOnChatTools({
    availableToolNames,
    promptContext,
  })) {
    activeTools.add(toolName);
  }
}

function buildFallbackActiveTools(input: RouteToolExposureInput) {
  if (input.stage === "step") {
    return uniqueStrings(
      selectStepActiveTools({
        availableToolNames: input.availableToolNames,
        initialActiveTools: input.initialActiveTools ?? [],
        promptContext: input.promptContext,
        steps: input.steps ?? [],
      }),
    );
  }

  return uniqueStrings(
    selectInitialActiveTools({
      availableToolNames: input.availableToolNames,
      promptContext: input.promptContext,
    }),
  );
}

function getRemediationTriggerSource(
  evidence: ToolRoutingEvidence | null,
): boolean {
  return Boolean(
    evidence &&
    (Boolean(evidence.missingCommand) ||
      evidence.missingToolchain ||
      evidence.lastExitCode === 127 ||
      evidence.suggestedNextAction === "install"),
  );
}

export function buildToolRoutingEvidence(
  steps: ReadonlyArray<StepResult<ToolSet>>,
): ToolRoutingEvidence {
  const integrationNamespaces = new Set<string>();
  const mcpNamespaces = new Set<string>();
  let executionFailed = false;
  let lastExitCode: number | null = null;
  let inspectionPerformed = false;
  let localInspectionWasInsufficient = false;
  let missingCommand: string | null = null;
  let missingToolchain = false;
  let projectContextFound = false;
  let suggestedNextAction: "install" | "inspect" | "none" | "retry" | null =
    null;
  let targetFilesFound = false;

  const projectMarkerPattern =
    /\b(package\.json|bun\.lockb?|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|tsconfig\.json|next\.config|vite\.config|src\/|app\/|pages\/)\b/i;
  const targetFilePattern =
    /\b[\w./-]+\.(ts|tsx|js|jsx|json|md|css|scss|py|go|rs)\b/i;
  const insufficientPattern =
    /\b(no matches|no files|0 files|0 results|not found|empty)\b/i;

  for (const step of steps) {
    for (const toolCall of step.toolCalls ?? []) {
      if (["list", "glob", "read", "grep"].includes(toolCall.toolName)) {
        inspectionPerformed = true;
      }

      const integrationProvider = findIntegrationProviderByToolName(
        toolCall.toolName,
      );
      if (integrationProvider) {
        integrationNamespaces.add(integrationProvider);
      }

      const mcpMatch = /^mcp_([^_]+(?:_[^_]+)*)__/.exec(toolCall.toolName);
      if (mcpMatch?.[1]) {
        mcpNamespaces.add(mcpMatch[1]);
      }
    }

    for (const toolResult of step.toolResults ?? []) {
      const serialized = JSON.stringify(toolResult);
      const resultPayload =
        toolResult &&
        typeof toolResult === "object" &&
        "result" in toolResult &&
        toolResult.result &&
        typeof toolResult.result === "object"
          ? toolResult.result
          : toolResult;

      if (projectMarkerPattern.test(serialized)) {
        projectContextFound = true;
      }
      if (targetFilePattern.test(serialized)) {
        targetFilesFound = true;
      }
      if (insufficientPattern.test(serialized)) {
        localInspectionWasInsufficient = true;
      }

      if (
        resultPayload &&
        typeof resultPayload === "object" &&
        "output" in resultPayload &&
        resultPayload.output &&
        typeof resultPayload.output === "object"
      ) {
        const output = resultPayload.output as Record<string, unknown>;
        if (typeof output.exitCode === "number") {
          lastExitCode = output.exitCode;
          if (output.exitCode !== 0) {
            executionFailed = true;
          }
        }
        if (typeof output.failureKind === "string") {
          if (
            output.failureKind === "missing_command" ||
            output.failureKind === "missing_toolchain"
          ) {
            missingToolchain = true;
          }
        }
        if (
          typeof output.missingCommand === "string" &&
          output.missingCommand.trim()
        ) {
          missingCommand = output.missingCommand.trim();
        }
        if (
          output.suggestedNextAction === "install" ||
          output.suggestedNextAction === "inspect" ||
          output.suggestedNextAction === "retry" ||
          output.suggestedNextAction === "none"
        ) {
          suggestedNextAction = output.suggestedNextAction;
        }
      }

      const missingCommandMatch =
        /(?:^|\b)([a-z0-9._+-]+): command not found\b/i.exec(serialized) ??
        /bash:\s*(?:line\s+\d+:\s*)?([a-z0-9._+-]+):\s*command not found\b/i.exec(
          serialized,
        );
      if (missingCommandMatch?.[1]) {
        missingCommand = missingCommandMatch[1];
        missingToolchain = true;
        executionFailed = true;
        suggestedNextAction ??= "install";
      }
      if (
        /exitCode":127\b/.test(serialized) ||
        /\bexit 127\b/i.test(serialized)
      ) {
        executionFailed = true;
        missingToolchain = true;
        suggestedNextAction ??= "install";
      }
    }
  }

  return {
    executionFailed,
    inspectionPerformed,
    integrationNamespaces: uniqueStrings([...integrationNamespaces]),
    lastExitCode,
    localInspectionWasInsufficient,
    mcpNamespaces: uniqueStrings([...mcpNamespaces]),
    missingCommand,
    missingToolchain,
    projectContextFound,
    suggestedNextAction,
    targetFilesFound,
  };
}

export function buildToolRoutingManifest({
  availableToolNames,
  evidence,
  promptContext,
  stage,
}: {
  availableToolNames: string[];
  evidence?: ToolRoutingEvidence;
  promptContext: ThreadPromptContext;
  stage: "initial" | "step";
}): ToolRoutingManifest {
  return {
    allowedInspectionRoots: promptContext.allowedInspectionRoots,
    allowedMutationRoot: promptContext.allowedMutationRoot,
    availableCategories: Array.from(
      getActiveCategories(availableToolNames),
    ).sort(),
    availableIntegrations: promptContext.enabledIntegrations.map(
      (integration) => ({
        capabilitySummary: integration.capabilitySummary ?? "",
        label: integration.label,
        provider: integration.provider,
        toolCount: integration.toolCount,
      }),
    ),
    availableMcpServers: promptContext.enabledMcpServers.map((server) => ({
      capabilitySummary: server.capabilitySummary ?? "",
      ...(server.catalogId ? { catalogId: server.catalogId } : {}),
      name: server.name,
      namespace: server.namespace,
      toolCount: server.toolCount,
    })),
    availableIntegrationNamespaces: uniqueStrings(
      promptContext.enabledIntegrations.map(
        (integration) => integration.provider,
      ),
    ),
    availableMcpNamespaces: uniqueStrings(
      promptContext.enabledMcpServers.map((server) => server.namespace),
    ),
    ...(evidence ? { evidence } : {}),
    permissionMode: promptContext.permissionMode,
    planSummary: promptContext.planSummary,
    preferredProjectRoot: promptContext.preferredProjectRoot,
    projectCandidates: promptContext.projectCandidates.slice(0, 6),
    shellStartDirectory: promptContext.shellStartDirectory,
    stage,
    threadMode: promptContext.threadMode,
    toolUniverseSize: availableToolNames.length,
    userRequest: promptContext.latestUserText?.trim() || "",
    workspaceRoot: promptContext.workspaceRoot,
  };
}

export function buildToolRouterSystemPrompt() {
  return [
    "You are a tool exposure router for a coding agent.",
    "Choose the smallest set of tool categories and namespaces needed for the next step only, not for the whole task.",
    "Minimize context cost aggressively, but do not under-route in a way that blocks obvious next actions.",
    "Do not activate tool families just because they might be useful later.",
    "In chat mode, workspace and web baseline tools are always on. Focus your routing decision on specialized add-on families and namespaces beyond that baseline.",
    "Distinguish carefully between project work, environment/bootstrap remediation, external research, and integration-targeted tasks.",
    "Default to the most direct source of truth: connected integrations or MCP servers before workspace or web when the user is clearly targeting that external system.",
    "Prefer read-only external tools before mutating ones.",
    "Default to inspection first when a workspace or skill root can answer the question.",
    "Do not spend routing budget on inspection, execution, mutation, or web in chat mode unless the thread is in plan mode; those baseline tools are already handled separately.",
    "Use the browser category only for Sentinel's live desktop browser surface: current tabs, localhost/manual UI testing, DOM snapshots, screenshots, console logs, navigation, clicks, fills, and key presses.",
    "Route browser when the user explicitly asks for browser-use/browser tools, the current browser tab, or live page interaction.",
    "Use the computer category for OS-level desktop work, Accessibility/AX inspection, screenshots, mouse/keyboard control, and local Mac app workflows such as Finder, Reminders, Calendar, Notes, System Settings, or other native apps.",
    "Use web tools for external/static information work: source discovery, documentation, articles, current facts, and reading known URLs without needing visible browser state.",
    "Do not route browser merely because the user mentions a web page, URL, documentation, or search; route browser when the request needs the live browser panel or page interaction.",
    "Do not route web as a replacement for browser when the user asks to inspect or operate the current browser tab.",
    "For environment remediation, installs, setup, missing commands, or missing toolchains, prefer shell_command exposure over plain-text refusal or useless run_task retries.",
    "Promote mutation only when the task clearly requires changes and the likely target files or edit scope are known.",
    "Use integrationNamespaces and mcpNamespaces when the task clearly targets that connected system, even if the user does not say the provider or namespace literally.",
    "Use web only for freshness, external documentation, or when local inspection has already proven insufficient.",
    "In plan mode, keep activation especially narrow and prefer planning plus inspection over execution or mutation.",
    "If confidence is low, stay narrow instead of activating broad tool families speculatively.",
    '"." means the active tool base for that call, not the filesystem root.',
    "Relative paths resolve from the selected workspace root unless a tool says otherwise.",
    "shell_command starts in shellStartDirectory and must stay inside allowed roots in default permissions mode.",
    "run_task may resolve upward to the nearest package.json, but only inside the workspace boundary.",
    "Approval-gated tools are still available capabilities. Route to them when they are the right next step.",
    "If prompt context says an integration or MCP server is connected, do not treat it as unavailable or inactive. Only a missing connection or failed tool call proves that.",
    "Return compact, minimal routing decisions.",
  ].join("\n");
}

export function buildToolRouterPrompt(manifest: ToolRoutingManifest) {
  return [
    "Choose which tool categories and namespaces should be active for the next agent step.",
    "Select only what is necessary immediately.",
    "Workspace and web baseline tools are already active in chat mode; choose only the extra specialized families and namespaces needed on top.",
    "When an external connected system is the clear target, prefer that integration or MCP namespace as the direct source.",
    "Return empty arrays for unused categories or namespaces.",
    "The runtime will enforce permissions and may reject unsafe selections.",
    "",
    JSON.stringify(manifest, null, 2),
  ].join("\n");
}

function expandIntegrationTools(
  availableToolNames: string[],
  promptContext: ThreadPromptContext,
  integrationNamespaces: string[],
  activeTools: Set<string>,
  rejectedSelections: string[],
) {
  const acceptedNamespaces = new Set<string>();
  const allowedNamespaces = new Set<string>(
    promptContext.enabledIntegrations.map(
      (integration) => integration.provider,
    ),
  );

  for (const namespace of uniqueStrings(integrationNamespaces)) {
    if (!allowedNamespaces.has(namespace)) {
      rejectedSelections.push(`integration:${namespace}:not-enabled`);
      continue;
    }

    const prefix = getIntegrationToolPrefix(
      namespace as Parameters<typeof getIntegrationToolPrefix>[0],
    );
    if (!prefix) {
      rejectedSelections.push(`integration:${namespace}:no-prefix`);
      continue;
    }

    let found = false;
    for (const toolName of availableToolNames) {
      if (toolName.startsWith(prefix)) {
        activeTools.add(toolName);
        found = true;
      }
    }
    if (!found) {
      rejectedSelections.push(`integration:${namespace}:no-tools`);
      continue;
    }
    acceptedNamespaces.add(namespace);
  }

  return acceptedNamespaces;
}

function expandMcpTools(
  availableToolNames: string[],
  promptContext: ThreadPromptContext,
  mcpNamespaces: string[],
  activeTools: Set<string>,
  rejectedSelections: string[],
) {
  const acceptedNamespaces = new Set<string>();
  const allowedNamespaces = new Set<string>(
    promptContext.enabledMcpServers.map((server) => server.namespace),
  );

  for (const namespace of uniqueStrings(mcpNamespaces)) {
    if (!allowedNamespaces.has(namespace)) {
      rejectedSelections.push(`mcp:${namespace}:not-enabled`);
      continue;
    }

    let found = false;
    for (const toolName of availableToolNames) {
      if (toolName.startsWith(`mcp_${namespace}__`)) {
        activeTools.add(toolName);
        found = true;
      }
    }
    if (!found) {
      rejectedSelections.push(`mcp:${namespace}:no-tools`);
      continue;
    }
    acceptedNamespaces.add(namespace);
  }

  return acceptedNamespaces;
}

export function validateToolRoutingDecision({
  availableToolNames,
  decision,
  promptContext,
  routerModelId,
  stage,
  usedFallbackModel,
  evidence = null,
}: {
  availableToolNames: string[];
  decision: ToolRoutingDecision;
  evidence?: ToolRoutingEvidence | null;
  promptContext: ThreadPromptContext;
  routerModelId: string | null;
  stage: "initial" | "step";
  usedFallbackModel: boolean;
}): ValidatedToolRoutingDecision {
  const activeTools = buildCoreTools(availableToolNames, promptContext);
  const rejectedSelections: string[] = [];
  const acceptedCategories = new Set<string>();
  const acceptedIntegrationNamespaces = new Set<string>();
  const acceptedMcpNamespaces = new Set<string>();
  const availableCategories = getActiveCategories(availableToolNames);
  const baselineManagedCategories =
    promptContext.threadMode === "chat"
      ? getActiveCategories(
          selectAlwaysOnChatTools({
            availableToolNames,
            promptContext,
          }),
        )
      : new Set<ToolCategory>();
  const workspaceContextAvailable =
    hasWorkspaceInspectionContext(promptContext);

  for (const category of uniqueStrings(decision.categories)) {
    if (!availableCategories.has(category as ToolCategory)) {
      rejectedSelections.push(`category:${category}:unavailable`);
      continue;
    }

    if (baselineManagedCategories.has(category as ToolCategory)) {
      rejectedSelections.push(`category:${category}:baseline-managed`);
      continue;
    }

    if (category === "integration") {
      rejectedSelections.push(`category:${category}:use-namespaces`);
      continue;
    }

    if (category === "plan") {
      if (promptContext.threadMode !== "plan") {
        rejectedSelections.push(`category:${category}:chat-mode-blocked`);
      } else {
        acceptedCategories.add(category);
      }
      continue;
    }

    if (category === "skill") {
      if (
        promptContext.availableSkills.length === 0 ||
        !availableToolNames.includes("load_skill")
      ) {
        rejectedSelections.push(`category:${category}:no-skills`);
      } else {
        activeTools.add("load_skill");
        acceptedCategories.add(category);
      }
      continue;
    }

    if (
      (category === "inspection" || category === "execution") &&
      !workspaceContextAvailable
    ) {
      rejectedSelections.push(`category:${category}:no-workspace-context`);
      continue;
    }

    if (category === "mutation" && !promptContext.allowedMutationRoot) {
      rejectedSelections.push(`category:${category}:no-mutation-root`);
      continue;
    }

    for (const toolName of getToolsInCategory(
      availableToolNames,
      category as ToolCategory,
    )) {
      activeTools.add(toolName);
    }
    acceptedCategories.add(category);
  }

  const acceptedIntegrations = expandIntegrationTools(
    availableToolNames,
    promptContext,
    decision.integrationNamespaces,
    activeTools,
    rejectedSelections,
  );
  for (const namespace of acceptedIntegrations) {
    acceptedIntegrationNamespaces.add(namespace);
  }

  const acceptedMcp = expandMcpTools(
    availableToolNames,
    promptContext,
    decision.mcpNamespaces,
    activeTools,
    rejectedSelections,
  );
  for (const namespace of acceptedMcp) {
    acceptedMcpNamespaces.add(namespace);
  }

  applyAlwaysOnChatBaseline(activeTools, availableToolNames, promptContext);

  const remediationTriggerSource =
    getRemediationTriggerSource(evidence) &&
    decision.categories.includes("execution")
      ? "router"
      : null;

  const activeToolNames = uniqueStrings([...activeTools]);

  return {
    activeToolNames,
    audit: {
      decision,
      evidence,
      finalActiveToolCount: activeToolNames.length,
      mode: "model-router",
      reason: remediationTriggerSource
        ? "validated-model-decision+forced-remediation"
        : "validated-model-decision",
      remediationTriggerSource:
        remediationTriggerSource && !decision.categories.includes("execution")
          ? remediationTriggerSource
          : remediationTriggerSource
            ? "router"
            : null,
      rejectedSelections,
      routerModelId,
      selectedCategories: uniqueStrings([...acceptedCategories]),
      selectedIntegrationNamespaces: uniqueStrings([
        ...acceptedIntegrationNamespaces,
      ]),
      selectedMcpNamespaces: uniqueStrings([...acceptedMcpNamespaces]),
      stage,
      usedFallbackModel,
    },
  };
}

function buildDeterministicFallbackResult(
  input: RouteToolExposureInput,
  reason: string,
  evidence: ToolRoutingEvidence | null,
  rejectedSelections: string[] = [],
): ValidatedToolRoutingDecision {
  const activeToolNames = buildFallbackActiveTools(input);

  return {
    activeToolNames,
    audit: {
      decision: null,
      evidence,
      finalActiveToolCount: activeToolNames.length,
      mode: "deterministic-fallback",
      reason,
      remediationTriggerSource: null,
      rejectedSelections,
      routerModelId: null,
      selectedCategories: [],
      selectedIntegrationNamespaces: [],
      selectedMcpNamespaces: [],
      stage: input.stage,
      usedFallbackModel: true,
    },
  };
}

export async function routeToolExposure(
  input: RouteToolExposureInput,
): Promise<ValidatedToolRoutingDecision> {
  const evidence = input.evidence ?? null;

  const manifest = buildToolRoutingManifest({
    availableToolNames: input.availableToolNames,
    ...(evidence ? { evidence } : {}),
    promptContext: input.promptContext,
    stage: input.stage,
  });

  if (!input.resolvedProviderId) {
    return buildDeterministicFallbackResult(input, "no-provider-id", evidence);
  }

  let routerModelId: string | null = null;
  let usedFallbackModel = false;

  try {
    const resolved = await resolveToolSelectionModel({
      providerId: input.resolvedProviderId,
      userId: input.userId,
    });

    routerModelId = resolved.requestedModelId;

    const providerOptions = getReasoningProviderOptions(
      resolved.providerId,
      resolved.responseModelId,
      "minimal",
    );

    const { output } = await generateText({
      model: resolved.languageModel as Parameters<
        typeof generateText
      >[0]["model"],
      output: Output.object({ schema: toolRoutingDecisionSchema }),
      ...(providerOptions ? { providerOptions } : {}),
      prompt: buildToolRouterPrompt(manifest),
      system: buildToolRouterSystemPrompt(),
    });

    return validateToolRoutingDecision({
      availableToolNames: input.availableToolNames,
      decision: output,
      evidence,
      promptContext: input.promptContext,
      routerModelId,
      stage: input.stage,
      usedFallbackModel,
    });
  } catch (error) {
    usedFallbackModel = true;

    if (input.mainLanguageModel) {
      try {
        const { output } = await generateText({
          model: input.mainLanguageModel as Parameters<
            typeof generateText
          >[0]["model"],
          output: Output.object({ schema: toolRoutingDecisionSchema }),
          ...(input.mainProviderOptions
            ? { providerOptions: input.mainProviderOptions }
            : {}),
          prompt: buildToolRouterPrompt(manifest),
          system: buildToolRouterSystemPrompt(),
        });

        return validateToolRoutingDecision({
          availableToolNames: input.availableToolNames,
          decision: output,
          evidence,
          promptContext: input.promptContext,
          routerModelId: null,
          stage: input.stage,
          usedFallbackModel: true,
        });
      } catch {
        // Fall through to deterministic fallback
      }
    }

    return buildDeterministicFallbackResult(
      input,
      error instanceof Error ? `router-error:${error.message}` : "router-error",
      evidence,
    );
  }
}
