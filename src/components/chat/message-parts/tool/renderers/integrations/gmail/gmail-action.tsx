"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type ActionInput = {
  messageId: string;
};

type ActionOutput = {
  status: string;
};

const ACTION_META: Record<
  string,
  { label: string; pastTense: string; icon: string; iconClass: string }
> = {
  gmail_archive: {
    label: "Archive",
    pastTense: "Email archived",
    icon: "solar:archive-minimalistic-linear",
    iconClass: "text-warning",
  },
  gmail_trash: {
    label: "Trash",
    pastTense: "Email moved to trash",
    icon: "solar:trash-bin-2-linear",
    iconClass: "text-danger",
  },
};

export const GmailActionTool = memo(function GmailActionTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const meta = ACTION_META[toolName] ?? {
    label: "Action",
    pastTense: "Done",
    icon: "solar:check-circle-linear",
    iconClass: "text-foreground/50",
  };
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    setIsExpanded(state.needsApproval);
  }, [part.toolCallId, state.needsApproval]);

  const input = "input" in part ? (part.input as ActionInput) : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as ActionOutput)
      : null;

  const summary = state.needsApproval
    ? `${meta.label} email — awaiting approval`
    : state.isRunning
      ? `${meta.label === "Trash" ? "Trashing" : "Archiving"} email…`
      : state.hasOutput && output
        ? meta.pastTense
        : state.isError
          ? `Failed to ${meta.label.toLowerCase()} email`
          : `${meta.label === "Trash" ? "Trashing" : "Archiving"} email…`;

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
            {meta.pastTense}
          </span>
        ) : undefined
      }
    >
      {state.needsApproval && input ? (
        <div className="flex items-center gap-2 text-xs text-foreground/70">
          <Icon icon={meta.icon} className={`h-4 w-4 ${meta.iconClass}`} />
          <span>
            {meta.label} message <code className="rounded bg-foreground/5 px-1 py-0.5 text-[10px]">{input.messageId}</code>
          </span>
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
