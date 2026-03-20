import type { StepResult, ToolSet } from "ai";

import {
  getActiveCategories,
  TOOL_CATALOG,
  type ToolCategory,
} from "./tools/catalog";
import type { ThreadPromptContext } from "./prompt-context";

export const INTEGRATION_TOOL_PREFIXES: Partial<Record<string, string>> = {
  airtable: "airtable_",
  github: "gh_",
  gmail: "gmail_",
  google_calendar: "gcal_",
  google_drive: "gdrive_",
  linear: "linear_",
  mongodb: "mongo_",
  mysql: "mysql_",
  notion: "notion_",
  postgresql: "pg_",
  slack: "slack_",
};

function uniqueToolNames(toolNames: string[]) {
  return Array.from(new Set(toolNames));
}

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function getLatestUserText(promptContext: ThreadPromptContext) {
  return promptContext.latestUserText?.toLowerCase().trim() ?? "";
}

function hasAnyTool(toolNames: string[], names: string[]) {
  return names.some((name) => toolNames.includes(name));
}

function appendMatchingTools(
  activeTools: string[],
  availableTools: string[],
  names: string[],
) {
  for (const name of names) {
    if (availableTools.includes(name)) {
      activeTools.push(name);
    }
  }
}

function getIntegrationToolsForPrompt(
  promptContext: ThreadPromptContext,
  availableTools: string[],
  text: string,
) {
  const requestedPrefixes = promptContext.enabledIntegrations
    .map((integration) => ({
      prefix: INTEGRATION_TOOL_PREFIXES[integration.provider],
      provider: integration.provider,
    }))
    .filter(
      (entry) =>
        entry.prefix &&
        (text.includes(entry.provider.replaceAll("_", " ")) ||
          text.includes(entry.provider)),
    )
    .map((entry) => entry.prefix)
    .filter((prefix): prefix is string => Boolean(prefix));

  return availableTools.filter((toolName) =>
    requestedPrefixes.some((prefix) => toolName.startsWith(prefix)),
  );
}

function getMcpToolsForPrompt(
  promptContext: ThreadPromptContext,
  availableTools: string[],
  text: string,
) {
  const requestedNamespaces = promptContext.enabledMcpServers
    .map((server) => server.namespace)
    .filter(
      (namespace) =>
        text.includes(namespace.replaceAll("_", " ")) || text.includes(namespace),
    );

  return availableTools.filter((toolName) =>
    requestedNamespaces.some((namespace) =>
      toolName.startsWith(`mcp_${namespace}__`),
    ),
  );
}

export function hasWorkspaceInspectionContext(promptContext: ThreadPromptContext) {
  return (
    promptContext.allowedInspectionRoots.length > 0 ||
    promptContext.skillRoots.length > 0
  );
}

function selectChatCoreTools(
  activeTools: string[],
  availableTools: string[],
  promptContext: ThreadPromptContext,
) {
  appendMatchingTools(activeTools, availableTools, ["manage_task"]);

  if (promptContext.availableSkills.length > 0) {
    appendMatchingTools(activeTools, availableTools, ["load_skill"]);
  }
}

function selectPlanCoreTools(activeTools: string[], availableTools: string[]) {
  appendMatchingTools(activeTools, availableTools, [
    "create_plan",
    "update_plan",
    "manage_task",
    "ask_question",
  ]);
}

function selectInspectionTools(activeTools: string[], availableTools: string[]) {
  appendMatchingTools(activeTools, availableTools, ["list", "glob", "read", "grep"]);
}

function selectExecutionTools(activeTools: string[], availableTools: string[]) {
  appendMatchingTools(activeTools, availableTools, [
    "batch_read",
    "diff",
    "diagnostics",
    "git",
    "run_task",
    "shell_command",
  ]);
}

function selectMutationTools(activeTools: string[], availableTools: string[]) {
  appendMatchingTools(activeTools, availableTools, [
    "edit",
    "multiedit",
    "create_file",
    "delete_file",
    "move_file",
    "apply_patch",
  ]);
}

function selectWebTools(activeTools: string[], availableTools: string[]) {
  appendMatchingTools(activeTools, availableTools, ["websearch", "webfetch"]);
}

function selectMemoryTools(activeTools: string[], availableTools: string[]) {
  appendMatchingTools(activeTools, availableTools, [
    "search_memory",
    "save_memory",
    "forget_memory",
  ]);
}

export function selectAlwaysOnChatTools({
  availableToolNames,
  promptContext,
}: {
  availableToolNames: string[];
  promptContext: ThreadPromptContext;
}) {
  if (promptContext.threadMode !== "chat") {
    return [];
  }

  const activeTools: string[] = [];

  if (hasWorkspaceInspectionContext(promptContext)) {
    selectInspectionTools(activeTools, availableToolNames);
    selectExecutionTools(activeTools, availableToolNames);
  } else if (promptContext.shellStartDirectory) {
    appendMatchingTools(activeTools, availableToolNames, ["shell_command"]);
  }

  if (promptContext.allowedMutationRoot) {
    selectMutationTools(activeTools, availableToolNames);
  }

  selectWebTools(activeTools, availableToolNames);

  return uniqueToolNames(activeTools);
}

export function computeLatentToolSummary(
  availableToolNames: string[],
  activeToolNames: string[],
  promptContext: ThreadPromptContext,
) {
  const inactiveToolNames = availableToolNames.filter(
    (toolName) => !activeToolNames.includes(toolName),
  );
  const categories = Array.from(getActiveCategories(inactiveToolNames)).sort();

  return {
    categories,
    integrationNamespaces: promptContext.enabledIntegrations
      .map((integration) => integration.provider)
      .sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ),
    mcpNamespaces: promptContext.enabledMcpServers
      .map((server) => server.namespace)
      .sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ),
  };
}

export function selectInitialActiveTools({
  availableToolNames,
  promptContext,
}: {
  availableToolNames: string[];
  promptContext: ThreadPromptContext;
}) {
  const activeTools: string[] = [];
  const latestUserText = getLatestUserText(promptContext);
  const wantsExecution = matchesAny(latestUserText, [
    /\btest\b/,
    /\blint\b/,
    /\btypecheck\b/,
    /\bbuild\b/,
    /\bdebug\b/,
    /\bfix\b/,
    /\bfailing\b/,
    /\berror\b/,
  ]);
  const wantsMutation = matchesAny(latestUserText, [
    /\bimplement\b/,
    /\bedit\b/,
    /\bchange\b/,
    /\bupdate\b/,
    /\brefactor\b/,
    /\bfix\b/,
    /\bcreate\b/,
    /\bdelete\b/,
    /\brename\b/,
  ]);
  const wantsGit = matchesAny(latestUserText, [
    /\bgit\b/,
    /\bcommit\b/,
    /\bbranch\b/,
    /\bdiff\b/,
    /\bstatus\b/,
  ]);
  const wantsWeb = matchesAny(latestUserText, [
    /\bweb\b/,
    /\binternet\b/,
    /\bresearch\b/,
    /\blatest\b/,
    /\bdocs?\b/,
    /\bsearch\b/,
    /\bfetch\b/,
    /https?:\/\//,
  ]);
  const wantsMemory = matchesAny(latestUserText, [
    /\bremember\b/,
    /\bpreference\b/,
    /\bas usual\b/,
    /\blike before\b/,
  ]);

  if (promptContext.threadMode === "plan") {
    selectPlanCoreTools(activeTools, availableToolNames);
    if (promptContext.availableSkills.length > 0) {
      appendMatchingTools(activeTools, availableToolNames, ["load_skill"]);
    }
    if (hasWorkspaceInspectionContext(promptContext)) {
      selectInspectionTools(activeTools, availableToolNames);
    }
    return uniqueToolNames(activeTools);
  }

  selectChatCoreTools(activeTools, availableToolNames, promptContext);
  activeTools.push(
    ...selectAlwaysOnChatTools({
      availableToolNames,
      promptContext,
    }),
  );

  if (wantsMemory) {
    selectMemoryTools(activeTools, availableToolNames);
  }

  activeTools.push(
    ...getIntegrationToolsForPrompt(
      promptContext,
      availableToolNames,
      latestUserText,
    ),
  );
  activeTools.push(
    ...getMcpToolsForPrompt(promptContext, availableToolNames, latestUserText),
  );

  if (wantsMutation && hasWorkspaceInspectionContext(promptContext)) {
    appendMatchingTools(activeTools, availableToolNames, ["diff", "batch_read"]);
  }

  if (wantsExecution || wantsGit) {
    selectExecutionTools(activeTools, availableToolNames);
  }

  if (wantsWeb) {
    selectWebTools(activeTools, availableToolNames);
  }

  return uniqueToolNames(activeTools);
}

function toolCallsInclude(
  steps: ReadonlyArray<StepResult<ToolSet>>,
  toolNames: string[],
) {
  return steps.some((step) =>
    (step.toolCalls ?? []).some((toolCall) => toolNames.includes(toolCall.toolName)),
  );
}

function outputsSuggestProjectContext(steps: ReadonlyArray<StepResult<ToolSet>>) {
  const projectMarkerPattern =
    /\b(package\.json|bun\.lockb?|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|tsconfig\.json|next\.config|vite\.config|src\/|app\/|pages\/)\b/i;

  return steps.some((step) =>
    (step.toolResults ?? []).some((toolResult) =>
      projectMarkerPattern.test(JSON.stringify(toolResult)),
    ),
  );
}

function outputsSuggestTargetFiles(steps: ReadonlyArray<StepResult<ToolSet>>) {
  const filePattern = /\b[\w./-]+\.(ts|tsx|js|jsx|json|md|css|scss|py|go|rs)\b/i;

  return steps.some((step) =>
    (step.toolResults ?? []).some((toolResult) =>
      filePattern.test(JSON.stringify(toolResult)),
    ),
  );
}

export function selectStepActiveTools({
  availableToolNames,
  initialActiveTools,
  promptContext,
  steps,
}: {
  availableToolNames: string[];
  initialActiveTools: string[];
  promptContext: ThreadPromptContext;
  steps: ReadonlyArray<StepResult<ToolSet>>;
}) {
  const activeTools = [
    ...initialActiveTools,
    ...selectAlwaysOnChatTools({
      availableToolNames,
      promptContext,
    }),
  ];
  const latestUserText = getLatestUserText(promptContext);
  const userRequestedMutation = matchesAny(latestUserText, [
    /\bimplement\b/,
    /\bfix\b/,
    /\bedit\b/,
    /\bchange\b/,
    /\bupdate\b/,
    /\bcreate\b/,
    /\bdelete\b/,
  ]);

  if (
    promptContext.preferredProjectRoot &&
    (toolCallsInclude(steps, ["list", "glob", "read", "grep"]) ||
      outputsSuggestProjectContext(steps))
  ) {
    selectExecutionTools(activeTools, availableToolNames);
  }

  if (
    promptContext.allowedMutationRoot &&
    userRequestedMutation &&
    (toolCallsInclude(steps, ["read", "batch_read", "diff", "glob", "grep"]) ||
      outputsSuggestTargetFiles(steps))
  ) {
    selectMutationTools(activeTools, availableToolNames);
  }

  if (
    toolCallsInclude(steps, ["list", "glob", "read", "grep"]) &&
    !hasAnyTool(activeTools, ["websearch", "webfetch"]) &&
    matchesAny(latestUserText, [/\bdocs?\b/, /\blatest\b/, /\bresearch\b/])
  ) {
    selectWebTools(activeTools, availableToolNames);
  }

  if (
    toolCallsInclude(steps, ["list", "glob", "read"]) &&
    availableToolNames.includes("batch_read")
  ) {
    appendMatchingTools(activeTools, availableToolNames, ["batch_read", "diff"]);
  }

  return uniqueToolNames(activeTools);
}

export function categorizeToolNames(toolNames: string[]) {
  const categories = new Set<ToolCategory>();
  for (const toolName of toolNames) {
    const category = TOOL_CATALOG[toolName]?.category;
    if (category) {
      categories.add(category);
    }
  }
  return Array.from(categories).sort();
}
