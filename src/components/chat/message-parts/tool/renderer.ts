import type { ComponentType } from "react";

import type { ToolPart as ToolPartType } from "../types";

export type RendererProps = {
  onApprove?: (approvalId: string) => void;
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
