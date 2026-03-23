import { lines, section } from "@/lib/prompt";

import type { ThreadPromptContext } from "./prompt-context";
import type { ToolApprovalPolicyMap } from "./tool-approval-policy";
import { TOOL_CATALOG, getActiveCategories } from "./tools/catalog";

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
    promptContext.preferredProjectRoot
      ? `Preferred project root: ${promptContext.preferredProjectRoot}.`
      : "Preferred project root: unavailable.",
    promptContext.projectCandidates.length > 0
      ? `Project candidates: ${promptContext.projectCandidates
          .map(
            (candidate) =>
              `${candidate.path} (${candidate.kind}, ${(candidate.confidence * 100).toFixed(0)}%)`,
          )
          .join(", ")}.`
      : "Project candidates: none discovered.",
    promptContext.allowedInspectionRoots.length > 0
      ? `Allowed inspection roots: ${promptContext.allowedInspectionRoots.join(", ")}.`
      : "Allowed inspection roots: none.",
    promptContext.allowedMutationRoot
      ? `Allowed mutation root: ${promptContext.allowedMutationRoot}.`
      : "Allowed mutation root: unavailable.",
    promptContext.shellStartDirectory
      ? `Shell start directory: ${promptContext.shellStartDirectory}.`
      : "Shell start directory: unavailable.",
    promptContext.skillRoots.length > 0
      ? `Skill roots: ${promptContext.skillRoots.join(", ")}.`
      : "Skill roots: none.",
    `Permission mode: ${promptContext.permissionMode}.`,
    categories.length > 0
      ? `Active tool categories: ${categories.join(", ")}.`
      : "Active tool categories: none.",
    promptContext.latentToolSummary.categories.length > 0
      ? `Currently inactive tool categories available for later activation: ${promptContext.latentToolSummary.categories.join(", ")}.`
      : "Currently inactive tool categories available for later activation: none.",
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
  allToolNames: string[],
) {
  const toolNames = activeToolNames.filter((toolName) =>
    Boolean(TOOL_CATALOG[toolName]),
  );
  const inactiveToolNames = allToolNames.filter(
    (toolName) => !activeToolNames.includes(toolName),
  );
  const inactiveCategories = Array.from(
    getActiveCategories(inactiveToolNames),
  ).sort();

  return section("Capability Manifest", [
    "Tool availability is specific to this step. Use only the active tools listed here.",
    promptContext.threadMode === "chat"
      ? "Workspace and web baseline tools stay active in chat mode. Connected integrations and enabled MCP servers remain available for targeted activation when the request clearly points to them."
      : "Treat inactive families as latent until the runtime re-activates them.",
    ...toolNames.map((toolName) => {
      const entry = TOOL_CATALOG[toolName]!;
      return `${entry.label}: ${entry.capability} ${approvalLabel(promptContext.toolApprovalPolicies, toolName)}.`;
    }),
    inactiveCategories.length > 0
      ? `Inactive but available later if needed: ${inactiveCategories.join(", ")}.`
      : "Inactive but available later if needed: none.",
    promptContext.latentToolSummary.integrationNamespaces.length > 0
      ? `Integration namespaces available for targeted activation: ${promptContext.latentToolSummary.integrationNamespaces.join(", ")}.`
      : "Integration namespaces available for targeted activation: none.",
    promptContext.latentToolSummary.mcpNamespaces.length > 0
      ? `MCP namespaces available for targeted activation: ${promptContext.latentToolSummary.mcpNamespaces.join(", ")}.`
      : "MCP namespaces available for targeted activation: none.",
    promptContext.availableSkills.length > 0
      ? `Discovered skills: ${promptContext.availableSkills.length} available. If one is a clear match, call load_skill before proceeding; otherwise continue with the base tools.`
      : "Discovered skills: none.",
    promptContext.enabledIntegrations.length > 0
      ? `Connected integrations: ${promptContext.enabledIntegrations.map((i) => i.label).join(", ")}. Treat them as available for direct-source tasks; do not describe them as unavailable unless a tool call or connection state proves that.`
      : "Connected integrations: none.",
    promptContext.enabledMcpServers.length > 0
      ? `Enabled MCP servers: ${promptContext.enabledMcpServers.length}. Treat them as available for direct-source tasks; do not describe them as unavailable unless a tool call or connection state proves that.`
      : "Enabled MCP servers: none.",
  ]);
}

function buildPathSemanticsSection(
  promptContext: ThreadPromptContext,
  activeToolNames: string[],
) {
  return section("Path Semantics", [
    promptContext.workspaceRoot
      ? `Relative workspace paths resolve from ${promptContext.workspaceRoot} unless a tool explicitly says otherwise.`
      : "Relative workspace paths are unavailable because no workspace root is selected.",
    '"." means the active tool base for that call, not the filesystem root.',
    promptContext.preferredProjectRoot
      ? `Inspect ${promptContext.preferredProjectRoot} first when the task depends on the main project layout, unless newer evidence points to another candidate.`
      : "No preferred project root has been discovered yet.",
    promptContext.shellStartDirectory
      ? `shell_command starts in ${promptContext.shellStartDirectory} and may persist its cwd across calls.`
      : "shell_command has no workspace start directory unless a valid root is available.",
    activeToolNames.includes("shell_command")
      ? "shell_command may invoke host-installed executables such as brew, apt-get, npm, pnpm, yarn, bun, cargo, or pip from the allowed cwd when the runtime exposes them."
      : "shell_command is not active for this step.",
    promptContext.allowedInspectionRoots.length > 0
      ? `Inspection tools must stay inside: ${promptContext.allowedInspectionRoots.join(", ")}.`
      : "Inspection tools are limited by the currently active roots only.",
    promptContext.allowedMutationRoot
      ? `Mutation tools remain restricted to ${promptContext.allowedMutationRoot}.`
      : "Mutation tools are unavailable without a valid mutation root.",
    promptContext.permissionMode === "default"
      ? "In default permissions mode, shell and path-based tools must remain inside the allowed roots even if the shell cwd changes."
      : "In full permissions mode, active tools may use absolute paths outside the workspace when the task requires it.",
    promptContext.allowedMutationRoot
      ? "run_task may resolve upward to the nearest package.json, but only within the workspace boundary."
      : "run_task remains unavailable until a valid workspace boundary exists.",
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
    "Discovered skills stay latent until you call load_skill. If one is a clear match for the current task, call load_skill before proceeding with general reasoning or execution.",
    "Use a skill when the request clearly matches a specialized workflow, toolchain, provider, framework, or domain that the skill description covers.",
    "How to use skills: identify the best matching discovered skill, call load_skill, then follow the loaded instructions and treat the returned directory as the source of truth for bundled resources. If there is no clear match, continue with the base tools.",
    visible
      .map(
        (skill) =>
          `- ${skill.name} [${skill.scope}/${skill.sourceKind}]: ${skill.description}`,
      )
      .join("\n"),
    remaining > 0 ? `- ... and ${remaining} more discovered skills.` : "",
  );
}

function mcpServerUsageHint(
  server: ThreadPromptContext["enabledMcpServers"][number],
) {
  switch (server.catalogId) {
    case "playwright":
      return "Use for browser inspection and automation tasks; start with read-only browser state before clicks or typing.";
    case "linear":
      return "Use for issues, projects, cycles, and team workflow data when the task targets Linear.";
    case "notion":
      return "Use for pages, documents, and database content when the task depends on Notion workspace knowledge.";
    case "figma":
      return "Use for design files, components, and design-system context when the task depends on Figma assets.";
    case "git":
      return "Use for repository hosting and review workflows when the task targets the external Git integration.";
    default:
      return "Use when this integration can answer or perform the task more directly than workspace or web tools.";
  }
}

function buildMcpToolsSection(promptContext: ThreadPromptContext) {
  if (promptContext.enabledMcpServers.length === 0) {
    return "";
  }

  const { remaining, visible } = truncateList(
    promptContext.enabledMcpServers,
    MCP_SUMMARY_LIMIT,
  );
  const loadedToolExamples = truncateList(
    promptContext.mcpToolNames,
    MCP_SUMMARY_LIMIT,
  );

  return lines(
    "## Enabled MCP Servers",
    "Prefer MCP integrations when the user is asking about a connected external system or when the integration can answer or perform the task more directly than workspace or web tools.",
    "Treat enabled MCP servers as available capabilities for this conversation. Do not tell the user they are inactive or unavailable unless the connection state or a tool call proves that.",
    "How to use MCP servers: identify the relevant integration, prefer read-only tools first, and then choose namespaced tools that begin with the server namespace shown below.",
    visible
      .map((server) => {
        const toolCountLabel =
          server.toolCount > 0
            ? `${server.toolCount} tools loaded`
            : "tools load on demand";
        const capabilitySuffix = server.capabilitySummary
          ? ` Capability: ${server.capabilitySummary}`
          : "";
        return `- ${server.name} [${server.transport}${server.catalogId ? `/${server.catalogId}` : ""}] via \`mcp_${server.namespace}__*\` (${toolCountLabel}): ${mcpServerUsageHint(server)}${capabilitySuffix}`;
      })
      .join("\n"),
    remaining > 0 ? `- ... and ${remaining} more enabled MCP servers.` : "",
    loadedToolExamples.visible.length > 0
      ? lines(
          "Loaded MCP tool examples:",
          loadedToolExamples.visible
            .map((toolName) => `- ${formatMcpToolLabel(toolName)}`)
            .join("\n"),
        )
      : "",
  );
}

function buildIntegrationsSection(promptContext: ThreadPromptContext) {
  if (promptContext.enabledIntegrations.length === 0) {
    return "";
  }

  return lines(
    "## Connected Integrations",
    "The following integrations are connected and available for targeted use in this conversation.",
    "Use the connected integration as the direct source of truth when the request clearly targets that service, and do not describe it as unavailable unless the connection state or a tool call proves that.",
    "IMPORTANT: Integration tools are namespaced with a prefix. Always use the exact prefixed tool names shown below. Never fabricate tool names like 'integration_<provider>'.",
    promptContext.enabledIntegrations
      .map((integration) => {
        const prefixHint = integration.toolPrefix
          ? ` Tools are named \`${integration.toolPrefix}*\`.`
          : "";
        const capabilityHint = integration.capabilitySummary
          ? ` ${integration.capabilitySummary}`
          : "";
        return `- ${integration.label} (${integration.toolCount} tools via \`${integration.provider}\` namespace):${prefixHint}${capabilityHint}`;
      })
      .join("\n"),
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
    heuristics.push(
      `${step++}. Before asking the user about repo layout, entrypoints, or file locations, inspect the workspace root and likely project candidates first. If one likely project root is discovered, inspect it before asking clarification questions.`,
    );
    if (activeToolNames.includes("diff")) {
      heuristics.push(
        `${step++}. Use diff to preview or compare changes before mutating files, especially when validating a proposed edit or patch.`,
      );
    }
    if (activeToolNames.includes("batch_read")) {
      heuristics.push(
        `${step++}. Use batch_read when you need several files at once instead of repeated read calls.`,
      );
    }
  }

  if (categories.has("skill")) {
    heuristics.push(
      `${step++}. If a discovered skill is a clear match for the request, call load_skill before proceeding with general reasoning or execution.`,
    );
    heuristics.push(
      `${step++}. After load_skill, use the returned skill directory as the source of truth for scripts, references, and assets. Ignore stale home-directory examples such as ~/.codex/skills or $CODEX_HOME/skills.`,
    );
    heuristics.push(
      `${step++}. Reach for a skill when the task clearly matches a specialized provider, framework, workflow, or domain described by the discovered skill list. If no installed skill is a clear match, continue with the base tools.`,
    );
  }

  if (categories.has("mutation")) {
    heuristics.push(
      `${step++}. Before mutating files, inspect the relevant targets unless the user supplied exact content. Prefer edit, multiedit, create_file, delete_file, move_file, and apply_patch for direct file changes instead of shell commands.`,
    );
  }

  if (categories.has("execution")) {
    heuristics.push(
      `${step++}. Prefer run_task for standard scripts such as test, lint, build, format, or typecheck. Use shell_command only when the task cannot be expressed as a standard script.`,
    );
    heuristics.push(
      `${step++}. Interpret shell cwd, run_task cwd, and permission boundaries literally from tool outputs. Do not treat a relative root label like "." as evidence that the workspace is empty or misconfigured.`,
    );
    if (activeToolNames.includes("git")) {
      heuristics.push(
        `${step++}. Prefer git over shell_command for local repository inspection, staging, branching, checkout, and commit flows that fit the safe structured actions.`,
      );
    }
    if (activeToolNames.includes("diagnostics")) {
      heuristics.push(
        `${step++}. Prefer diagnostics over parsing raw lint or compiler stdout when you need file- and line-specific issues.`,
      );
    }
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
    heuristics.push(
      `${step++}. For research tasks, prefer direct evidence over speculation, synthesize across sources when useful, and distinguish sourced facts from your own inference.`,
    );
  }

  if (promptContext.threadMode === "chat") {
    heuristics.push(
      `${step++}. Always decompose multi-step work into tasks using manage_task before starting execution. Create tasks even when no formal plan exists — the system auto-creates a task tracker on the first manage_task call.`,
    );
    heuristics.push(
      `${step++}. Mark tasks in_progress when you begin working on them, completed after validation, and blocked when stuck. Do not mark a task completed until the result is verified.`,
    );
    heuristics.push(
      `${step++}. After every mutation (edit, multiedit, create_file, delete_file, move_file, apply_patch, shell_command), validate the result before moving to the next task. Use read or diff to verify file changes, diagnostics or run_task when available, and grep to confirm patterns.`,
    );
    heuristics.push(
      `${step++}. Do not generate a final response until all tasks are completed and validated. If you cannot finish a task, mark it blocked and explain what is unresolved.`,
    );
  }

  if (promptContext.enabledIntegrations.length > 0) {
    heuristics.push(
      `${step++}. Use integration tools when the user asks about connected services or the request clearly targets that external system. Prefer the most direct connected integration over workspace or web tools, and prefer read-only integration tools before mutating ones.`,
    );
  }

  if (promptContext.enabledMcpServers.length > 0) {
    heuristics.push(
      `${step++}. Reach for an MCP server when the user is asking about a connected external system or when that server is the most direct source of truth, even if the user did not name the namespace literally.`,
    );
    heuristics.push(
      `${step++}. Prefer read-only MCP actions before mutating ones, especially when exploring browsers or external systems.`,
    );
    heuristics.push(
      `${step++}. Choose MCP tools by namespace: identify the relevant enabled server first, then use namespaced tools from that integration instead of guessing across unrelated servers.`,
    );
  }

  heuristics.push(
    `${step++}. If the request is a general writing, brainstorming, explanation, or transformation task that does not require fresh external or workspace context, answer directly without unnecessary tool calls.`,
  );
  heuristics.push(
    `${step++}. When using tools, infer only clearly supported required inputs from context, avoid asking for optional parameters by default, and ask the user only when missing information materially blocks the next step.`,
  );
  heuristics.push(
    `${step++}. Be proactive when the next step is clear, low-risk, and allowed: continue without extra confirmation, and reserve questions for ambiguities that materially change scope, risk, or output.`,
  );
  heuristics.push(
    `${step++}. If the available context or tools still leave a material ambiguity, ask the user instead of guessing.`,
  );

  return section("Decision Heuristics", heuristics.join("\n"));
}

function buildExecutionRecoverySection(
  promptContext: ThreadPromptContext,
  activeToolNames: string[],
) {
  if (
    !activeToolNames.includes("run_task") &&
    !activeToolNames.includes("shell_command")
  ) {
    return "";
  }

  return section("Execution Recovery", [
    activeToolNames.includes("run_task")
      ? "Prefer run_task for standard project scripts such as test, lint, build, format, or typecheck."
      : "Use the available execution tools according to the next-step need.",
    activeToolNames.includes("shell_command")
      ? "If run_task fails because a command is missing, a toolchain is absent, or the environment needs setup, promote remediation via shell_command instead of retrying the same failure blindly."
      : "If execution fails because of missing commands or setup issues, treat it as remediation work rather than a normal script retry.",
    activeToolNames.includes("shell_command")
      ? "When the user explicitly asks to install, set up, or retry after a missing command, shell_command is an appropriate tool even when the action requires approval."
      : "When the user explicitly asks to install or set up missing dependencies, prefer an execution path over plain-text narration when the runtime exposes one.",
    activeToolNames.includes("shell_command")
      ? "Do not claim that you lack access to the host package manager or shell when shell_command is active. Use the tool from the allowed cwd and let approval policies enforce the boundary."
      : "Do not infer host package-manager limitations unless a tool result explicitly reports them.",
    "Do not respond with a plain-text refusal when an approval-gated execution path exists; choose the right tool and let the approval workflow handle the boundary.",
    "Treat tool outputs as the source of truth for what is possible. Do not infer fake package-manager, shell, or network limitations that the runtime did not report.",
    "After approval-required shell or install actions, continue automatically through the approval workflow instead of asking redundant chat questions.",
  ]);
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
    "Follow the task-driven cycle: create tasks -> inspect -> execute -> validate -> update task status -> repeat until all tasks are done.",
    "Do not ask the user to confirm every obvious intermediate step. Make progress until a real decision, approval boundary, or material ambiguity blocks you.",
    "Do not mention Sentinel's internal implementation details unless they are directly relevant to the task.",
    "For any non-trivial request, always create tasks with manage_task first, then work through them systematically. The system auto-creates a task tracker if no plan exists.",
    "After mutations, always validate: read files to verify, run checks if available, then update task status. Do not skip validation.",
    "Do not generate a final response until all tasks are completed and validated, or explicitly marked blocked with an explanation.",
    permissionOverlay(promptContext),
    !promptContext.workspaceRoot && promptContext.skillRoots.length > 0
      ? "No workspace root is selected. Keep file and shell work inside discovered skill directories, and do not imply that workspace-only mutation tools or run_task are available."
      : !promptContext.workspaceRoot
        ? "No workspace root is selected. Do not imply that workspace file tools, task runners, or shell commands are available unless the user is asking conceptually."
        : "A workspace root is selected. Use it as the default base for available workspace tools.",
    categories.has("execution") || categories.has("web")
      ? "When a tool requires approval, pause for the approval workflow before continuing."
      : "If a capability is missing, say so directly and continue with the best available path.",
    ...(categories.has("execution")
      ? [
          "If shell_command is available and the user explicitly asks to install or set up something, choose it when appropriate instead of narrating a manual install path.",
          "A workspace-bound shell cwd does not prevent invoking host-installed package managers such as brew or npm. Do not describe that as impossible unless a real tool result proves it.",
        ]
      : []),
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
    "Be proactive in gathering discoverable context before asking questions, and avoid asking for confirmation when the planning direction is already clear.",
    "Do not mention Sentinel's internal implementation details unless they are directly relevant to the task.",
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
  allToolNames,
  promptContext,
  systemPrompt,
}: {
  activeToolNames: string[];
  allToolNames: string[];
  promptContext: ThreadPromptContext;
  systemPrompt: string;
}) {
  return lines(
    systemPrompt.trim(),
    buildRuntimeSnapshot(promptContext, activeToolNames),
    buildPathSemanticsSection(promptContext, activeToolNames),
    buildCapabilityManifest(promptContext, activeToolNames, allToolNames),
    buildSkillsSection(promptContext),
    buildIntegrationsSection(promptContext),
    buildMcpToolsSection(promptContext),
    buildDecisionHeuristics(promptContext, activeToolNames),
    buildExecutionRecoverySection(promptContext, activeToolNames),
    promptContext.threadMode === "plan"
      ? buildPlanModeOverlay(promptContext, activeToolNames)
      : buildChatModeOverlay(promptContext, activeToolNames),
  );
}
