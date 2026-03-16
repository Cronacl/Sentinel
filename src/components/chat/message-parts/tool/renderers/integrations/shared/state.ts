"use client";

import type { ToolPart } from "../../../../types";

export function getIntegrationToolInteractionState(
  part: ToolPart,
  {
    onApprove,
    onDeny,
  }: {
    onApprove?: (approvalId: string) => void;
    onDeny?: (approvalId: string) => void;
  } = {},
) {
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;

  return {
    approvalId,
    errorText: "errorText" in part ? part.errorText : undefined,
    hasInput: "input" in part && part.input !== undefined,
    hasOutput: "output" in part && part.output !== undefined,
    isDenied: part.state === "output-denied",
    isError: part.state === "output-error" || part.state === "output-denied",
    isRunning:
      part.state === "approval-responded" ||
      part.state === "input-streaming" ||
      part.state === "input-available",
    needsApproval: part.state === "approval-requested",
    showApprovalActions: Boolean(
      part.state === "approval-requested" && approvalId && onApprove && onDeny,
    ),
  };
}
