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
  appendMatchingTools(activeTools, availableTools, ["run_subagent"]);

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

function selectBrowserTools(activeTools: string[], availableTools: string[]) {
  appendMatchingTools(activeTools, availableTools, [
    "browser_tabs",
    "browser_open",
    "browser_navigate",
    "browser_back",
    "browser_forward",
    "browser_reload",
    "browser_snapshot",
    "browser_screenshot",
    "browser_click",
    "browser_fill",
    "browser_press",
    "browser_console_logs",
  ]);
}

function selectComputerTools(activeTools: string[], availableTools: string[]) {
  appendMatchingTools(activeTools, availableTools, [
    "computer_status",
    "computer_screenshot",
    "computer_action",
    "computer_apps",
    "computer_app",
    "computer_clipboard",
    "computer_ax_tree",
    "computer_ax_find",
    "computer_ax_action",
  ]);
}

function toolSelectionContextText(promptContext: ThreadPromptContext) {
  return [
    promptContext.latestUserText,
    promptContext.planSummary?.title,
    promptContext.planSummary?.goal,
    promptContext.planSummary?.summary,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
}

function userRequestNeedsBrowserTools(promptContext: ThreadPromptContext) {
  const text = toolSelectionContextText(promptContext);
  const explicitBrowserUsePattern =
    /\b(browser[-\s]?use|browser tools?|use (?:the )?browser|in-app browser|browser sidebar|current browser tab|live browser)\b/i;
  const browserSurfacePattern =
    /\b(browser|webview|tab|localhost|127\.0\.0\.1|::1|screenshot|console logs?|dom snapshot|inspect ui|test ui)\b/i;
  const browserInteractionPattern =
    /\b(click|fill|type|press|reload|go back|go forward)\b/i;
  const livePagePattern =
    /\b(open|navigate|inspect|test|screenshot|click|fill|type|press)\b[\s\S]{0,40}\b(page|ui)\b|\b(page|ui)\b[\s\S]{0,40}\b(open|navigate|inspect|test|screenshot|click|fill|type|press)\b/i;

  return (
    explicitBrowserUsePattern.test(text) ||
    browserSurfacePattern.test(text) ||
    browserInteractionPattern.test(text) ||
    livePagePattern.test(text)
  );
}

function userRequestNeedsComputerTools(promptContext: ThreadPromptContext) {
  const text = toolSelectionContextText(promptContext);
  const explicitComputerUsePattern =
    /\b(computer[-\s]?use|computer tools?|desktop tools?|full desktop|desktop automation|control (?:my )?(?:mac|computer|desktop))\b/i;
  const desktopSurfacePattern =
    /\b(desktop|screen|display|cursor|mouse|keyboard|macos|accessibility|screen recording|os-level|full desktop)\b/i;
  const desktopInteractionPattern =
    /\b(click|move|scroll|type|keypress|press|screenshot|control|operate|open|launch|focus)\b[\s\S]{0,50}\b(desktop|screen|computer|mac|app|window)\b|\b(desktop|screen|computer|mac|app|window)\b[\s\S]{0,50}\b(click|move|scroll|type|keypress|press|screenshot|control|operate|open|launch|focus)\b/i;
  const macAppTargetPattern =
    /\b(?:on|in|using|with)\s+(?:my\s+)?mac\b[\s\S]{0,80}\b(app|application|reminders?|calendar|notes?|finder|safari|mail|messages|photos|music|textedit|system settings)\b|\b(reminders?|calendar|notes?|finder|safari|mail|messages|photos|music|textedit|system settings|settings|craft)\s+(?:mac\s+)?(?:app|application)\b|\bmac\s+(?:reminders?|calendar|notes?|finder|safari|mail|messages|photos|music|textedit|system settings|settings)\s+(?:app|application)\b/i;
  const macAppWorkflowPattern =
    /\b(add|create|make|schedule|set|edit|delete|mark|open|launch|focus|use)\b[\s\S]{0,80}\b(?:on|in|using|with)\s+(?:my\s+)?mac\b/i;

  return (
    explicitComputerUsePattern.test(text) ||
    desktopSurfacePattern.test(text) ||
    desktopInteractionPattern.test(text) ||
    macAppTargetPattern.test(text) ||
    macAppWorkflowPattern.test(text)
  );
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

  if (userRequestNeedsBrowserTools(promptContext)) {
    selectBrowserTools(activeTools, availableToolNames);
  }

  if (userRequestNeedsComputerTools(promptContext)) {
    selectComputerTools(activeTools, availableToolNames);
  }

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
