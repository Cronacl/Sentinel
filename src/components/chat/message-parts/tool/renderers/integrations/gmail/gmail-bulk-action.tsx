"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type BulkInput = {
  messageIds: string[];
  action: string;
};

type BulkOutput = {
  action: string;
  modifiedCount: number;
};

const BULK_ACTION_META: Record<
  string,
  { label: string; pastTense: string; icon: string; iconClass: string }
> = {
  archive: {
    label: "Archive",
    pastTense: "archived",
    icon: "solar:archive-minimalistic-linear",
    iconClass: "text-warning",
  },
  trash: {
    label: "Trash",
    pastTense: "trashed",
    icon: "solar:trash-bin-2-linear",
    iconClass: "text-danger",
  },
  star: {
    label: "Star",
    pastTense: "starred",
    icon: "solar:star-linear",
    iconClass: "text-warning",
  },
  unstar: {
    label: "Unstar",
    pastTense: "unstarred",
    icon: "solar:star-cross-linear",
    iconClass: "text-foreground/50",
  },
  mark_read: {
    label: "Mark as read",
    pastTense: "marked as read",
    icon: "solar:letter-opened-linear",
    iconClass: "text-primary",
  },
  mark_unread: {
    label: "Mark as unread",
    pastTense: "marked as unread",
    icon: "solar:letter-unread-linear",
    iconClass: "text-primary",
  },
};

export const GmailBulkActionTool = memo(function GmailBulkActionTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    setIsExpanded(state.needsApproval);
  }, [part.toolCallId, state.needsApproval]);

  const input = "input" in part ? (part.input as BulkInput) : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as BulkOutput)
      : null;

  const actionKey = input?.action ?? output?.action ?? "";
  const meta = BULK_ACTION_META[actionKey] ?? {
    label: "Bulk action",
    pastTense: "modified",
    icon: "solar:layers-linear",
    iconClass: "text-foreground/50",
  };

  const msgCount = input?.messageIds?.length ?? 0;

  const summary = state.needsApproval
    ? `${meta.label} ${msgCount} email${msgCount !== 1 ? "s" : ""} — awaiting approval`
    : state.isRunning
      ? `Processing ${msgCount} email${msgCount !== 1 ? "s" : ""}…`
      : state.hasOutput && output
        ? `${output.modifiedCount} email${output.modifiedCount !== 1 ? "s" : ""} ${meta.pastTense}`
        : state.isError
          ? `Failed to ${meta.label.toLowerCase()}`
          : `Processing ${msgCount} email${msgCount !== 1 ? "s" : ""}…`;

  return (
    <IntegrationToolLayout
      actions={
        state.showApprovalActions ? (
          <div className="flex items-center gap-2">
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => state.approvalId && onApprove?.(state.approvalId)}
              size="sm"
            >
              Allow
            </Button>
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => state.approvalId && onDeny?.(state.approvalId)}
              size="sm"
              variant="ghost"
            >
              Deny
            </Button>
          </div>
        ) : undefined
      }
      errorText={state.isError ? state.errorText : undefined}
      provider="Gmail"
      providerIcon={
        <IntegrationProviderIcon provider="gmail" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      isExpandable={Boolean(state.needsApproval && input)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        output ? (
          <span className="flex items-center gap-1">
            <Icon icon={meta.icon} className={`h-3 w-3 ${meta.iconClass}`} />
            {output.modifiedCount} email
            {output.modifiedCount !== 1 ? "s" : ""} {meta.pastTense}
          </span>
        ) : undefined
      }
    >
      {state.needsApproval && input ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-foreground/70">
            <Icon icon={meta.icon} className={`h-4 w-4 ${meta.iconClass}`} />
            <span>
              {meta.label} {msgCount} email
              {msgCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
