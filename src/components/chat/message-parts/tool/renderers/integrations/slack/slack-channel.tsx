"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
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

type ListOutput = { channels: ChannelOutput[]; totalCount: number };

export const SlackChannelTool = memo(function SlackChannelTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "slack_list_channels";

  const output =
    state.hasOutput && "output" in part
      ? (part.output as ChannelOutput | ListOutput)
      : null;

  const channels: ChannelOutput[] = output
    ? "channels" in output
      ? output.channels
      : [output as ChannelOutput]
    : [];

  const totalCount =
    output && "totalCount" in output ? output.totalCount : channels.length;

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? isList
      ? "Listing channels\u2026"
      : "Fetching channel\u2026"
    : state.isError
      ? "Failed to fetch"
      : isList
        ? `${totalCount} channel${totalCount !== 1 ? "s" : ""}`
        : channels.length > 0
          ? `#${channels[0]!.name}`
          : "Channel details";

  return (
    <IntegrationToolLayout
      provider="Slack"
      providerIcon={
        <IntegrationProviderIcon provider="slack" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      errorText={state.isError ? state.errorText : undefined}
      isExpandable={channels.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-0.5 p-1">
        {channels.map((ch) => (
          <div
            key={ch.id}
            className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-foreground/50">
              <Icon
                icon={ch.isPrivate ? "solar:lock-linear" : "solar:hashtag-linear"}
                className="h-4 w-4"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium leading-snug text-foreground">
                {ch.name}
              </p>
              {ch.topic || ch.purpose ? (
                <p className="mt-0.5 text-[11px] leading-snug text-foreground/50 line-clamp-1">
                  {ch.topic || ch.purpose}
                </p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-foreground/45">
                <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
                  <Icon icon="solar:users-group-rounded-linear" className="h-3 w-3" />
                  {ch.memberCount}
                </span>
                {ch.isPrivate ? (
                  <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
                    Private
                  </span>
                ) : null}
                {ch.isArchived ? (
                  <span className="inline-flex items-center rounded bg-warning/10 px-1.5 py-0.5 text-warning">
                    Archived
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
