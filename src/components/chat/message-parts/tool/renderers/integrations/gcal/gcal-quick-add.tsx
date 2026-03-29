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

type QuickAddInput = {
  text: string;
  calendarId?: string;
};

type QuickAddOutput = {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink: string;
  status: string;
};

export const GCalQuickAddTool = memo(function GCalQuickAddTool({
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

  const input = "input" in part ? (part.input as QuickAddInput) : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as QuickAddOutput)
      : null;

  const summary = state.needsApproval
    ? `Quick add: "${input?.text ?? ""}" — awaiting approval`
    : state.isRunning
      ? "Creating event…"
      : state.hasOutput && output
        ? `Event created: "${output.summary}"`
        : state.isError
          ? "Failed to create event"
          : "Creating event…";

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
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <Icon
              icon="solar:magic-stick-3-linear"
              className="h-3.5 w-3.5 shrink-0 text-foreground/40"
            />
            <span className="text-foreground italic">
              &quot;{input.text}&quot;
            </span>
          </div>
          {output ? (
            <>
              <div className="flex items-center gap-2">
                <Icon
                  icon="solar:calendar-add-linear"
                  className="h-3.5 w-3.5 shrink-0 text-foreground/40"
                />
                <span className="font-medium text-foreground">
                  {output.summary}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Icon
                  icon="solar:clock-circle-linear"
                  className="h-3.5 w-3.5 shrink-0 text-foreground/40"
                />
                <span className="text-foreground">
                  {output.start} – {output.end}
                </span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
