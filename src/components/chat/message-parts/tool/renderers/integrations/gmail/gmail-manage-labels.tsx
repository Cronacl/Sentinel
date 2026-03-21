"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { ToolPart } from "../../../../types";

type ManageLabelsInput = {
  messageIds: string[];
  addLabelIds?: string[];
  removeLabelIds?: string[];
};

type ManageLabelsOutput = {
  modifiedCount: number;
};

export const GmailManageLabelsTool = memo(function GmailManageLabelsTool({
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
    setIsExpanded(state.needsApproval || state.isRunning);
  }, [part.toolCallId, state.isRunning, state.needsApproval]);

  const input = "input" in part ? (part.input as ManageLabelsInput) : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as ManageLabelsOutput)
      : null;

  const msgCount = input?.messageIds?.length ?? 0;
  const addCount = input?.addLabelIds?.length ?? 0;
  const removeCount = input?.removeLabelIds?.length ?? 0;

  const summary = state.needsApproval
    ? `Manage Labels — awaiting approval`
    : state.isRunning
      ? "Updating labels…"
      : state.hasOutput && output
        ? `Labels updated — ${output.modifiedCount} message${output.modifiedCount !== 1 ? "s" : ""} modified`
        : state.isError
          ? "Failed to manage labels"
          : "Updating labels…";

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
      isExpandable={Boolean(input)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        output ? (
          <span className="flex items-center gap-1">
            <Icon
              icon="solar:check-circle-linear"
              className="h-3 w-3 text-success"
            />
            {output.modifiedCount} message
            {output.modifiedCount !== 1 ? "s" : ""} updated
          </span>
        ) : undefined
      }
    >
      {input ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-foreground/70">
            <Icon
              icon="solar:letter-linear"
              className="h-3.5 w-3.5 shrink-0 text-foreground/40"
            />
            <span>
              {msgCount} message{msgCount !== 1 ? "s" : ""}
            </span>
          </div>
          {addCount > 0 ? (
            <div className="flex items-start gap-2 text-xs">
              <Icon
                icon="solar:add-circle-linear"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
              />
              <div className="flex flex-wrap gap-1">
                {input.addLabelIds!.map((id) => (
                  <span
                    key={id}
                    className="rounded-md bg-success/10 px-1.5 py-0.5 text-[11px] text-success"
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {removeCount > 0 ? (
            <div className="flex items-start gap-2 text-xs">
              <Icon
                icon="solar:minus-circle-linear"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger"
              />
              <div className="flex flex-wrap gap-1">
                {input.removeLabelIds!.map((id) => (
                  <span
                    key={id}
                    className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[11px] text-danger"
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
