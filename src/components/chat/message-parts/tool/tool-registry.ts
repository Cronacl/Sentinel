import type { ToolPart } from "../types";
import type { ToolRenderer } from "./tool-renderer";
import { ShellToolPart } from "./shell-tool-part";

const toolRenderers: Record<string, ToolRenderer> = {
  shell_command: ShellToolPart,
};

export function resolveToolRenderer(part: ToolPart): ToolRenderer | undefined {
  if (part.type === "dynamic-tool") {
    return undefined;
  }

  return toolRenderers[part.type.slice(5)];
}
