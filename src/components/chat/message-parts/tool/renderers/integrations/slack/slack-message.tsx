"use client";

import { memo, useState } from "react";
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

type ListOutput = { messages: MessageOutput[]; totalCount: number };

const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  slack_search_messages: { running: "Searching messages\u2026", done: "message" },
  slack_get_history: { running: "Fetching history\u2026", done: "message" },
  slack_get_thread: { running: "Fetching thread\u2026", done: "reply" },
};

function formatTimestamp(ts: string): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export const SlackMessageTool = memo(function SlackMessageTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const labels = TOOL_LABELS[toolName] ?? {
    running: "Fetching\u2026",
    done: "message",
  };

  const output =
    state.hasOutput && "output" in part
      ? (part.output as ListOutput)
      : null;

  const messages = output?.messages ?? [];
  const totalCount = output?.totalCount ?? messages.length;

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? labels.running
    : state.isError
      ? "Failed to fetch"
      : `${totalCount} ${labels.done}${totalCount !== 1 ? "s" : ""}`;

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
      isExpandable={messages.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-0.5 p-1">
        {messages.map((msg) => {
          const content = msg.permalink ? (
            <a
              href={msg.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5"
            >
              <MessageContent msg={msg} />
            </a>
          ) : (
            <div className="flex items-start gap-2.5 rounded-lg px-2 py-2">
              <MessageContent msg={msg} />
            </div>
          );
          return <div key={msg.ts}>{content}</div>;
        })}
      </div>
    </IntegrationToolLayout>
  );
});

function MessageContent({ msg }: { msg: MessageOutput }) {
  return (
    <>
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-foreground/40">
        <Icon icon="solar:chat-round-dots-linear" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-foreground line-clamp-2">
          {msg.text}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-foreground/45">
          {msg.username || msg.userId ? (
            <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
              <Icon icon="solar:user-linear" className="h-3 w-3" />
              {msg.username || msg.userId}
            </span>
          ) : null}
          {msg.channelName ? (
            <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
              <Icon icon="solar:hashtag-linear" className="h-3 w-3" />
              {msg.channelName}
            </span>
          ) : null}
          {msg.timestamp ? (
            <span>{formatTimestamp(msg.timestamp)}</span>
          ) : null}
          {msg.replyCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
              {msg.replyCount} repl{msg.replyCount === 1 ? "y" : "ies"}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
