import type { StepResult, ToolSet } from "ai";

import {
  getActiveCategories,
  TOOL_CATALOG,
  type ToolCategory,
} from "./tools/catalog";
import type { ThreadPromptContext } from "./prompt-context";

function uniqueToolNames(toolNames: string[]) {
  return Array.from(new Set(toolNames));
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

export function hasWorkspaceInspectionContext(
  promptContext: ThreadPromptContext,
) {
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

function selectInspectionTools(
  activeTools: string[],
  availableTools: string[],
) {
  appendMatchingTools(activeTools, availableTools, [
    "list",
    "glob",
    "read",
    "load_document",
    "grep",
  ]);
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
  appendMatchingTools(activeTools, availableTools, [
    "websearch",
    "webfetch",
    "generate_image",
    "generate_video",
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

  return uniqueToolNames(activeTools);
}

export function selectStepActiveTools({
  availableToolNames,
  initialActiveTools,
  promptContext,
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
