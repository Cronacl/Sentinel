"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type MoveInput = {
  calendarId: string;
  eventId: string;
  destinationCalendarId: string;
};

type MoveOutput = {
  id: string;
  summary: string;
  htmlLink: string;
  status: string;
};

export const GCalMoveEventTool = memo(function GCalMoveEventTool({
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

  const input = "input" in part ? (part.input as MoveInput) : null;
  const output =
    state.hasOutput && "output" in part ? (part.output as MoveOutput) : null;

  const summary = state.needsApproval
    ? "Move event — awaiting approval"
    : state.isRunning
      ? "Moving event…"
      : state.hasOutput && output
        ? `Event moved: "${output.summary}"`
        : state.isError
          ? "Failed to move event"
          : "Moving event…";

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
      isExpandable={Boolean(input)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        output?.htmlLink ? (
          <a
            className="inline-flex items-center gap-1 text-primary hover:underline"
            href={output.htmlLink}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon
              icon="solar:square-arrow-right-up-linear"
              className="h-3 w-3"
            />
            Open in Google Calendar
          </a>
        ) : undefined
      }
    >
      {input ? (
        <div className="flex items-center gap-2 text-xs">
          <div className="flex min-w-0 items-center gap-2 rounded-md bg-foreground/5 px-2.5 py-1.5">
            <Icon
              icon="solar:calendar-linear"
              className="h-3.5 w-3.5 shrink-0 text-foreground/40"
            />
            <span className="truncate text-foreground/70">
              {input.calendarId}
            </span>
          </div>
          <Icon
            icon="solar:arrow-right-linear"
            className="h-3.5 w-3.5 shrink-0 text-foreground/30"
          />
          <div className="flex min-w-0 items-center gap-2 rounded-md bg-primary/5 px-2.5 py-1.5">
            <Icon
              icon="solar:calendar-linear"
              className="h-3.5 w-3.5 shrink-0 text-primary/60"
            />
            <span className="truncate text-primary">
              {input.destinationCalendarId}
            </span>
          </div>
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
