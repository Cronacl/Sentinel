"use client";

import { Button } from "@heroui/react";
import { memo } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import {
  IntegrationToolLayout,
  useToolExpansionState,
} from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type DeleteInput = {
  calendarId: string;
  eventId: string;
};

type DeleteOutput = {
  status: string;
};

export const GCalDeleteEventTool = memo(function GCalDeleteEventTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: state.needsApproval,
    autoExpand: state.needsApproval,
  });

  const input = "input" in part ? (part.input as DeleteInput) : null;
  const output =
    state.hasOutput && "output" in part ? (part.output as DeleteOutput) : null;

  const summary = state.needsApproval
    ? "Delete event — awaiting approval"
    : state.isRunning
      ? "Deleting event…"
      : state.hasOutput && output
        ? "Event deleted"
        : state.isError
          ? "Failed to delete event"
          : "Deleting event…";

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
        output ? (
          <span className="flex items-center gap-1">
            <Icon
              icon="solar:trash-bin-2-linear"
              className="h-3 w-3 text-danger"
            />
            Event deleted
          </span>
        ) : undefined
      }
    >
      {state.needsApproval && input ? (
        <div className="flex items-center gap-2 text-xs text-foreground/70">
          <Icon
            icon="solar:trash-bin-2-linear"
            className="h-4 w-4 text-danger"
          />
          <span>
            Delete event{" "}
            <code className="rounded bg-foreground/5 px-1 py-0.5 text-[10px]">
              {input.eventId}
            </code>{" "}
            from calendar{" "}
            <code className="rounded bg-foreground/5 px-1 py-0.5 text-[10px]">
              {input.calendarId}
            </code>
          </span>
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
