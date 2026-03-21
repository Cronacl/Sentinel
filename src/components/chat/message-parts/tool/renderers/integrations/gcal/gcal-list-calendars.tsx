"use client";

import { memo, useState } from "react";

import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type CalendarEntry = {
  id: string;
  summary: string;
  description: string;
  timeZone: string;
  primary: boolean;
  backgroundColor: string;
};

type ListCalendarsOutput = {
  calendars: CalendarEntry[];
};

export const GCalListCalendarsTool = memo(function GCalListCalendarsTool({
  part,
}: RendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as ListCalendarsOutput) : null;

  const summary = isRunning
    ? "Loading calendars…"
    : hasOutput && output
      ? `${output.calendars.length} calendar${output.calendars.length !== 1 ? "s" : ""} found`
      : isError
        ? "Failed to load calendars"
        : "Loading calendars…";

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
      isExpandable={Boolean(output?.calendars?.length)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {output?.calendars?.length ? (
        <div className="-mx-1 space-y-0.5">
          {output.calendars.map((cal) => (
            <div
              key={cal.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background"
                style={{ backgroundColor: cal.backgroundColor || "#4285f4" }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs text-foreground">
                    {cal.summary}
                  </span>
                  {cal.primary ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary">
                      Primary
                    </span>
                  ) : null}
                </div>
                {cal.description ? (
                  <p className="truncate text-[10px] text-foreground/35">
                    {cal.description}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-[10px] text-foreground/25">
                {cal.timeZone}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
