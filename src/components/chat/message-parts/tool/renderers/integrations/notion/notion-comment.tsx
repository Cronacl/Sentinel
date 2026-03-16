"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";

type CommentOutput = {
  id: string;
  richText: string;
  createdTime: string;
  createdBy: string;
};

type ListOutput = { comments: CommentOutput[] };

export const NotionCommentTool = memo(function NotionCommentTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const isCreate = toolName === "notion_create_comment";

  const input = state.hasInput && "input" in part ? (part.input as Record<string, unknown>) : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as CommentOutput | ListOutput)
      : null;

  const comments: CommentOutput[] = output
    ? "comments" in output
      ? output.comments
      : [output as CommentOutput]
    : [];

  const [isExpanded, setIsExpanded] = useState(
    isCreate ? state.needsApproval : false,
  );

  useEffect(() => {
    if (isCreate && state.needsApproval) setIsExpanded(true);
  }, [isCreate, state.needsApproval]);

  const summary = state.needsApproval
    ? "Notion: Create Comment \u2014 awaiting approval"
    : state.isRunning
      ? isCreate
        ? "Creating comment\u2026"
        : "Fetching comments\u2026"
      : state.isError
        ? "Failed"
        : state.isDenied
          ? "Create Comment \u2014 denied"
          : isCreate && comments.length > 0
            ? "Comment created"
            : `${comments.length} comment${comments.length !== 1 ? "s" : ""}`;

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
      provider="Notion"
      providerIcon={
        <IntegrationProviderIcon provider="notion" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      errorText={state.isError ? state.errorText : undefined}
      isExpandable={Boolean(
        comments.length > 0 || (state.needsApproval && input),
      )}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-3">
        {state.needsApproval && input ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-foreground/50">
              <Icon icon="solar:arrow-right-linear" className="h-3 w-3" />
              <span>Input</span>
            </div>
            <div className="space-y-1.5">
              {input.richText ? (
                <div className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 text-foreground/40 min-w-[72px]">
                    Comment
                  </span>
                  <span className="text-foreground/70 break-all">
                    {String(input.richText)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {comments.length > 0 ? (
          <div className="space-y-1 p-1">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg p-2"
              >
                <p className="text-[12px] text-foreground/70">
                  {comment.richText}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-foreground/40">
                  <Icon
                    icon="solar:chat-round-dots-linear"
                    className="h-3 w-3"
                  />
                  {comment.createdTime ? (
                    <span>
                      {new Date(comment.createdTime).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </IntegrationToolLayout>
  );
});
