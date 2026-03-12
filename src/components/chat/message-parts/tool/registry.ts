import type { ToolPart } from "../types";
import type { Renderer } from "./renderer";
import { FileTool } from "./renderers/file";
import { GlobTool } from "./renderers/glob";
import { GrepTool } from "./renderers/grep";
import { ListTool } from "./renderers/list";
import { ReadTool } from "./renderers/read";
import { RunTaskTool } from "./renderers/run-task";
import { ShellTool } from "./renderers/shell";
import { WebSearchTool } from "./renderers/websearch";
import { WebFetchTool } from "./renderers/webfetch";

const renderers: Record<string, Renderer> = {
  create_file: FileTool,
  delete_file: FileTool,
  edit: FileTool,
  multiedit: FileTool,
  grep: GrepTool,
  glob: GlobTool,
  list: ListTool,
  read: ReadTool,
  run_task: RunTaskTool,
  shell_command: ShellTool,
  websearch: WebSearchTool,
  webfetch: WebFetchTool,
};

export function resolveRenderer(part: ToolPart): Renderer | undefined {
  if (part.type === "dynamic-tool") {
    return undefined;
  }

  return renderers[part.type.slice(5)];
}
