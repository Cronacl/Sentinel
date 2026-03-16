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

const ACTION_META: Record<
  string,
  {
    label: string;
    pastTense: string;
    gerund: string;
    icon: string;
    iconClass: string;
  }
> = {
  linear_create_issue: {
    label: "Create issue",
    pastTense: "Issue created",
    gerund: "Creating issue",
    icon: "solar:add-circle-linear",
    iconClass: "text-success",
  },
  linear_update_issue: {
    label: "Update issue",
    pastTense: "Issue updated",
    gerund: "Updating issue",
    icon: "solar:pen-new-round-linear",
    iconClass: "text-primary",
  },
  linear_delete_issue: {
    label: "Delete issue",
    pastTense: "Issue deleted",
    gerund: "Deleting issue",
    icon: "solar:trash-bin-2-linear",
    iconClass: "text-danger",
  },
};

export const LinearIssueActionTool = memo(function LinearIssueActionTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const meta = ACTION_META[toolName] ?? {
    label: "Action",
    pastTense: "Done",
    gerund: "Processing",
    icon: "solar:check-circle-linear",
    iconClass: "text-foreground/50",
  };
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const input = "input" in part
    ? (part.input as Record<string, unknown>)
    : null;

  const output =
    state.hasOutput && "output" in part
      ? (part.output as Record<string, unknown>)
      : null;

  const hasContent = Boolean(
    (state.needsApproval && input) || (state.hasOutput && output),
  );

  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    if (state.needsApproval) setIsExpanded(true);
  }, [part.toolCallId, state.needsApproval]);

  const summary = state.needsApproval
    ? `${meta.label} \u2014 awaiting approval`
    : state.isRunning
      ? `${meta.gerund}\u2026`
      : state.hasOutput
        ? meta.pastTense
        : state.isError
          ? `Failed to ${meta.label.toLowerCase()}`
          : `${meta.gerund}\u2026`;

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
      provider="Linear"
      providerIcon={
        <IntegrationProviderIcon provider="linear" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      isExpandable={hasContent}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {state.needsApproval && input ? (
        <div className="space-y-1 text-xs text-foreground/70">
          {input.title ? (
            <p className="font-medium text-foreground">{String(input.title)}</p>
          ) : null}
          {input.issueId ? (
            <p className="text-[11px] text-foreground/50">
              Issue: {String(input.issueId)}
            </p>
          ) : null}
          {input.description ? (
            <p className="line-clamp-3 text-[11px] text-foreground/50">
              {String(input.description).slice(0, 200)}
            </p>
          ) : null}
        </div>
      ) : state.hasOutput && output ? (
        <div className="space-y-1 text-xs text-foreground/70">
          <div className="flex items-center gap-1.5">
            <Icon icon={meta.icon} className={`h-4 w-4 ${meta.iconClass}`} />
            <span className="font-medium text-foreground">{meta.pastTense}</span>
          </div>
          {output.identifier ? (
            <p>{String(output.identifier)} {output.title ? String(output.title) : ""}</p>
          ) : null}
          {output.url ? (
            <a
              href={String(output.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Icon icon="solar:link-round-linear" className="h-3 w-3" />
              View in Linear
            </a>
          ) : null}
          {output.success !== undefined ? (
            <p className="text-[11px] text-foreground/50">
              {output.success ? "Successfully deleted" : "Failed to delete"}
            </p>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
