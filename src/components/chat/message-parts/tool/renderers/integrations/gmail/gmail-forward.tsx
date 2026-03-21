"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type ForwardInput = {
  messageId: string;
  to: string;
  additionalBody?: string;
};

type ForwardOutput = {
  messageId: string;
  threadId: string;
  status: string;
};

export const GmailForwardTool = memo(function GmailForwardTool({
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
    setIsExpanded(state.needsApproval);
  }, [part.toolCallId, state.needsApproval]);

  const input = "input" in part ? (part.input as ForwardInput) : null;
  const output =
    state.hasOutput && "output" in part ? (part.output as ForwardOutput) : null;

  const summary = state.needsApproval
    ? `Forward to ${input?.to ?? ""} — awaiting approval`
    : state.isRunning
      ? "Forwarding email…"
      : state.hasOutput && output
        ? `Email forwarded to ${input?.to ?? ""}`
        : state.isError
          ? "Failed to forward email"
          : "Forwarding email…";

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
            Forwarded
          </span>
        ) : undefined
      }
    >
      {input ? (
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Icon
              icon="solar:forward-linear"
              className="h-3.5 w-3.5 shrink-0 text-foreground/40"
            />
            <span className="text-foreground">{input.to}</span>
          </div>
          {input.additionalBody ? (
            <div className="border-t border-border/30 pt-2">
              <div
                className="max-h-32 overflow-y-auto text-[11px] text-foreground/70"
                dangerouslySetInnerHTML={{ __html: input.additionalBody }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
