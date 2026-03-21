"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type BusySlot = {
  start: string;
  end: string;
};

type CalendarBusy = {
  calendarId: string;
  busy: BusySlot[];
};

type FreeBusyOutput = {
  calendars: CalendarBusy[];
};

function formatTimeSlot(start: string, end: string) {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const dateOpts: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    const timeOpts: Intl.DateTimeFormatOptions = {
      hour: "numeric",
      minute: "2-digit",
    };
    const sameDay = s.toDateString() === e.toDateString();
    if (sameDay) {
      return `${s.toLocaleDateString(undefined, dateOpts)}, ${s.toLocaleTimeString(undefined, timeOpts)} – ${e.toLocaleTimeString(undefined, timeOpts)}`;
    }
    return `${s.toLocaleDateString(undefined, dateOpts)} ${s.toLocaleTimeString(undefined, timeOpts)} – ${e.toLocaleDateString(undefined, dateOpts)} ${e.toLocaleTimeString(undefined, timeOpts)}`;
  } catch {
    return `${start} – ${end}`;
  }
}

export const GCalFreeBusyTool = memo(function GCalFreeBusyTool({
  part,
}: RendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as FreeBusyOutput) : null;

  const totalBusy =
    output?.calendars?.reduce((sum, cal) => sum + cal.busy.length, 0) ?? 0;

  const summary = isRunning
    ? "Checking availability…"
    : hasOutput && output
      ? totalBusy === 0
        ? "All clear — no busy slots"
        : `${totalBusy} busy slot${totalBusy !== 1 ? "s" : ""} found`
      : isError
        ? "Failed to check availability"
        : "Checking availability…";

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
      isExpandable={totalBusy > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {output?.calendars?.length ? (
        <div className="space-y-3">
          {output.calendars.map((cal) => (
            <div key={cal.calendarId}>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-foreground/50">
                <Icon icon="solar:calendar-linear" className="h-3 w-3" />
                <span className="truncate">{cal.calendarId}</span>
              </div>
              {cal.busy.length > 0 ? (
                <div className="space-y-1">
                  {cal.busy.map((slot, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-md bg-danger/5 px-2.5 py-1.5"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger/60" />
                      <span className="text-[11px] text-foreground/70">
                        {formatTimeSlot(slot.start, slot.end)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2 text-[11px] text-success">
                  <Icon icon="solar:check-circle-linear" className="h-3 w-3" />
                  <span>Available</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
