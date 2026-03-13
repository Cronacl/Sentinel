import type { ToolPart } from "../types";
import type { Renderer } from "./renderer";
import { FileTool } from "./renderers/file";
import { GlobTool } from "./renderers/glob";
import { GrepTool } from "./renderers/grep";
import { ListTool } from "./renderers/list";
import { MemoryTool } from "./renderers/memory";
import { PlanTool } from "./renderers/plan";
import { ReadTool } from "./renderers/read";
import { RunTaskTool } from "./renderers/run-task";
import { ShellTool } from "./renderers/shell";
import { WebSearchTool } from "./renderers/websearch";
import { WebFetchTool } from "./renderers/webfetch";

const renderers: Record<string, Renderer> = {
  create_file: FileTool,
  create_plan: PlanTool,
  delete_file: FileTool,
  edit: FileTool,
  multiedit: FileTool,
  grep: GrepTool,
  glob: GlobTool,
  list: ListTool,
  ask_question: PlanTool,
  forget_memory: MemoryTool,
  manage_task: PlanTool,
  read: ReadTool,
  run_task: RunTaskTool,
  save_memory: MemoryTool,
  search_memory: MemoryTool,
  shell_command: ShellTool,
  update_plan: PlanTool,
  websearch: WebSearchTool,
  webfetch: WebFetchTool,
};

export function resolveRenderer(part: ToolPart): Renderer | undefined {
  if (part.type === "dynamic-tool") {
    return renderers[part.toolName];
  }

  return renderers[part.type.slice(5)];
}
