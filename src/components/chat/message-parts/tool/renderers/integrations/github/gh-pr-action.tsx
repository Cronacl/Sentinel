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
  gh_create_pr: {
    label: "Create PR",
    pastTense: "PR created",
    gerund: "Creating PR",
    icon: "solar:git-pull-request-linear",
    iconClass: "text-success",
  },
  gh_merge_pr: {
    label: "Merge PR",
    pastTense: "PR merged",
    gerund: "Merging PR",
    icon: "solar:merge-linear",
    iconClass: "text-primary",
  },
  gh_review_pr: {
    label: "Review PR",
    pastTense: "Review submitted",
    gerund: "Submitting review",
    icon: "solar:check-read-linear",
    iconClass: "text-primary",
  },
  gh_add_pr_comment: {
    label: "Add comment",
    pastTense: "Comment added",
    gerund: "Adding comment",
    icon: "solar:chat-round-line-linear",
    iconClass: "text-primary",
  },
};

export const GHPRActionTool = memo(function GHPRActionTool({
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
              {input.prNumber ? ` #${input.prNumber}` : ""}
            </p>
          ) : null}
          {input.head && input.base ? (
            <p className="text-[11px] text-foreground/50">
              {String(input.head)} &rarr; {String(input.base)}
            </p>
          ) : null}
          {input.event ? (
            <p className="text-[11px] text-foreground/50">
              Action: {String(input.event)}
            </p>
          ) : null}
          {input.mergeMethod ? (
            <p className="text-[11px] text-foreground/50">
              Method: {String(input.mergeMethod)}
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
              PR #{String(output.number)}
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
          {output.merged !== undefined ? (
            <p className="text-[11px] text-foreground/50">
              {output.merged ? "Merged" : output.message ? String(output.message) : ""}
            </p>
          ) : null}
          {output.sha ? (
            <p className="text-[11px] text-foreground/40">
              SHA: {String(output.sha).slice(0, 7)}
            </p>
          ) : null}
          {output.state ? (
            <p className="text-[11px] text-foreground/50">
              Review: {String(output.state)}
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
