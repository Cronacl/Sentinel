import type { ComponentType } from "react";

import type { ToolPart as ToolPartType } from "../types";

export type RendererProps = {
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
  part: ToolPartType;
};

export type Renderer = ComponentType<RendererProps>;
