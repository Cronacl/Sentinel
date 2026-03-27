"use client";

import { Tooltip } from "@heroui/react";

function formatDetailedTokenCount(count: number) {
  return new Intl.NumberFormat().format(count);
}

function formatCompactTokenCount(count: number) {
  if (count >= 1_000_000) {
    const value = count / 1_000_000;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "")}m`;
  }

  if (count >= 1_000) {
    const value = count / 1_000;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "")}k`;
  }

  return formatDetailedTokenCount(count);
}

function getUsageToneClass(
  usedPercent: number,
  compactionWindowPercent: number,
) {
  if (usedPercent >= 90) {
    return "text-danger";
  }

  if (usedPercent >= compactionWindowPercent) {
    return "text-warning";
  }

  return "text-accent";
}

export function ContextWindowIndicator({
  compactionEnabled,
  contextWindowMode,
  compactionWindowPercent,
  contextWindow,
  inputTokens,
  isDisabled = false,
  modelContextWindow,
  usedPercent,
}: {
  compactionEnabled: boolean;
  compactionWindowPercent: number;
  contextWindow: number;
  contextWindowMode: "fixed" | "model" | "provider";
  inputTokens: number;
  isDisabled?: boolean;
  modelContextWindow?: number | null;
  usedPercent: number;
}) {
  const ringSize = 16;
  const strokeWidth = 3;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = Math.max(0, Math.min(100, usedPercent));
  const strokeOffset =
    circumference - (Math.min(clampedPercent, 100) / 100) * circumference;
  const toneClass = isDisabled
    ? "text-muted/45"
    : getUsageToneClass(clampedPercent, compactionWindowPercent);

  return (
    <Tooltip.Root delay={150}>
      <Tooltip.Trigger>
        <button
          aria-label={`Context usage ${clampedPercent}%`}
          className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${isDisabled ? "cursor-default" : "cursor-help hover:bg-default/60"}`}
          type="button"
        >
          <svg
            aria-hidden="true"
            className={toneClass}
            height={ringSize}
            viewBox={`0 0 ${ringSize} ${ringSize}`}
            width={ringSize}
          >
            <circle
              className="stroke-border/60"
              cx={ringSize / 2}
              cy={ringSize / 2}
              fill="none"
              r={radius}
              strokeWidth={strokeWidth}
            />
            <circle
              className="stroke-current transition-[stroke-dashoffset]"
              cx={ringSize / 2}
              cy={ringSize / 2}
              fill="none"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
              strokeWidth={strokeWidth}
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "50% 50%",
              }}
            />
          </svg>
        </button>
      </Tooltip.Trigger>

      <Tooltip.Content
        className="max-w-[280px] rounded-2xl border border-border/60 bg-overlay px-4 py-3 text-sm shadow-overlay"
        offset={12}
        placement="top"
      >
        <div className="space-y-2">
          <div>
            <p className="text-xs font-medium text-muted">
              {contextWindowMode === "fixed"
                ? "Compaction window"
                : "Context window"}
            </p>
            <p className="mt-1 text-lg font-medium text-foreground">
              {clampedPercent}% full
            </p>
            <p className="text-sm text-muted">
              {formatCompactTokenCount(inputTokens)} /{" "}
              {formatCompactTokenCount(contextWindow)} tokens tracked
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
            <p className="text-xs text-muted">
              Token usage comes from the latest completed response.
            </p>
            <p className="mt-1 text-xs text-muted">
              {formatDetailedTokenCount(inputTokens)} /{" "}
              {formatDetailedTokenCount(contextWindow)} tokens
            </p>
            <p className="mt-1 text-xs text-muted">
              Window source:{" "}
              {contextWindowMode === "fixed"
                ? "fixed size from settings"
                : contextWindowMode === "provider"
                  ? "latest completed Claude response"
                  : "active model metadata"}
            </p>
            {contextWindowMode === "fixed" &&
            modelContextWindow != null &&
            modelContextWindow !== contextWindow ? (
              <p className="mt-1 text-xs text-muted">
                Active model window:{" "}
                {formatDetailedTokenCount(modelContextWindow)} tokens
              </p>
            ) : null}
          </div>

          <p className="text-xs text-muted">
            {compactionEnabled
              ? `Automatic compaction is on and starts around ${compactionWindowPercent}% of the ${
                  contextWindowMode === "fixed"
                    ? "fixed window"
                    : "active model window"
                }.`
              : "Automatic compaction is off in settings."}
          </p>
        </div>
      </Tooltip.Content>
    </Tooltip.Root>
  );
}
