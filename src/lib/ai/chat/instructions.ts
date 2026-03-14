import { lines, section } from "@/lib/prompt";

import type { ThreadPromptContext } from "./prompt-context";
import type { ToolApprovalPolicyMap } from "./tool-approval-policy";
import { TOOL_CATALOG, getActiveCategories } from "./tools";

const SKILL_SUMMARY_LIMIT = 6;
const MCP_SUMMARY_LIMIT = 6;

function approvalLabel(policies: ToolApprovalPolicyMap, toolName: string) {
  if (toolName in policies) {
    return policies[toolName as keyof ToolApprovalPolicyMap]
      ? "after approval"
      : "without approval";
  }

  return "without approval";
}

function truncateList<T>(items: T[], limit: number) {
  return {
    remaining: Math.max(0, items.length - limit),
    visible: items.slice(0, limit),
  };
}

function formatMcpToolLabel(toolName: string) {
  return toolName
    .replace(/^mcp_/, "")
    .replace(/__/g, " -> ")
    .replace(/_/g, " ");
}

function getConfiguredSearchProviders(promptContext: ThreadPromptContext) {
  return Object.values(promptContext.searchProviders)
    .filter((provider) => provider?.isEnabled)
    .map((provider) => provider.provider)
    .sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    );
}

function buildRuntimeSnapshot(
  promptContext: ThreadPromptContext,
  activeToolNames: string[],
) {
  const categories = Array.from(getActiveCategories(activeToolNames)).sort();
  const configuredSearchProviders = getConfiguredSearchProviders(promptContext);

  return section("Runtime Snapshot", [
    `Thread mode: ${promptContext.threadMode}.`,
    promptContext.workspaceRoot
      ? `Workspace root: ${promptContext.workspaceRoot}.`
      : "Workspace root: unavailable.",
    promptContext.skillRoots.length > 0
      ? `Skill roots: ${promptContext.skillRoots.join(", ")}.`
      : "Skill roots: none.",
    `Permission mode: ${promptContext.permissionMode}.`,
    categories.length > 0
      ? `Active tool categories: ${categories.join(", ")}.`
      : "Active tool categories: none.",
    promptContext.planSummary
      ? `Current plan: present (${promptContext.planSummary.taskCount} tasks${promptContext.planSummary.hasPendingQuestions ? "; pending clarification questions" : ""}).`
      : "Current plan: none.",
    promptContext.memorySettings.enabled
      ? `Long-term memory: enabled (${promptContext.memorySettings.memoryProvider}:${promptContext.memorySettings.memoryModel}; retrieval limit ${promptContext.memorySettings.retrievalLimit}).`
      : "Long-term memory: disabled.",
    configuredSearchProviders.length > 0
      ? `Web search: enabled via ${configuredSearchProviders.join(", ")}. Default provider: ${promptContext.searchSettings.defaultProvider}.`
      : "Web search: configured with no enabled providers.",
    promptContext.webFetchSettings.batchEnabled
      ? `Webfetch batching: enabled (up to ${promptContext.webFetchSettings.batchLimit} URLs per call).`
      : "Webfetch batching: disabled.",
    promptContext.sourceMessageId
      ? `Source message id: ${promptContext.sourceMessageId}.`
      : "Source message id: unavailable.",
  ]);
}

function buildCapabilityManifest(
  promptContext: ThreadPromptContext,
  activeToolNames: string[],
) {
  const toolNames = activeToolNames.filter((toolName) =>
    Boolean(TOOL_CATALOG[toolName]),
  );

  return section("Capability Manifest", [
    "Tool availability is specific to this call. Do not rely on tools that are not listed here.",
    ...toolNames.map((toolName) => {
      const entry = TOOL_CATALOG[toolName]!;
      return `${entry.label}: ${entry.capability} ${approvalLabel(promptContext.toolApprovalPolicies, toolName)}.`;
    }),
    promptContext.availableSkills.length > 0
      ? `Discovered skills: ${promptContext.availableSkills.length} available. Treat them as routing hints until load_skill is called.`
      : "Discovered skills: none.",
    promptContext.mcpToolNames.length > 0
      ? `External MCP tools: ${promptContext.mcpToolNames.length} available. Use them only when the integration is more direct than workspace or web tools.`
      : "External MCP tools: none.",
  ]);
}

function buildSkillsSection(promptContext: ThreadPromptContext) {
  if (promptContext.availableSkills.length === 0) {
    return "";
  }

  const { remaining, visible } = truncateList(
    promptContext.availableSkills,
    SKILL_SUMMARY_LIMIT,
  );

  return lines(
    "## Discovered Skills",
    "Discovered skills stay latent until you call load_skill. Load only the skills that directly match the current task.",
    visible.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n"),
    remaining > 0 ? `- ... and ${remaining} more discovered skills.` : "",
  );
}

function buildMcpToolsSection(promptContext: ThreadPromptContext) {
  if (promptContext.mcpToolNames.length === 0) {
    return "";
  }

  const { remaining, visible } = truncateList(
    promptContext.mcpToolNames,
    MCP_SUMMARY_LIMIT,
  );

  return lines(
    "## MCP Tools",
    "Prefer MCP tools when they can answer or perform the task more directly than workspace or web tools.",
    visible.map((toolName) => `- ${formatMcpToolLabel(toolName)}`).join("\n"),
    remaining > 0 ? `- ... and ${remaining} more MCP tools.` : "",
  );
}

function buildDecisionHeuristics(
  promptContext: ThreadPromptContext,
  activeToolNames: string[],
) {
  const categories = getActiveCategories(activeToolNames);
  const heuristics: string[] = [];
  let step = 1;

  if (
    categories.has("inspection") &&
    (promptContext.workspaceRoot || promptContext.skillRoots.length > 0)
  ) {
    heuristics.push(
      `${step++}. When repository or file state matters, inspect first. Prefer list for directory overview, glob for filename patterns, read for concrete file contents, and grep for content search.`,
    );
  }

  if (categories.has("skill")) {
    heuristics.push(
      `${step++}. Treat discovered skills as routing hints. Call load_skill before relying on a skill's instructions or bundled resources.`,
    );
    heuristics.push(
      `${step++}. After load_skill, use the returned skill directory as the source of truth for scripts, references, and assets. Ignore stale home-directory examples such as ~/.codex/skills or $CODEX_HOME/skills.`,
    );
  }

  if (categories.has("mutation")) {
    heuristics.push(
      `${step++}. Before mutating files, inspect the relevant targets unless the user supplied exact content. Prefer edit, multiedit, create_file, and delete_file for direct file changes instead of shell commands.`,
    );
  }

  if (categories.has("execution")) {
    heuristics.push(
      `${step++}. Prefer run_task for standard scripts such as test, lint, build, format, or typecheck. Use shell_command only when the task cannot be expressed as a standard script.`,
    );
    heuristics.push(
      `${step++}. For shell_command, propose one non-interactive command at a time, explain the rationale, and wait for approval workflows when required.`,
    );
  }

  if (categories.has("memory")) {
    heuristics.push(
      `${step++}. Use search_memory before asking the user to repeat durable preferences, workflows, or project facts. Save only durable context, and never store secrets or one-off task state.`,
    );
  }

  if (categories.has("web")) {
    heuristics.push(
      `${step++}. Use websearch to discover sources and webfetch to read known URLs. Prefer webfetch after websearch when you need the full content of a specific result.`,
    );
    heuristics.push(
      `${step++}. When using the searxng provider, use searchType auto and leave livecrawl unset. Use batch webfetch only when comparing multiple pages is clearly useful.`,
    );
  }

  if (promptContext.mcpToolNames.length > 0) {
    heuristics.push(
      `${step++}. Prefer read-only MCP actions before mutating ones, especially when exploring browsers or external systems.`,
    );
  }

  heuristics.push(
    `${step++}. If the available context or tools still leave a material ambiguity, ask the user instead of guessing.`,
  );

  return section("Decision Heuristics", heuristics.join("\n"));
}

function permissionOverlay(promptContext: ThreadPromptContext) {
  if (promptContext.permissionMode === "full") {
    return "Full permissions mode is active. Available file and task tools may use absolute paths outside the workspace when the task requires it.";
  }

  if (promptContext.workspaceRoot && promptContext.skillRoots.length > 0) {
    return "Default permissions mode is active. Inspection and shell work must stay inside the selected workspace root or discovered skill directories, while mutation tools and run_task remain restricted to the selected workspace root.";
  }

  if (promptContext.skillRoots.length > 0) {
    return "Default permissions mode is active. File and shell work must stay inside the discovered skill directories.";
  }

  return promptContext.workspaceRoot
    ? "Default permissions mode is active. All available file and task tools must stay inside the selected workspace root."
    : "Default permissions mode is active. Workspace-bound file and task tools remain unavailable until a workspace root is selected.";
}

function buildChatModeOverlay(
  promptContext: ThreadPromptContext,
  activeToolNames: string[],
) {
  const categories = getActiveCategories(activeToolNames);

  return section("Mode Overlay", [
    "Chat mode is active. You may inspect, execute, and mutate only through capabilities that are available in this call.",
    "Sequence stateful work as inspect -> decide -> mutate -> validate whenever the task changes workspace state.",
    permissionOverlay(promptContext),
    !promptContext.workspaceRoot && promptContext.skillRoots.length > 0
      ? "No workspace root is selected. Keep file and shell work inside discovered skill directories, and do not imply that workspace-only mutation tools or run_task are available."
      : !promptContext.workspaceRoot
        ? "No workspace root is selected. Do not imply that workspace file tools, task runners, or shell commands are available unless the user is asking conceptually."
        : "A workspace root is selected. Use it as the default base for available workspace tools.",
    categories.has("execution") || categories.has("web")
      ? "When a tool requires approval, pause for the approval workflow before continuing."
      : "If a capability is missing, say so directly and continue with the best available path.",
  ]);
}

function buildPlanModeOverlay(
  promptContext: ThreadPromptContext,
  activeToolNames: string[],
) {
  const categories = getActiveCategories(activeToolNames);

  return section("Mode Overlay", [
    "Plan mode is active. You are a read-only planning specialist.",
    "Understand the request, gather context, and produce a thorough implementation plan rather than executing the work.",
    "Do not attempt file edits, shell commands, web access, or memory operations while planning.",
    "Use create_plan when the thread has no plan yet. Use update_plan to refine the existing plan without collapsing useful detail.",
    "Use manage_task for task lifecycle updates after a plan exists.",
    "Use ask_question only when a remaining ambiguity materially changes the plan, and keep it to 1 to 3 questions with 2 to 4 options each.",
    permissionOverlay(promptContext),
    categories.has("inspection") &&
    (promptContext.workspaceRoot || promptContext.skillRoots.length > 0)
      ? "Inspect the linked workspace or skill directories before asking clarification questions when the existing files can answer the uncertainty."
      : "If workspace context is needed but unavailable, ask focused questions about the project structure, stack, and constraints before creating the plan.",
    "After calling create_plan or update_plan, do not repeat the plan title, goal, summary, or document content in the chat because the plan is rendered separately.",
    "Keep the plan substantial, decision-complete, and explicit about assumptions, validation, and risks.",
  ]);
}

export function buildThreadAgentInstructions({
  activeToolNames,
  promptContext,
  systemPrompt,
}: {
  activeToolNames: string[];
  promptContext: ThreadPromptContext;
  systemPrompt: string;
}) {
  return lines(
    systemPrompt.trim(),
    buildRuntimeSnapshot(promptContext, activeToolNames),
    buildCapabilityManifest(promptContext, activeToolNames),
    buildSkillsSection(promptContext),
    buildMcpToolsSection(promptContext),
    buildDecisionHeuristics(promptContext, activeToolNames),
    promptContext.threadMode === "plan"
      ? buildPlanModeOverlay(promptContext, activeToolNames)
      : buildChatModeOverlay(promptContext, activeToolNames),
  );
}
