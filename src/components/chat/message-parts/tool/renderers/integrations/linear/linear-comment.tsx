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

type CommentOutput = {
  id: string;
  body: string;
  url: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
};

type CommentListOutput = { comments: CommentOutput[] };

export const LinearCommentTool = memo(function LinearCommentTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "linear_list_comments";
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const output =
    state.hasOutput && "output" in part
      ? (part.output as CommentOutput | CommentListOutput)
      : null;

  const input = "input" in part
    ? (part.input as Record<string, unknown>)
    : null;

  const comments: CommentOutput[] = output
    ? "comments" in output
      ? output.comments
      : [output as CommentOutput]
    : [];

  const hasContent = Boolean(
    (state.needsApproval && input) || comments.length > 0,
  );

  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    if (state.needsApproval) setIsExpanded(true);
  }, [part.toolCallId, state.needsApproval]);

  const summary = state.isRunning
    ? isList
      ? "Fetching comments\u2026"
      : "Adding comment\u2026"
    : state.isError
      ? "Failed"
      : state.needsApproval
        ? "Add comment \u2014 awaiting approval"
        : isList
          ? `Listed ${comments.length} comment${comments.length !== 1 ? "s" : ""}`
          : comments.length > 0
            ? "Comment added"
            : "Comment";

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
          {input.body ? (
            <p className="line-clamp-4 text-[11px] text-foreground/50">
              {String(input.body).slice(0, 300)}
            </p>
          ) : null}
        </div>
      ) : comments.length > 0 ? (
        <div className="space-y-1 p-1">
          {comments.map((c) => (
            <a
              key={c.id}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 rounded-lg p-2 transition-colors hover:bg-foreground/5"
            >
              <Icon
                icon="solar:chat-round-line-linear"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-foreground">
                  {c.userName}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-foreground/50">
                  {c.body.slice(0, 200)}
                </p>
                <p className="mt-0.5 text-[10px] text-foreground/30">
                  {new Date(c.createdAt).toLocaleDateString()}
                </p>
              </div>
            </a>
          ))}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
