"use client";

import { Button } from "@heroui/react";

import type { RendererProps } from "../renderer";
import { getCopilotApprovalReason } from "./copilot-helpers";

function getApprovalId(part: RendererProps["part"]) {
  if (
    !("approval" in part) ||
    !part.approval ||
    typeof part.approval !== "object" ||
    !("id" in part.approval) ||
    typeof part.approval.id !== "string"
  ) {
    return null;
  }

  return part.approval.id;
}

export function renderCopilotApprovalActions(input: {
  onApprove?: RendererProps["onApprove"];
  onDeny?: RendererProps["onDeny"];
  part: RendererProps["part"];
}) {
  const approvalId = getApprovalId(input.part);
  const reason =
    "approval" in input.part
      ? getCopilotApprovalReason(input.part.approval)
      : undefined;

  if (
    input.part.state !== "approval-requested" ||
    !approvalId ||
    !input.onApprove ||
    !input.onDeny
  ) {
    return undefined;
  }

  return (
    <div className="flex flex-col gap-2">
      {reason ? (
        <p className="line-clamp-2 text-[11px] text-muted">{reason}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          className="h-7 min-w-0 px-3 text-[11px]"
          onPress={() => input.onApprove?.(approvalId)}
          size="sm"
          variant="primary"
        >
          Approve
        </Button>
        <Button
          className="h-7 min-w-0 px-3 text-[11px]"
          onPress={() => input.onDeny?.(approvalId)}
          size="sm"
          variant="ghost"
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
