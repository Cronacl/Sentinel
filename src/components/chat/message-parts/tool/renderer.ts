import type { ComponentType } from "react";

import type { ToolPart as ToolPartType } from "../types";

export type ApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "cancel"
  | "decline";

export type RendererProps = {
  onApprove?: (approvalId: string, response?: string) => void;
  onApproveWithDecision?: (
    approvalId: string,
    decision: ApprovalDecision,
  ) => void;
  onAnswerPlanQuestions?: (input: {
    answers: Array<{
      answer: string;
      optionLabel?: string | null;
      questionId: string;
    }>;
    questionSetId: string;
  }) => void;
  onDeny?: (approvalId: string) => void;
  onStartPlanImplementation?: () => void;
  part: ToolPartType;
};

export type Renderer = ComponentType<RendererProps>;
