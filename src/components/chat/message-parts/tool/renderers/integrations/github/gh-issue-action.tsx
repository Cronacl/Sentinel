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
  gh_create_issue: {
    label: "Create issue",
    pastTense: "Issue created",
    gerund: "Creating issue",
    icon: "solar:add-circle-linear",
    iconClass: "text-success",
  },
  gh_update_issue: {
    label: "Update issue",
    pastTense: "Issue updated",
    gerund: "Updating issue",
    icon: "solar:pen-new-round-linear",
    iconClass: "text-primary",
  },
  gh_close_issue: {
    label: "Close issue",
    pastTense: "Issue closed",
    gerund: "Closing issue",
    icon: "solar:close-circle-linear",
    iconClass: "text-danger",
  },
  gh_add_issue_comment: {
    label: "Add comment",
    pastTense: "Comment added",
    gerund: "Adding comment",
    icon: "solar:chat-round-line-linear",
    iconClass: "text-primary",
  },
};

export const GHIssueActionTool = memo(function GHIssueActionTool({
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
      provider="GitHub"
      providerIcon={
        <IntegrationProviderIcon provider="github" className="h-4 w-4" />
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
          {input.owner && input.repo ? (
            <p>
              {String(input.owner)}/{String(input.repo)}
              {input.issueNumber ? ` #${input.issueNumber}` : ""}
            </p>
          ) : null}
          {input.body ? (
            <p className="line-clamp-3 text-[11px] text-foreground/50">
              {String(input.body).slice(0, 200)}
            </p>
          ) : null}
        </div>
      ) : state.hasOutput && output ? (
        <div className="space-y-1 text-xs text-foreground/70">
          <div className="flex items-center gap-1.5">
            <Icon icon={meta.icon} className={`h-4 w-4 ${meta.iconClass}`} />
            <span className="font-medium text-foreground">{meta.pastTense}</span>
          </div>
          {output.title ? (
            <p>{String(output.title)}</p>
          ) : null}
          {output.number ? (
            <p className="text-[11px] text-foreground/50">
              Issue #{String(output.number)}
              {output.htmlUrl ? (
                <>
                  {" \u2014 "}
                  <a
                    href={String(output.htmlUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    View on GitHub
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
          {output.body ? (
            <p className="text-[11px] text-foreground/50">
              {String(output.body)}
            </p>
          ) : null}
          {output.htmlUrl && !output.number ? (
            <a
              href={String(output.htmlUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Icon icon="solar:link-round-linear" className="h-3 w-3" />
              View on GitHub
            </a>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
