"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type CreateEventInput = {
  summary: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
  attendees?: string[];
};

type EventOutput = {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink: string;
  status: string;
};

export const GCalCreateEventTool = memo(function GCalCreateEventTool({
  part,
}: RendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";
  const needsApproval = part.state === "approval-requested";

  const toolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const isUpdate = toolName === "gcal_update_event";
  const action = isUpdate ? "Update" : "Create";

  const input = "input" in part ? (part.input as CreateEventInput) : null;
  const output =
    hasOutput && "output" in part ? (part.output as EventOutput) : null;

  const summary = needsApproval
    ? `${action} event: "${input?.summary ?? ""}" — awaiting approval`
    : isRunning
      ? `${action.replace(/e$/, "")}ing event…`
      : hasOutput && output
        ? `Event ${isUpdate ? "updated" : "created"}: "${output.summary}"`
        : isError
          ? `Failed to ${action.toLowerCase()} event`
          : `${action.replace(/e$/, "")}ing event…`;

  return (
    <IntegrationToolLayout
      provider="Google Calendar"
      providerIcon={
        <IntegrationProviderIcon
          provider="google_calendar"
          className="h-4 w-4"
        />
      }
      summary={summary}
      isRunning={isRunning}
      isError={isError}
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
              icon="solar:calendar-add-linear"
              className="h-3.5 w-3.5 shrink-0 text-foreground/40"
            />
            <span className="font-medium text-foreground">{input.summary}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icon
              icon="solar:clock-circle-linear"
              className="h-3.5 w-3.5 shrink-0 text-foreground/40"
            />
            <span className="text-foreground">
              {input.startDateTime} – {input.endDateTime}
            </span>
          </div>
          {input.location ? (
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:map-point-linear"
                className="h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <span className="text-foreground">{input.location}</span>
            </div>
          ) : null}
          {input.attendees?.length ? (
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:users-group-rounded-linear"
                className="h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <span className="text-foreground">
                {input.attendees.join(", ")}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
