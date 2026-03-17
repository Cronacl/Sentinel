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

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

type CommentOutput = {
  id: string;
  text: string;
  author: { id: string; email: string; name?: string };
  createdTime: string;
};

type ListOutput = { comments: CommentOutput[]; totalCount: number };

export const AirtableCommentTool = memo(function AirtableCommentTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "airtable_list_comments";
  const isCreate = toolName === "airtable_create_comment";

  const input =
    state.hasInput && "input" in part
      ? (part.input as Record<string, unknown>)
      : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as CommentOutput | ListOutput)
      : null;

  const comments: CommentOutput[] = output
    ? "comments" in output
      ? output.comments
      : [output as CommentOutput]
    : [];

  const totalCount =
    output && "totalCount" in output ? output.totalCount : comments.length;

  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    if (state.needsApproval) setIsExpanded(true);
  }, [state.needsApproval]);

  const summary = state.needsApproval
    ? "Add comment \u2014 awaiting approval"
    : state.isRunning
      ? isCreate
        ? "Adding comment\u2026"
        : "Listing comments\u2026"
      : state.isError
        ? "Failed"
        : state.isDenied
          ? "Comment \u2014 denied"
          : isList
            ? `${totalCount} comment${totalCount !== 1 ? "s" : ""}`
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
      provider="Airtable"
      providerIcon={
        <IntegrationProviderIcon provider="airtable" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      errorText={state.isError ? state.errorText : undefined}
      isExpandable={Boolean(
        (state.needsApproval && input) || comments.length > 0,
      )}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-2">
        {state.needsApproval && input ? (
          <div className="p-2">
            <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-foreground/50">
              <Icon icon="solar:arrow-right-linear" className="h-3 w-3" />
              <span>Input</span>
            </div>
            <div className="space-y-1.5">
              {Object.entries(input).map(([key, val]) => (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 text-foreground/40 min-w-[72px]">
                    {humanizeKey(key)}
                  </span>
                  <span className="text-foreground/70 break-all">
                    {String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {!state.needsApproval && comments.length > 0 ? (
          <div className="space-y-0.5 p-1">
            {comments.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-foreground/50">
                  <Icon icon="solar:chat-round-dots-linear" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] leading-snug text-foreground/80 line-clamp-3">
                    {c.text}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-foreground/45">
                    <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
                      <Icon icon="solar:user-linear" className="h-3 w-3" />
                      {c.author.name ?? c.author.email}
                    </span>
                    {c.createdTime ? (
                      <span>{new Date(c.createdTime).toLocaleDateString()}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </IntegrationToolLayout>
  );
});
