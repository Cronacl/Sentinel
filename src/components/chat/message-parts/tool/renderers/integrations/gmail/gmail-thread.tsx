"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type ThreadMessage = {
  id: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
};

type ThreadOutput = {
  threadId: string;
  messageCount: number;
  messages: ThreadMessage[];
};

function extractName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return (match[1] ?? "").trim();
  return from.split("@")[0] ?? from;
}

function formatRelativeDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export const GmailThreadTool = memo(function GmailThreadTool({
  part,
}: RendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as ThreadOutput) : null;

  const summary = isRunning
    ? "Loading thread…"
    : hasOutput && output
      ? `Thread: ${output.messageCount} message${output.messageCount !== 1 ? "s" : ""}`
      : isError
        ? "Failed to load thread"
        : "Loading thread…";

  return (
    <IntegrationToolLayout
      provider="Gmail"
      providerIcon={
        <IntegrationProviderIcon provider="gmail" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={Boolean(output?.messages?.length)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        output
          ? `${output.messageCount} message${output.messageCount !== 1 ? "s" : ""}`
          : undefined
      }
    >
      {output?.messages?.length ? (
        <div className="space-y-1">
          {output.messages.map((msg, i) => (
            <div
              key={msg.id}
              className="flex items-start gap-2.5 rounded-lg border border-border/30 px-3 py-2"
            >
              <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                {extractName(msg.from).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-foreground">
                    {extractName(msg.from)}
                  </span>
                  {msg.isUnread ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  ) : null}
                  <span className="ml-auto shrink-0 text-[10px] text-foreground/30">
                    {formatRelativeDate(msg.date)}
                  </span>
                </div>
                {i === 0 ? (
                  <p className="truncate text-[11px] text-foreground/60">
                    {msg.subject}
                  </p>
                ) : null}
                <p className="truncate text-[10px] text-foreground/40">
                  {msg.snippet}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
