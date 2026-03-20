import { Output, generateText, type StepResult, type ToolSet } from "ai";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import { z } from "zod";

import type { AIProvider } from "@/server/db/enums";
import { getReasoningProviderOptions } from "@/lib/ai/providers/models";
import { getEnabledModels, getLanguageModel } from "@/lib/ai/providers/resolver";

import type { ThreadPromptContext } from "./prompt-context";
import {
  INTEGRATION_TOOL_PREFIXES,
  hasWorkspaceInspectionContext,
  selectAlwaysOnChatTools,
  selectInitialActiveTools,
  selectStepActiveTools,
} from "./tool-selection";
import {
  getActiveCategories,
  getToolsInCategory,
  type ToolCategory,
} from "./tools/catalog";

const TOOL_ROUTER_SKIP_THRESHOLD = 8;

const ROUTER_MODEL_BY_PROVIDER = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-2.5-flash",
  google_vertex: "gemini-2.5-flash",
  openai: "gpt-5-mini",
} as const satisfies Record<AIProvider, string>;

const toolCategoryValues = [
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
  categories: z.array(z.enum(toolCategoryValues)).max(toolCategoryValues.length),
  confidence: z.enum(["low", "medium", "high"]),
  integrationNamespaces: z.array(z.string().trim().min(1)).max(12),
  mcpNamespaces: z.array(z.string().trim().min(1)).max(12),
  reasoning: z.string().trim().min(1).max(600),
});

export type ToolRoutingDecision = z.infer<typeof toolRoutingDecisionSchema>;

export type ToolRoutingEvidence = {
  executionFailed: boolean;
  explicitInstallRequest: boolean;
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
  availableIntegrationNamespaces: string[];
  availableMcpNamespaces: string[];
  intentHints: {
    explicitInstallRequest: boolean;
    likelyExternalResearch: boolean;
    likelyIntegrationTask: boolean;
    likelyProjectWork: boolean;
  };
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
  remediationTriggerSource:
    | "explicit-install-request"
    | "missing-command-evidence"
    | "router"
    | null;
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

type RouterModelResolution = {
  languageModel: unknown;
  providerOptions?: SharedV3ProviderOptions;
  routerModelId: string | null;
  usedFallbackModel: boolean;
};

type RouteToolExposureInput = {
  availableToolNames: string[];
  evidence?: ToolRoutingEvidence;
  initialActiveTools?: string[];
  mainLanguageModel: unknown;
  mainProviderOptions?: SharedV3ProviderOptions;
  promptContext: ThreadPromptContext;
  resolvedModelId?: string | null;
  resolvedProviderId?: AIProvider | null;
  stage: "initial" | "step";
  steps?: ReadonlyArray<StepResult<ToolSet>>;
  userId: string;
};

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function hasExplicitInstallIntent(text: string | null | undefined) {
  const normalized = text?.toLowerCase().trim() ?? "";
  if (!normalized) {
    return false;
  }

  return [
    /\binstall\b/,
    /\bset up\b/,
    /\bsetup\b/,
    /\bbrew install\b/,
    /\bapt(?:-get)? install\b/,
    /\bnpm install\b/,
    /\bpnpm add\b/,
    /\bbun add\b/,
    /\byarn add\b/,
    /\buse the shell tool\b/,
  ].some((pattern) => pattern.test(normalized));
}

function hasLikelyResearchIntent(text: string | null | undefined) {
  const normalized = text?.toLowerCase().trim() ?? "";
  return /\bdocs?\b|\blatest\b|\bresearch\b|https?:\/\//.test(normalized);
}

function hasLikelyIntegrationIntent(promptContext: ThreadPromptContext) {
  const normalized = promptContext.latestUserText?.toLowerCase().trim() ?? "";

  return (
    promptContext.enabledIntegrations.some(
      (integration) =>
        normalized.includes(integration.provider) ||
        normalized.includes(integration.provider.replaceAll("_", " ")),
    ) ||
    promptContext.enabledMcpServers.some(
      (server) =>
        normalized.includes(server.namespace) ||
        normalized.includes(server.name.toLowerCase()),
    )
  );
}

function hasLikelyProjectIntent(promptContext: ThreadPromptContext) {
  const normalized = promptContext.latestUserText?.toLowerCase().trim() ?? "";

  return [
    /\bfix\b/,
    /\bbuild\b/,
    /\btest\b/,
    /\blint\b/,
    /\btypecheck\b/,
    /\brefactor\b/,
    /\bedit\b/,
    /\bimplement\b/,
    /\bworkspace\b/,
    /\brepo\b/,
    /\bproject\b/,
  ].some((pattern) => pattern.test(normalized));
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

function buildFallbackActiveTools(
  input: RouteToolExposureInput,
) {
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

function hasShellRemediationContext(
  availableToolNames: string[],
  promptContext: ThreadPromptContext,
) {
  if (!availableToolNames.includes("shell_command")) {
    return false;
  }

  return (
    promptContext.permissionMode === "full" ||
    Boolean(promptContext.shellStartDirectory) ||
    Boolean(promptContext.workspaceRoot) ||
    promptContext.skillRoots.length > 0
  );
}

function getRemediationTriggerSource(
  promptContext: ThreadPromptContext,
  evidence: ToolRoutingEvidence | null,
): ToolRoutingAudit["remediationTriggerSource"] {
  if (
    hasExplicitInstallIntent(promptContext.latestUserText) ||
    evidence?.explicitInstallRequest
  ) {
    return "explicit-install-request";
  }

  if (
    evidence &&
    (Boolean(evidence.missingCommand) ||
      evidence.missingToolchain ||
      evidence.lastExitCode === 127 ||
      evidence.suggestedNextAction === "install")
  ) {
    return "missing-command-evidence";
  }

  return null;
}

function shouldForceShellRemediation(
  availableToolNames: string[],
  promptContext: ThreadPromptContext,
  evidence: ToolRoutingEvidence | null,
) {
  if (!hasShellRemediationContext(availableToolNames, promptContext)) {
    return false;
  }

  return getRemediationTriggerSource(promptContext, evidence) !== null;
}

function buildForcedRemediationResult(
  input: RouteToolExposureInput,
  evidence: ToolRoutingEvidence | null,
  reason: string,
): ValidatedToolRoutingDecision {
  const activeTools = buildCoreTools(input.availableToolNames, input.promptContext);
  applyAlwaysOnChatBaseline(
    activeTools,
    input.availableToolNames,
    input.promptContext,
  );
  activeTools.add("shell_command");
  const activeToolNames = uniqueStrings([...activeTools]);
  const remediationTriggerSource = getRemediationTriggerSource(
    input.promptContext,
    evidence,
  );

  return {
    activeToolNames,
    audit: {
      decision: null,
      evidence,
      finalActiveToolCount: activeToolNames.length,
      mode: "deterministic-fallback",
      reason,
      remediationTriggerSource,
      rejectedSelections: [],
      routerModelId: null,
      selectedCategories: ["execution"],
      selectedIntegrationNamespaces: [],
      selectedMcpNamespaces: [],
      stage: input.stage,
      usedFallbackModel: true,
    },
  };
}

export function buildToolRoutingEvidence(
  steps: ReadonlyArray<StepResult<ToolSet>>,
  latestUserText?: string | null,
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
  let suggestedNextAction: "install" | "inspect" | "none" | "retry" | null = null;
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

      const integrationPrefix = Object.entries(INTEGRATION_TOOL_PREFIXES).find(
        ([, prefix]) => prefix && toolCall.toolName.startsWith(prefix),
      );
      if (integrationPrefix) {
        integrationNamespaces.add(integrationPrefix[0]);
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
        if (typeof output.missingCommand === "string" && output.missingCommand.trim()) {
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
      if (/exitCode":127\b/.test(serialized) || /\bexit 127\b/i.test(serialized)) {
        executionFailed = true;
        missingToolchain = true;
        suggestedNextAction ??= "install";
      }
    }
  }

  return {
    executionFailed,
    explicitInstallRequest: hasExplicitInstallIntent(latestUserText),
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
    availableCategories: Array.from(getActiveCategories(availableToolNames)).sort(),
    availableIntegrationNamespaces: uniqueStrings(
      promptContext.enabledIntegrations.map((integration) => integration.provider),
    ),
    availableMcpNamespaces: uniqueStrings(
      promptContext.enabledMcpServers.map((server) => server.namespace),
    ),
    intentHints: {
      explicitInstallRequest: hasExplicitInstallIntent(promptContext.latestUserText),
      likelyExternalResearch: hasLikelyResearchIntent(promptContext.latestUserText),
      likelyIntegrationTask: hasLikelyIntegrationIntent(promptContext),
      likelyProjectWork: hasLikelyProjectIntent(promptContext),
    },
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

export function shouldSkipToolRouter(
  availableToolNames: string[],
  promptContext: ThreadPromptContext,
) {
  if (!promptContext.latestUserText?.trim()) {
    return true;
  }

  if (availableToolNames.length <= TOOL_ROUTER_SKIP_THRESHOLD) {
    return true;
  }

  return false;
}

export async function resolveToolRouterModel({
  mainLanguageModel,
  mainProviderOptions,
  resolvedModelId,
  resolvedProviderId,
  userId,
}: {
  mainLanguageModel: unknown;
  mainProviderOptions?: SharedV3ProviderOptions;
  resolvedModelId?: string | null;
  resolvedProviderId?: AIProvider | null;
  userId: string;
}): Promise<RouterModelResolution> {
  const fallbackModelId =
    resolvedProviderId && resolvedModelId
      ? `${resolvedProviderId}:${resolvedModelId}`
      : null;
  const fallbackProviderOptions =
    resolvedProviderId && resolvedModelId
      ? getReasoningProviderOptions(resolvedProviderId, resolvedModelId, "minimal") ??
        mainProviderOptions
      : mainProviderOptions;

  if (!resolvedProviderId) {
    return {
      languageModel: mainLanguageModel,
      providerOptions: fallbackProviderOptions,
      routerModelId: fallbackModelId,
      usedFallbackModel: true,
    };
  }

  const routerModelId = ROUTER_MODEL_BY_PROVIDER[resolvedProviderId];
  const compositeRouterModelId = `${resolvedProviderId}:${routerModelId}`;
  const enabledModels = await getEnabledModels(userId);
  const isEnabled = enabledModels.some(
    (model) => model.compositeId === compositeRouterModelId,
  );

  if (!isEnabled) {
    return {
      languageModel: mainLanguageModel,
      providerOptions: fallbackProviderOptions,
      routerModelId: fallbackModelId,
      usedFallbackModel: true,
    };
  }

  try {
    return {
      languageModel: await getLanguageModel(userId, compositeRouterModelId),
      providerOptions: getReasoningProviderOptions(
        resolvedProviderId,
        routerModelId,
        "minimal",
      ),
      routerModelId: compositeRouterModelId,
      usedFallbackModel: false,
    };
  } catch {
    return {
      languageModel: mainLanguageModel,
      providerOptions: fallbackProviderOptions,
      routerModelId: fallbackModelId,
      usedFallbackModel: true,
    };
  }
}

export function buildToolRouterSystemPrompt() {
  return [
    "You are a tool exposure router for a coding agent.",
    "Choose the smallest set of tool categories and namespaces needed for the next step only, not for the whole task.",
    "Minimize context cost aggressively, but do not under-route in a way that blocks obvious next actions.",
    "Do not activate tool families just because they might be useful later.",
    "In chat mode, local workspace tools and web tools may already be active as the default baseline. Focus your routing decision on additional specialized families and namespaces beyond that baseline.",
    "Distinguish carefully between project work, environment/bootstrap remediation, external research, and integration-targeted tasks.",
    "Default to inspection first when a workspace or skill root can answer the question.",
    "Promote execution only when the user explicitly wants commands/checks or inspection has revealed a real project context.",
    "For environment remediation, installs, setup, missing commands, or missing toolchains, prefer shell_command exposure over plain-text refusal or useless run_task retries.",
    "Promote mutation only when the task clearly requires changes and the likely target files or edit scope are known.",
    "Use integrationNamespaces and mcpNamespaces only when the task explicitly targets that connected system.",
    "Use web only for freshness, external documentation, or when local inspection has already proven insufficient.",
    "In plan mode, keep activation especially narrow and prefer planning plus inspection over execution or mutation.",
    "If confidence is low, stay narrow and rely on the runtime fallback instead of activating broad tool families.",
    '"." means the active tool base for that call, not the filesystem root.',
    "Relative paths resolve from the selected workspace root unless a tool says otherwise.",
    "shell_command starts in shellStartDirectory and must stay inside allowed roots in default permissions mode.",
    "run_task may resolve upward to the nearest package.json, but only inside the workspace boundary.",
    "Approval-gated tools are still available capabilities. Route to them when they are the right next step.",
    "Return compact, minimal routing decisions.",
  ].join("\n");
}

export function buildToolRouterPrompt(manifest: ToolRoutingManifest) {
  return [
    "Choose which tool categories and namespaces should be active for the next agent step.",
    "Select only what is necessary immediately.",
    "Use shell remediation for explicit install/setup intent or missing-command evidence when shell_command is available.",
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
    promptContext.enabledIntegrations.map((integration) => integration.provider),
  );

  for (const namespace of uniqueStrings(integrationNamespaces)) {
    if (!allowedNamespaces.has(namespace)) {
      rejectedSelections.push(`integration:${namespace}:not-enabled`);
      continue;
    }

    const prefix =
      INTEGRATION_TOOL_PREFIXES[
        namespace as keyof typeof INTEGRATION_TOOL_PREFIXES
      ];
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
  fallbackActiveToolNames,
  promptContext,
  routerModelId,
  stage,
  usedFallbackModel,
  evidence = null,
}: {
  availableToolNames: string[];
  decision: ToolRoutingDecision;
  evidence?: ToolRoutingEvidence | null;
  fallbackActiveToolNames: string[];
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
  const workspaceContextAvailable = hasWorkspaceInspectionContext(promptContext);

  for (const category of uniqueStrings(decision.categories)) {
    if (!availableCategories.has(category as ToolCategory)) {
      rejectedSelections.push(`category:${category}:unavailable`);
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

    if ((category === "inspection" || category === "execution") && !workspaceContextAvailable) {
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

  const hasNonCoreTools = [...activeTools].some(
    (toolName) => !buildCoreTools(availableToolNames, promptContext).has(toolName),
  );
  const shouldMergeFallback =
    decision.confidence === "low" || !hasNonCoreTools;

  if (shouldMergeFallback) {
    for (const toolName of fallbackActiveToolNames) {
      activeTools.add(toolName);
    }
  }

  applyAlwaysOnChatBaseline(activeTools, availableToolNames, promptContext);

  const remediationTriggerSource = getRemediationTriggerSource(
    promptContext,
    evidence,
  );
  if (
    remediationTriggerSource &&
    hasShellRemediationContext(availableToolNames, promptContext)
  ) {
    activeTools.add("shell_command");
    acceptedCategories.add("execution");
  }

  const activeToolNames = uniqueStrings([...activeTools]);

  return {
    activeToolNames,
    audit: {
      decision,
      evidence,
      finalActiveToolCount: activeToolNames.length,
      mode: "model-router",
      reason: shouldMergeFallback
        ? remediationTriggerSource
          ? "merged-deterministic-fallback+forced-remediation"
          : "merged-deterministic-fallback"
        : remediationTriggerSource
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

  if (
    shouldForceShellRemediation(
      input.availableToolNames,
      input.promptContext,
      evidence,
    )
  ) {
    return buildForcedRemediationResult(
      input,
      evidence,
      "forced-shell-remediation",
    );
  }

  if (shouldSkipToolRouter(input.availableToolNames, input.promptContext)) {
    return buildDeterministicFallbackResult(
      input,
      "skipped-small-tool-universe",
      evidence,
    );
  }

  const manifest = buildToolRoutingManifest({
    availableToolNames: input.availableToolNames,
    ...(evidence ? { evidence } : {}),
    promptContext: input.promptContext,
    stage: input.stage,
  });
  const routerModel = await resolveToolRouterModel({
    mainLanguageModel: input.mainLanguageModel,
    mainProviderOptions: input.mainProviderOptions,
    resolvedModelId: input.resolvedModelId,
    resolvedProviderId: input.resolvedProviderId,
    userId: input.userId,
  });

  try {
    const { output } = await generateText({
      model: routerModel.languageModel as Parameters<typeof generateText>[0]["model"],
      output: Output.object({ schema: toolRoutingDecisionSchema }),
      ...(routerModel.providerOptions
        ? { providerOptions: routerModel.providerOptions }
        : {}),
      prompt: buildToolRouterPrompt(manifest),
      system: buildToolRouterSystemPrompt(),
    });

    return validateToolRoutingDecision({
      availableToolNames: input.availableToolNames,
      decision: output,
      evidence,
      fallbackActiveToolNames: buildFallbackActiveTools(input),
      promptContext: input.promptContext,
      routerModelId: routerModel.routerModelId,
      stage: input.stage,
      usedFallbackModel: routerModel.usedFallbackModel,
    });
  } catch (error) {
    return buildDeterministicFallbackResult(
      input,
      error instanceof Error ? `router-error:${error.message}` : "router-error",
      evidence,
    );
  }
}
