"use client";

import { ProgressBar, Tooltip } from "@heroui/react";
import { memo } from "react";

import type { EngineUsageLimits } from "@/lib/ai/chat/engines/contract";

import { useEngineUsageLimits } from "./use-engine-usage-limits";
import {
  describeUsageReset,
  driverReportsUsageLimits,
  formatUsagePercent,
  getMostConstrainedUsageWindow,
  getUsageTone,
  getUsageWindows,
} from "./usage-limits";

const TONE_TEXT_CLASS = {
  accent: "text-muted",
  danger: "text-danger",
  warning: "text-warning",
} as const;

const TONE_BAR_CLASS = {
  accent: "bg-accent",
  danger: "bg-danger",
  warning: "bg-warning",
} as const;

export function UsageLimitsWindows({
  limits,
  now,
}: {
  limits: EngineUsageLimits;
  now: number;
}) {
  return (
    <div className="space-y-2">
      {getUsageWindows(limits).map((window) => {
        const reset = describeUsageReset(window, now);
        return (
          <ProgressBar.Root
            aria-label={`${window.label} usage`}
            className="gap-1"
            color={getUsageTone(window.usedPercent)}
            key={window.id}
            size="sm"
            value={Math.min(100, window.usedPercent)}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-foreground">{window.label}</span>
              <span className="text-muted">
                {formatUsagePercent(window.usedPercent)} used
              </span>
            </div>
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
            {reset ? (
              <span className="text-muted text-[11px]">{reset}</span>
            ) : null}
          </ProgressBar.Root>
        );
      })}
    </div>
  );
}

/**
 * The composer's usage chip: the selected instance's fullest plan window,
 * with every window in the tooltip. Renders nothing for engines that do not
 * report usage, or before anything is known.
 */
export const EngineUsageLimitsChip = memo(function EngineUsageLimitsChip({
  driver,
  instanceId,
  isDisabled = false,
}: {
  driver: string;
  instanceId: string | null;
  isDisabled?: boolean;
}) {
  const supported = driverReportsUsageLimits(driver);
  const usage = useEngineUsageLimits(instanceId, { enabled: supported });
  const limits = usage.data ?? null;
  const fullest = getMostConstrainedUsageWindow(limits);

  if (!supported || !limits || !fullest) {
    return null;
  }

  const tone = isDisabled ? "accent" : getUsageTone(fullest.usedPercent);
  const now = Date.now();

  return (
    <Tooltip.Root delay={150}>
      <Tooltip.Trigger>
        <button
          aria-label={`${fullest.label} usage ${formatUsagePercent(fullest.usedPercent)}`}
          className={`flex h-5 items-center gap-1.5 rounded-full px-1.5 text-[11px] font-medium tabular-nums transition-colors ${isDisabled ? "cursor-default text-muted/45" : `cursor-help hover:bg-default/60 ${TONE_TEXT_CLASS[tone]}`}`}
          type="button"
        >
          <span
            aria-hidden="true"
            className="relative h-1 w-4 overflow-hidden rounded-full bg-border/60"
          >
            <span
              className={`absolute inset-y-0 left-0 rounded-full ${isDisabled ? "bg-muted/45" : TONE_BAR_CLASS[tone]}`}
              style={{ width: `${Math.min(100, fullest.usedPercent)}%` }}
            />
          </span>
          {formatUsagePercent(fullest.usedPercent)}
        </button>
      </Tooltip.Trigger>

      <Tooltip.Content className="w-[240px]" offset={12} placement="top">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">Plan usage</p>
          <UsageLimitsWindows limits={limits} now={now} />
        </div>
      </Tooltip.Content>
    </Tooltip.Root>
  );
});
