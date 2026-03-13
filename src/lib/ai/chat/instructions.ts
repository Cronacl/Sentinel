import { each, lines, section, when } from "@/lib/prompt";
import type { ToolApprovalPolicyMap } from "./tool-approval-policy";
import { TOOL_CATALOG, getActiveCategories, getToolsInCategory } from "./tools";
import type { ThreadAgentCallOptions } from "./agent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function approvalLabel(
  policies: ToolApprovalPolicyMap,
  toolName: string,
): string {
  return policies[toolName as keyof ToolApprovalPolicyMap]
    ? "after approval"
    : "without approval";
}

function toolAvailabilityLines(
  toolNames: string[],
  policies: ToolApprovalPolicyMap,
  verb: "can use" | "can still use" = "can use",
): string {
  const entries = toolNames.map((name) => TOOL_CATALOG[name]).filter(Boolean);

  if (entries.length === 0) return "";

  return each(
    toolNames.filter((n) => TOOL_CATALOG[n]),
    (name) => {
      const entry = TOOL_CATALOG[name]!;
      return `You ${verb} ${entry.label} ${entry.capability} ${approvalLabel(policies, name)}.`;
    },
  );
}

function formatMcpToolLabel(toolName: string) {
  return toolName
    .replace(/^mcp_/, "")
    .replace(/__/g, " -> ")
    .replace(/_/g, " ");
}

function mcpAvailabilityLines(toolNames: string[]): string {
  const mcpNames = toolNames.filter((name) => name.startsWith("mcp_"));

  if (mcpNames.length === 0) {
    return "";
  }

  return lines(
    "External MCP tools are available for connected integrations.",
    each(
      mcpNames,
      (name) =>
        `Use ${formatMcpToolLabel(name)} when it directly matches the user's request.`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Category-specific rules (only emitted when the category is active)
// ---------------------------------------------------------------------------

function inspectionRules(): string[] {
  return [
    "Prefer list when you need to discover folders or get a quick overview.",
    "Prefer glob when you already know the filename pattern you need.",
    "Prefer read when you need actual file contents or a bounded slice.",
    "Prefer grep when you need to find files containing specific text or patterns.",
  ];
}

function memoryRules(): string[] {
  return [
    "Prefer search_memory before asking the user to repeat stable preferences, habits, or constraints.",
    "Use save_memory only for durable facts, preferences, workflows, and recurring context.",
    "Never save secrets, API keys, access tokens, passwords, or one-off task state to memory.",
    "Use forget_memory when the user explicitly says a previously stored fact is outdated or wrong.",
  ];
}

function webRules(): string[] {
  return [
    "Prefer websearch when you need to discover sources, articles, or references for a topic.",
    "Prefer webfetch when the answer depends on a known URL or a link shared in the conversation.",
    "Prefer webfetch after websearch when you need to read a specific result in full.",
    "When using the searxng provider, use searchType auto and leave livecrawl unset.",
    "Prefer format=markdown for web pages unless plain text or raw HTML is specifically needed.",
    "Use batch webfetch only when comparing or gathering multiple pages is clearly useful.",
  ];
}

function mutationRules(): string[] {
  return [
    "Prefer multiedit instead of repeated edit calls when you need several replacements in one file.",
    "Prefer edit, create_file, and delete_file for direct file changes instead of shell commands.",
  ];
}

function executionRules(): string[] {
  return [
    "Prefer run_task for standard project scripts instead of raw shell commands.",
  ];
}

function shellRules(): string[] {
  return [
    "Propose only one command at a time.",
    "Explain the command briefly in the rationale field.",
    "Avoid full-screen or interactive TUI programs.",
    "Prefer non-interactive flags for scaffolding, installs, and builds.",
    "When a task may run for several minutes, state that clearly before asking for approval.",
    "Prefer read-only inspection before mutations or installs.",
    "When a tool requests approval, wait for the user approval workflow to continue.",
  ];
}

function mcpRules(): string[] {
  return [
    "Use MCP tools when the integration can answer or perform the task more directly than workspace or web tools.",
    "Prefer read-only MCP actions before mutating actions when exploring a browser or external system.",
    "For browser MCP tools, inspect tabs, snapshots, screenshots, or console state before clicking or typing.",
    "If an MCP tool requests approval, wait for the approval workflow before continuing.",
  ];
}

function permissionRules(permissionMode: string): string[] {
  if (permissionMode === "full") {
    return [
      "Full permissions mode is active. File and task tools may use absolute paths outside the workspace.",
    ];
  }

  return [
    "In default permissions mode, all file and task tools must stay inside the selected workspace root.",
  ];
}

// ---------------------------------------------------------------------------
// Plan mode instructions
// ---------------------------------------------------------------------------

function buildPlanInstructions(
  options: ThreadAgentCallOptions,
  activeToolNames: string[],
): string {
  const {
    defaultDirectory,
    permissionMode,
    systemPrompt,
    toolApprovalPolicies,
  } = options;

  const categories = getActiveCategories(activeToolNames);
  const hasInspection = categories.has("inspection");

  return lines(
    systemPrompt.trim(),

    section("Plan Mode", [
      "This thread is in plan mode. You are a read-only planning specialist.",
      "Your role is to understand the request, gather context, and produce a thorough plan — not to implement it.",
      "Do not attempt execution, file edits, shell commands, web access, or memory operations while planning.",
      "All plan content must go through the create_plan or update_plan tools. The plan document should be substantial markdown, closer to a detailed planning memo than a quick task list.",
      "Choose the plan audience that best fits the request: technical for specialists and detailed execution, general for broader stakeholders.",
      "Use create_plan when the thread has no plan yet.",
      "Use update_plan to revise the existing plan without losing useful detail.",
      "Use manage_task for all task creation, status updates, and deletions after the plan exists.",
      "Use ask_question when an ambiguity materially changes the plan.",
      "When using ask_question, ask 1 to 3 questions total.",
      "Each ask_question item must have 2 to 4 options only.",
      "Set allowMultiple to true when the user should be able to pick more than one option.",
      "If there are many possible answers, collapse them into 2 to 4 representative choices and rely on the custom answer field for anything else.",
      "After calling create_plan or update_plan, do NOT repeat or summarize the plan title, goal, summary, or document content in the chat. The plan is rendered automatically in a dedicated panel. If you want to say something after creating the plan, keep it to a single short sentence like acknowledging the plan is ready or asking if the user wants any changes.",
      "Keep plans substantial, actionable, and decision-complete.",
      "Prefer task statuses consistently: pending, in_progress, completed, blocked.",
      "Gather context from available tools first when they can answer the uncertainty.",
      "Ask structured questions instead of guessing when requirements, scope, or constraints remain unclear.",
      "Use a shared core structure in the document: overview, current understanding, recommended approach, work breakdown, risks or open questions, and validation criteria.",
      "Technical plans should include key components, dependencies, workflows, sequencing, and critical touchpoints when discoverable.",
      "General plans should stay plain-language, explain impact, and avoid unnecessary implementation detail.",
      "Do not produce speculative implementation details when the user has not decided key tradeoffs.",
    ]),

    when(hasInspection && defaultDirectory, () => {
      const inspectionNames = getToolsInCategory(activeToolNames, "inspection");
      return lines(
        "Before asking clarification questions or creating a plan, inspect the linked workspace when the existing files could answer the uncertainty.",
        toolAvailabilityLines(inspectionNames, toolApprovalPolicies),
        `Default directory: ${defaultDirectory}\nPermission mode: ${permissionMode}.`,
        section("Inspection Rules for Plan Mode", [
          "Inspect workspace structure, configuration files, documentation, and key entry points before asking questions.",
          ...inspectionRules(),
          "Stay read-only while planning. Do not use mutation, execution, web, or memory tools in plan mode.",
          "Ask questions only after inspection when the remaining ambiguity materially changes the plan.",
        ]),
      );
    }),

    when(
      !hasInspection || !defaultDirectory,
      "No workspace is linked for direct file inspection in this thread.\nIf workspace context is needed, ask focused questions about the project structure, stack, and constraints before creating a plan.",
    ),
  );
}

// ---------------------------------------------------------------------------
// Chat mode instructions
// ---------------------------------------------------------------------------

function buildChatInstructions(
  options: ThreadAgentCallOptions,
  activeToolNames: string[],
): string {
  const {
    defaultDirectory,
    memorySettings,
    permissionMode,
    searchProviders,
    searchSettings,
    sourceMessageId,
    systemPrompt,
    toolApprovalPolicies,
    webFetchSettings,
  } = options;

  const categories = getActiveCategories(activeToolNames);

  const configuredSearchProviders = Object.values(searchProviders).filter(
    (p) => p?.isEnabled,
  );

  const webSearchGuidance = configuredSearchProviders.length
    ? `Web search is available through ${configuredSearchProviders
        .map((p) => p.provider)
        .join(", ")}. Default provider: ${searchSettings.defaultProvider}.`
    : "Web search is configured with no active providers yet. Configure a provider in Settings > Search before using websearch.";

  const webFetchBatchGuidance = webFetchSettings.batchEnabled
    ? `Batch webfetch is enabled. You may use the urls field for up to ${webFetchSettings.batchLimit} URLs in one call.`
    : "Batch webfetch is disabled. Use one URL per webfetch call.";

  const memoryGuidance = memorySettings.enabled
    ? `Long-term memory is enabled with ${memorySettings.memoryProvider}:${memorySettings.memoryModel}.${sourceMessageId ? ` Current source message id: ${sourceMessageId}.` : ""}`
    : "Long-term memory is disabled. Do not use memory tools until the user enables Memory in Settings.";

  const hasWorkspace =
    Boolean(defaultDirectory) && categories.has("inspection");

  return lines(
    systemPrompt.trim(),

    when(hasWorkspace, () => {
      const allRules: string[] = [];

      if (categories.has("inspection")) allRules.push(...inspectionRules());
      if (categories.has("memory")) allRules.push(...memoryRules());
      if (categories.has("web")) allRules.push(...webRules());
      if (categories.has("mutation")) allRules.push(...mutationRules());
      if (categories.has("execution")) allRules.push(...executionRules());
      if (activeToolNames.some((name) => name.startsWith("mcp_"))) {
        allRules.push(...mcpRules());
      }
      allRules.push(...permissionRules(permissionMode));

      return lines(
        toolAvailabilityLines(activeToolNames, toolApprovalPolicies),
        mcpAvailabilityLines(activeToolNames),
        when(categories.has("web"), webSearchGuidance),
        when(categories.has("web"), webFetchBatchGuidance),
        `Default directory: ${defaultDirectory}\nPermission mode: ${permissionMode}.`,
        allRules.length > 0 ? section("Usage Guidelines", allRules) : "",
        when(
          categories.has("execution"),
          section("Shell Guidelines", shellRules()),
        ),
        when(categories.has("memory"), memoryGuidance),
      );
    }),

    when(!hasWorkspace, () => {
      const availableNames = activeToolNames.filter(
        (n) =>
          TOOL_CATALOG[n]?.category === "memory" ||
          TOOL_CATALOG[n]?.category === "web",
      );

      const allRules: string[] = [];
      if (categories.has("memory")) allRules.push(...memoryRules());
      if (categories.has("web")) allRules.push(...webRules());
      if (activeToolNames.some((name) => name.startsWith("mcp_"))) {
        allRules.push(...mcpRules());
      }

      return lines(
        "Workspace tools are currently unavailable because there is no selected workspace root.",
        availableNames.length > 0
          ? toolAvailabilityLines(
              availableNames,
              toolApprovalPolicies,
              "can still use",
            )
          : "",
        mcpAvailabilityLines(activeToolNames),
        when(categories.has("web"), webSearchGuidance),
        when(categories.has("web"), webFetchBatchGuidance),
        allRules.length > 0 ? section("Usage Guidelines", allRules) : "",
        when(categories.has("memory"), memoryGuidance),
        "Do not mention or attempt workspace file tools, task runners, or shell commands unless the user asks conceptually.",
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildThreadAgentInstructions(
  options: ThreadAgentCallOptions,
  activeToolNames: string[],
): string {
  return options.threadMode === "plan"
    ? buildPlanInstructions(options, activeToolNames)
    : buildChatInstructions(options, activeToolNames);
}
