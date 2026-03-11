import type { ComponentType } from "react";

import type { ToolPart as ToolPartType } from "../types";

export type ToolRendererProps = {
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
  part: ToolPartType;
};

export type ToolRenderer = ComponentType<ToolRendererProps>;
