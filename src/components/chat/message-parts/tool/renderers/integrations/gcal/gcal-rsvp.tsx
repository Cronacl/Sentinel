"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type RsvpInput = {
  calendarId: string;
  eventId: string;
  status: string;
};

type RsvpOutput = {
  id: string;
  summary: string;
  responseStatus: string;
  status: string;
};

const RSVP_CONFIG: Record<
  string,
  { label: string; icon: string; className: string }
> = {
  accepted: {
    label: "Accepted",
    icon: "solar:check-circle-linear",
    className: "text-success",
  },
  declined: {
    label: "Declined",
    icon: "solar:close-circle-linear",
    className: "text-danger",
  },
  tentative: {
    label: "Tentative",
    icon: "solar:question-circle-linear",
    className: "text-warning",
  },
};

export const GCalRsvpTool = memo(function GCalRsvpTool({
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

  const input = "input" in part ? (part.input as RsvpInput) : null;
  const output =
    state.hasOutput && "output" in part ? (part.output as RsvpOutput) : null;

  const rsvpStatus = input?.status ?? output?.responseStatus ?? "";
  const cfg = RSVP_CONFIG[rsvpStatus] ?? {
    label: rsvpStatus,
    icon: "solar:question-circle-linear",
    className: "text-foreground/50",
  };

  const summary = state.needsApproval
    ? `RSVP ${cfg.label} — awaiting approval`
    : state.isRunning
      ? "Sending response…"
      : state.hasOutput && output
        ? `${cfg.label}: "${output.summary}"`
        : state.isError
          ? "Failed to respond"
          : "Sending response…";

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
      provider="Google Calendar"
      providerIcon={
        <IntegrationProviderIcon
          provider="google_calendar"
          className="h-4 w-4"
        />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      isExpandable={Boolean(input || output)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        output ? (
          <span className="flex items-center gap-1">
            <Icon icon={cfg.icon} className={`h-3 w-3 ${cfg.className}`} />
            {cfg.label}
          </span>
        ) : undefined
      }
    >
      {input || output ? (
        <div className="flex items-center gap-3 text-xs">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">
              {output?.summary ?? `Event ${input?.eventId ?? ""}`}
            </p>
            <p className="text-[11px] text-foreground/50">{cfg.label}</p>
          </div>
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
