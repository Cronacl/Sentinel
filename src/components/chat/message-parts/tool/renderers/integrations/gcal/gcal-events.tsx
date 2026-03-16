"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type EventEntry = {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string;
  attendeeCount: number;
  htmlLink?: string;
  calendarId?: string;
};

function formatTimeRange(start: string, end: string, isAllDay: boolean) {
  if (isAllDay) return "All day";
  try {
    const s = new Date(start);
    const e = new Date(end);
    const timeFormat: Intl.DateTimeFormatOptions = {
      hour: "numeric",
      minute: "2-digit",
    };
    return `${s.toLocaleTimeString(undefined, timeFormat)} – ${e.toLocaleTimeString(undefined, timeFormat)}`;
  } catch {
    return `${start} – ${end}`;
  }
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export const GCalEventsTool = memo(function GCalEventsTool({
  part,
}: RendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part
      ? (part.output as { events: EventEntry[]; totalResults: number })
      : null;

  const summary = isRunning
    ? "Loading calendar events…"
    : hasOutput && output
      ? `${output.totalResults} event${output.totalResults !== 1 ? "s" : ""} found`
      : isError
        ? "Failed to load events"
        : "Loading calendar events…";

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
      isExpandable={Boolean(output?.events?.length)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        output
          ? `${output.totalResults} event${output.totalResults !== 1 ? "s" : ""}`
          : undefined
      }
    >
      {output?.events?.length ? (
        <div className="space-y-1.5">
          {output.events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-2.5 rounded-lg border border-border/30 px-3 py-2"
            >
              <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {event.summary || "(no title)"}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-foreground/50">
                  <Icon
                    icon="solar:clock-circle-linear"
                    className="h-3 w-3 shrink-0"
                  />
                  <span>{formatDate(event.start)}</span>
                  <span className="text-foreground/20">·</span>
                  <span>
                    {formatTimeRange(event.start, event.end, event.isAllDay)}
                  </span>
                </div>
                {event.location ? (
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-foreground/40">
                    <Icon
                      icon="solar:map-point-linear"
                      className="h-3 w-3 shrink-0"
                    />
                    <span className="truncate">{event.location}</span>
                  </div>
                ) : null}
              </div>
              {event.attendeeCount > 0 ? (
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-foreground/40">
                  <Icon
                    icon="solar:users-group-rounded-linear"
                    className="h-3 w-3"
                  />
                  {event.attendeeCount}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
