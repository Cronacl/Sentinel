"use client";

import { Button } from "@heroui/react";
import { memo } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import {
  IntegrationToolLayout,
  useToolExpansionState,
} from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";

type ChannelOutput = {
  id: string;
  name: string;
  topic: string;
  purpose: string;
  isPrivate: boolean;
  isArchived: boolean;
  memberCount: number;
  createdAt: string;
};

type SuccessOutput = { success: boolean };
type TopicOutput = { topic: string };
type PurposeOutput = { purpose: string };

const ACTION_LABELS: Record<string, string> = {
  slack_create_channel: "Create Channel",
  slack_archive_channel: "Archive Channel",
  slack_invite_to_channel: "Invite to Channel",
  slack_kick_from_channel: "Remove from Channel",
  slack_set_topic: "Set Topic",
  slack_set_purpose: "Set Purpose",
};

export const SlackChannelActionTool = memo(function SlackChannelActionTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const actionLabel = ACTION_LABELS[toolName] ?? "Channel Action";
  const input =
    state.hasInput && "input" in part
      ? (part.input as Record<string, unknown>)
      : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as
          | ChannelOutput
          | SuccessOutput
          | TopicOutput
          | PurposeOutput)
      : null;

  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: state.needsApproval,
    autoExpand: state.needsApproval,
  });

  const channelOutput =
    output && "name" in output ? (output as ChannelOutput) : null;

  const summary = state.needsApproval
    ? `${actionLabel} \u2014 awaiting approval`
    : state.isRunning
      ? `${actionLabel}\u2026`
      : state.isError
        ? `${actionLabel} \u2014 failed`
        : state.isDenied
          ? `${actionLabel} \u2014 denied`
          : channelOutput
            ? `Created #${channelOutput.name}`
            : output && "topic" in output
              ? "Topic updated"
              : output && "purpose" in output
                ? "Purpose updated"
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
        (state.needsApproval && input) || (state.hasOutput && channelOutput),
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
        {!state.needsApproval && channelOutput ? (
          <div className="rounded-lg p-2">
            <div className="flex items-center gap-2">
              <Icon
                icon={
                  channelOutput.isPrivate
                    ? "solar:lock-linear"
                    : "solar:hashtag-linear"
                }
                className="h-4 w-4 text-foreground/50"
              />
              <p className="text-[12.5px] font-medium text-foreground">
                {channelOutput.name}
              </p>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-foreground/45">
              <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
                <Icon
                  icon="solar:users-group-rounded-linear"
                  className="h-3 w-3"
                />
                {channelOutput.memberCount}
              </span>
              {channelOutput.isPrivate ? (
                <span className="inline-flex items-center rounded bg-foreground/4 px-1.5 py-0.5">
                  Private
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </IntegrationToolLayout>
  );
});
