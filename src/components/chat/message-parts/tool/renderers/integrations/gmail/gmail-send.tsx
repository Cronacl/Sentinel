"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type SendInput = {
  to?: string;
  subject?: string;
  body: string;
  cc?: string;
  bcc?: string;
  messageId?: string;
};

type SendOutput = {
  messageId?: string;
  threadId?: string;
  draftId?: string;
  status: string;
};

export const GmailSendTool = memo(function GmailSendTool({
  part,
}: RendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";
  const needsApproval = part.state === "approval-requested";

  const input = "input" in part ? (part.input as SendInput) : null;
  const output =
    hasOutput && "output" in part ? (part.output as SendOutput) : null;

  const toolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const isDraft = toolName === "gmail_create_draft";
  const isReply = toolName === "gmail_reply";
  const action = isDraft ? "Draft" : isReply ? "Reply" : "Send";

  const summaryLabel = isReply
    ? "Reply sent"
    : isDraft
      ? "Draft created"
      : `Email sent: "${input?.subject ?? ""}"`;

  const summary = needsApproval
    ? isReply
      ? "Reply — awaiting approval"
      : `${action}: "${input?.subject ?? ""}" — awaiting approval`
    : isRunning
      ? isReply
        ? "Sending reply…"
        : `${action}ing email…`
      : hasOutput && output
        ? summaryLabel
        : isError
          ? `Failed to ${action.toLowerCase()} email`
          : isReply
            ? "Sending reply…"
            : `${action}ing email…`;

  return (
    <IntegrationToolLayout
      provider="Gmail"
      providerIcon={
        <IntegrationProviderIcon provider="gmail" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={Boolean(input?.body)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        output ? (
          <span className="flex items-center gap-1">
            {output.status === "sent" ? (
              <>
                <Icon
                  icon="solar:check-circle-linear"
                  className="h-3 w-3 text-success"
                />
                Sent
              </>
            ) : output.status === "drafted" ? (
              <>
                <Icon
                  icon="solar:document-linear"
                  className="h-3 w-3 text-warning"
                />
                Draft saved
              </>
            ) : null}
          </span>
        ) : undefined
      }
    >
      {input ? (
        <div className="space-y-2 text-xs">
          {input.to ? (
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:users-group-rounded-linear"
                className="h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <span className="text-foreground">{input.to}</span>
            </div>
          ) : null}
          {input.cc ? (
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:copy-linear"
                className="h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <span className="text-foreground">{input.cc}</span>
            </div>
          ) : null}
          {input.subject ? (
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:text-bold-linear"
                className="h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <span className="font-medium text-foreground">
                {input.subject}
              </span>
            </div>
          ) : null}
          {input.body ? (
            <div className="border-t border-border/30 pt-2">
              <div
                className="max-h-40 overflow-y-auto text-[11px] text-foreground/70"
                dangerouslySetInnerHTML={{ __html: input.body }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
