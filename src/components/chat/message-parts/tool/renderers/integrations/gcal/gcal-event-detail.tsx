"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type EventDetail = {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  isAllDay: boolean;
  htmlLink: string;
  hangoutLink: string;
  attendees: Array<{
    email: string;
    displayName: string;
    responseStatus: string;
  }>;
  organizer: { email: string; displayName: string };
};

const STATUS_CONFIG: Record<string, { icon: string; className: string }> = {
  accepted: {
    icon: "solar:check-circle-linear",
    className: "text-success",
  },
  declined: {
    icon: "solar:close-circle-linear",
    className: "text-danger",
  },
  tentative: {
    icon: "solar:question-circle-linear",
    className: "text-warning",
  },
  needsAction: {
    icon: "solar:clock-circle-linear",
    className: "text-foreground/40",
  },
};

export const GCalEventDetailTool = memo(function GCalEventDetailTool({
  part,
}: RendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as EventDetail) : null;

  const summary = isRunning
    ? "Loading event details…"
    : hasOutput && output
      ? `Event: ${output.summary || "(no title)"}`
      : isError
        ? "Failed to load event"
        : "Loading event details…";

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
      isExpandable={Boolean(output)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {output ? (
        <div className="space-y-3 text-xs">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:clock-circle-linear"
                className="h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <span className="text-foreground">
                {output.isAllDay
                  ? "All day"
                  : `${output.start} – ${output.end}`}
              </span>
            </div>
            {output.location ? (
              <div className="flex items-center gap-2">
                <Icon
                  icon="solar:map-point-linear"
                  className="h-3.5 w-3.5 shrink-0 text-foreground/40"
                />
                <span className="text-foreground">{output.location}</span>
              </div>
            ) : null}
            {output.hangoutLink ? (
              <div className="flex items-center gap-2">
                <Icon
                  icon="solar:videocamera-linear"
                  className="h-3.5 w-3.5 shrink-0 text-foreground/40"
                />
                <a
                  className="truncate text-primary hover:underline"
                  href={output.hangoutLink}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Join video call
                </a>
              </div>
            ) : null}
          </div>

          {output.description ? (
            <div className="border-t border-border/30 pt-2">
              <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] text-foreground/70">
                {output.description}
              </p>
            </div>
          ) : null}

          {output.attendees?.length ? (
            <div className="space-y-1.5 border-t border-border/30 pt-2">
              <div className="flex items-center gap-1 text-[10px] font-medium text-foreground/50">
                <Icon
                  icon="solar:users-group-rounded-linear"
                  className="h-3 w-3"
                />
                <span>Attendees ({output.attendees.length})</span>
              </div>
              <div className="space-y-1">
                {output.attendees.map((att, i) => {
                  const cfg = STATUS_CONFIG[att.responseStatus] ?? {
                    icon: "solar:minus-circle-linear",
                    className: "text-foreground/30",
                  };
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-[11px] text-foreground/60"
                    >
                      <Icon
                        icon={cfg.icon}
                        className={`h-3 w-3 shrink-0 ${cfg.className}`}
                      />
                      <span>{att.displayName || att.email}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {output.htmlLink ? (
            <div className="border-t border-border/30 pt-2">
              <a
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
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
            </div>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
