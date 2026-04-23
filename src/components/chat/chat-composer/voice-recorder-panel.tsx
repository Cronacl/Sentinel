"use client";

import { Button, Spinner } from "@heroui/react";
import { useCallback, useEffect, useRef } from "react";

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

const BAR_WIDTH = 2;
const BAR_GAP = 1.5;
const BAR_STEP = BAR_WIDTH + BAR_GAP;
const MIN_BAR_HEIGHT = 2;
const MAX_BAR_HEIGHT = 20;
const SAMPLE_INTERVAL_MS = 80;

export function VoiceRecorderPanel({
  elapsedSeconds,
  errorMessage,
  level,
  onCancel,
  onStop,
  phase,
}: VoiceRecorderPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const lastSampleTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const levelRef = useRef(level);

  levelRef.current = level;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    const maxBars = Math.floor(w / BAR_STEP);
    const history = historyRef.current;

    // Trim history to visible range
    if (history.length > maxBars) {
      historyRef.current = history.slice(history.length - maxBars);
    }

    ctx.clearRect(0, 0, w, h);

    const bars = historyRef.current;
    const startX = w - bars.length * BAR_STEP;
    const midY = h / 2;

    for (let i = 0; i < bars.length; i++) {
      const intensity = bars[i] ?? 0;
      const barH =
        MIN_BAR_HEIGHT + intensity * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
      const x = startX + i * BAR_STEP;
      const y = midY - barH / 2;
      const alpha = 0.4 + intensity * 0.5;

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, y, BAR_WIDTH, barH, 1);
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    if (phase !== "recording") {
      if (phase === "transcribing") {
        // Keep the waveform visible but stop sampling
        draw();
      }
      return;
    }

    // Reset history when recording starts
    historyRef.current = [];
    lastSampleTimeRef.current = 0;

    const tick = () => {
      const now = performance.now();
      if (now - lastSampleTimeRef.current >= SAMPLE_INTERVAL_MS) {
        historyRef.current.push(Math.min(1, levelRef.current));
        lastSampleTimeRef.current = now;
      }
      draw();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [phase, draw]);

  return (
    <div className="flex h-8 items-center gap-3 px-2">
      <Button
        className="shrink-0 text-xs"
        onPress={onCancel}
        size="sm"
        variant="tertiary"
      >
        Cancel
      </Button>

      <canvas className="h-6 min-w-0 flex-1" ref={canvasRef} />

      {errorMessage ? (
        <span className="shrink-0 text-[11px] text-danger-soft-foreground">
          {errorMessage}
        </span>
      ) : null}

      <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
        {formatVoiceInputDuration(elapsedSeconds)}
      </span>

      {phase === "transcribing" ? (
        <div className="flex size-6 shrink-0 items-center justify-center">
          <Spinner className="size-3.5 min-w-3.5" color="current" size="sm" />
        </div>
      ) : (
        <button
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/90 text-background transition-colors hover:bg-foreground"
          onClick={onStop}
          type="button"
        >
          <svg fill="currentColor" height={8} viewBox="0 0 8 8" width={8}>
            <rect height={8} rx={1.5} width={8} />
          </svg>
        </button>
      )}
    </div>
  );
}
