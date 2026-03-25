export type ToolCategory =
  | "execution"
  | "inspection"
  | "integration"
  | "memory"
  | "mutation"
  | "plan"
  | "skill"
  | "web";

export type ToolCatalogEntry = {
  capability: string;
  category: ToolCategory;
  label: string;
};

import { INTEGRATION_TOOL_CATALOG } from "@/lib/integrations/catalog";

export const TOOL_CATALOG: Record<string, ToolCatalogEntry> = {
  ...INTEGRATION_TOOL_CATALOG,
  list: {
    capability: "to browse directory structure",
    category: "inspection",
    label: "the list tool",
  },
  glob: {
    capability: "to find files by name pattern",
    category: "inspection",
    label: "the glob tool",
  },
  read: {
    capability: "to read text file contents",
    category: "inspection",
    label: "the read tool",
  },
  load_document: {
    capability: "to load attachments and normalize documents into markdown",
    category: "inspection",
    label: "the load_document tool",
  },
  grep: {
    capability: "to search file contents by pattern",
    category: "inspection",
    label: "the grep tool",
  },
  diff: {
    capability: "to preview unified diffs before making changes",
    category: "inspection",
    label: "the diff tool",
  },
  batch_read: {
    capability: "to read multiple files or directories at once",
    category: "inspection",
    label: "the batch_read tool",
  },
  edit: {
    capability: "for targeted file edits",
    category: "mutation",
    label: "the edit tool",
  },
  multiedit: {
    capability: "for multiple edits in the same file",
    category: "mutation",
    label: "the multiedit tool",
  },
  create_file: {
    capability: "to create new files",
    category: "mutation",
    label: "the create_file tool",
  },
  delete_file: {
    capability: "to remove files",
    category: "mutation",
    label: "the delete_file tool",
  },
  move_file: {
    capability: "to atomically rename or move files",
    category: "mutation",
    label: "the move_file tool",
  },
  apply_patch: {
    capability: "to apply coordinated multi-file patches",
    category: "mutation",
    label: "the apply_patch tool",
  },
  run_task: {
    capability: "to run standard project scripts",
    category: "execution",
    label: "run_task",
  },
  shell_command: {
    capability: "to execute shell commands in the workspace",
    category: "execution",
    label: "the shell tool",
  },
  git: {
    capability: "to run safe structured git operations",
    category: "execution",
    label: "the git tool",
  },
  diagnostics: {
    capability: "to collect structured lint or type diagnostics",
    category: "execution",
    label: "the diagnostics tool",
  },
  search_memory: {
    capability: "to recall durable user or workspace context",
    category: "memory",
    label: "search_memory",
  },
  save_memory: {
    capability: "to store durable context for future conversations",
    category: "memory",
    label: "save_memory",
  },
  forget_memory: {
    capability: "to remove outdated or incorrect memories",
    category: "memory",
    label: "forget_memory",
  },
  websearch: {
    capability: "to discover web sources and references",
    category: "web",
    label: "the websearch tool",
  },
  webfetch: {
    capability: "to read web pages, documentation, and URLs",
    category: "web",
    label: "the webfetch tool",
  },
  load_skill: {
    capability: "to load specialized skill instructions on demand",
    category: "skill",
    label: "the load_skill tool",
  },
  create_plan: {
    capability: "to create the initial plan for this thread",
    category: "plan",
    label: "the create_plan tool",
  },
  update_plan: {
    capability: "to revise the existing plan",
    category: "plan",
    label: "the update_plan tool",
  },
  manage_task: {
    capability: "to create, update, or delete plan tasks",
    category: "plan",
    label: "the manage_task tool",
  },
  ask_question: {
    capability: "to ask structured clarification questions",
    category: "plan",
    label: "the ask_question tool",
  },
};

export function getActiveCategories(toolNames: string[]): Set<ToolCategory> {
  const categories = new Set<ToolCategory>();
  for (const name of toolNames) {
    const entry = TOOL_CATALOG[name];
    if (entry) categories.add(entry.category);
  }
  return categories;
}

export function getToolsInCategory(
  toolNames: string[],
  category: ToolCategory,
): string[] {
  return toolNames.filter((n) => TOOL_CATALOG[n]?.category === category);
}
