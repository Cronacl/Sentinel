"use client";

import { ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@heroui/react";
import { useMemo } from "react";

import { formatVoiceInputDuration } from "./voice-input.helpers";

type VoiceRecorderPanelProps = {
  elapsedSeconds: number;
  errorMessage: string;
  level: number;
  onCancel: () => void;
  onStop: () => void;
  phase: "recording" | "transcribing";
  providerLabel: string;
};

function createWaveformBars(
  level: number,
  phase: VoiceRecorderPanelProps["phase"],
) {
  return Array.from({ length: 32 }, (_, index) => {
    const center = 15.5;
    const dist = Math.abs(index - center) / center;
    const wave = 1 - dist * 0.6;
    const baseline = phase === "transcribing" ? 0.25 : 0.1;
    const intensity =
      phase === "transcribing"
        ? baseline + wave * 0.3
        : Math.min(1, baseline + wave * 0.2 + level * 1.2 * wave);

    return {
      height: `${Math.round(4 + intensity * 16)}px`,
      opacity: Math.min(1, 0.3 + intensity * 0.7),
    };
  });
}

export function VoiceRecorderPanel({
  elapsedSeconds,
  errorMessage,
  level,
  onCancel,
  onStop,
  phase,
}: VoiceRecorderPanelProps) {
  const bars = useMemo(() => createWaveformBars(level, phase), [level, phase]);

  return (
    <div className="flex h-8 items-center justify-between px-1.5">
      <div className="flex items-center gap-2">
        <button
          className="text-xs text-muted transition-colors hover:text-foreground"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>

        {errorMessage ? (
          <span className="text-[11px] text-danger-soft-foreground">
            {errorMessage}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 items-center justify-center gap-[2px] px-4">
        {bars.map((bar, index) => (
          <span
            className={`w-[3px] rounded-full ${
              phase === "recording" ? "bg-accent/80" : "bg-foreground/40"
            } transition-all duration-100`}
            key={index}
            style={{
              height: bar.height,
              opacity: bar.opacity,
            }}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="min-w-[36px] text-right font-mono text-xs tabular-nums text-muted">
          {formatVoiceInputDuration(elapsedSeconds)}
        </span>

        {phase === "transcribing" ? (
          <div className="flex h-7 w-7 items-center justify-center">
            <Spinner className="size-3.5 min-w-3.5" color="current" size="sm" />
          </div>
        ) : (
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full bg-default text-muted transition-colors hover:text-foreground"
            onClick={onStop}
            type="button"
          >
            <svg fill="currentColor" height={10} viewBox="0 0 16 16" width={10}>
              <rect height={10} rx={2} width={10} x={3} y={3} />
            </svg>
          </button>
        )}

        <button
          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground opacity-35"
          disabled
          type="button"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={ArrowUp02Icon}
            size={16}
            strokeWidth={1.5}
          />
        </button>
      </div>
    </div>
  );
}
