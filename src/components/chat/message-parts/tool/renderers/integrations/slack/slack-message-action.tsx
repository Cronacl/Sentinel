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

type MessageOutput = {
  ts: string;
  text: string;
  userId: string;
  username: string;
  channelId: string;
  channelName: string;
  threadTs: string | null;
  replyCount: number;
  timestamp: string;
  permalink: string | null;
};

type SuccessOutput = { success: boolean };
type ScheduleOutput = { scheduledMessageId: string; postAt: number };

const ACTION_LABELS: Record<string, string> = {
  slack_post_message: "Post Message",
  slack_reply_to_thread: "Reply in Thread",
  slack_update_message: "Update Message",
  slack_delete_message: "Delete Message",
  slack_add_reaction: "Add Reaction",
  slack_schedule_message: "Schedule Message",
  slack_pin_message: "Pin Message",
  slack_unpin_message: "Unpin Message",
};

export const SlackMessageActionTool = memo(function SlackMessageActionTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const actionLabel = ACTION_LABELS[toolName] ?? "Message Action";
  const input =
    state.hasInput && "input" in part
      ? (part.input as Record<string, unknown>)
      : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as MessageOutput | SuccessOutput | ScheduleOutput)
      : null;

  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    if (state.needsApproval) setIsExpanded(true);
  }, [state.needsApproval]);

  const summary = state.needsApproval
    ? `${actionLabel} \u2014 awaiting approval`
    : state.isRunning
      ? `${actionLabel}\u2026`
      : state.isError
        ? `${actionLabel} \u2014 failed`
        : state.isDenied
          ? `${actionLabel} \u2014 denied`
          : output && "text" in output
            ? `${actionLabel} \u2014 done`
            : output && "scheduledMessageId" in output
              ? `Message scheduled`
              : `${actionLabel} \u2014 done`;

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
      provider="Slack"
      providerIcon={
        <IntegrationProviderIcon provider="slack" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      errorText={state.isError ? state.errorText : undefined}
      isExpandable={Boolean(
        (state.needsApproval && input) ||
        (state.hasOutput &&
          output &&
          ("text" in output || "scheduledMessageId" in output)),
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
              {Object.entries(input).map(([key, val]) => (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 text-foreground/40 min-w-[72px]">
                    {key}
                  </span>
                  <span className="text-foreground/70 break-all">
                    {String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {!state.needsApproval && output && "text" in output ? (
          <div className="rounded-lg p-2">
            <p className="text-[12.5px] text-foreground line-clamp-3">
              {output.text}
            </p>
            {output.timestamp ? (
              <p className="mt-1 text-[10.5px] text-foreground/40">
                {new Date(output.timestamp).toLocaleString()}
              </p>
            ) : null}
          </div>
        ) : null}
        {!state.needsApproval && output && "scheduledMessageId" in output ? (
          <div className="rounded-lg p-2">
            <div className="flex items-center gap-2 text-xs text-foreground/70">
              <Icon icon="solar:clock-circle-linear" className="h-4 w-4" />
              <span>
                Scheduled for {new Date(output.postAt * 1000).toLocaleString()}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </IntegrationToolLayout>
  );
});
