"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";

import { ThinkingIndicator } from "./thinking-indicator";
import { extractLastTitle, parseReasoning } from "./reasoning-utils";
import {
  ThinkingStep,
  ThinkingSteps,
  ThinkingStepsContent,
  ThinkingStepsHeader,
  type StepStatus,
} from "./thinking-steps";

export const ReasoningPart = memo(function ReasoningPart({
  activeSinceMs,
  durationMs,
  isLastStreamingPart,
  isStreaming,
  reasoningKey,
  text,
}: {
  activeSinceMs?: number | null;
  durationMs?: number;
  isLastStreamingPart: boolean;
  isStreaming: boolean;
  reasoningKey: string;
  text: string;
  tokenCount?: number;
}) {
  const isActivelyStreaming = isStreaming && isLastStreamingPart;
  const [open, setOpen] = useState(false);
  const wasActivelyStreamingRef = useRef(isActivelyStreaming);
  const elapsedSeconds = useElapsedSeconds(
    isActivelyStreaming && activeSinceMs != null,
  );
  const title = useMemo(() => {
    const parsed = extractLastTitle(text);
    if (parsed) return parsed;
    if (isStreaming) return "Thinking...";
    return "Planning next moves";
  }, [isStreaming, text]);

  const parsedSteps = useMemo(() => {
    const steps = parseReasoning(text);
    if (steps.length > 0) return steps;

    return [
      {
        content: "",
        title: title || "Thinking",
      },
    ];
  }, [text, title]);

  const stepCount = parsedSteps.length;
  const activeStepIndex = isActivelyStreaming ? Math.max(0, stepCount - 1) : -1;
  const liveDurationMs = useMemo(() => {
    if (!isActivelyStreaming || activeSinceMs == null) {
      return durationMs;
    }

    return (durationMs ?? 0) + elapsedSeconds * 1000;
  }, [activeSinceMs, durationMs, elapsedSeconds, isActivelyStreaming]);
  const durationLabel =
    liveDurationMs && liveDurationMs > 0
      ? `Thought for ${formatDuration(liveDurationMs)}`
      : "Thinking";

  useEffect(() => {
    if (isActivelyStreaming) {
      setOpen(false);
    } else if (wasActivelyStreamingRef.current) {
      setOpen(false);
    }

    wasActivelyStreamingRef.current = isActivelyStreaming;
  }, [isActivelyStreaming]);

  return (
    <div
      className="w-full overflow-hidden rounded-lg"
      aria-busy={isStreaming}
      data-reasoning-key={reasoningKey}
    >
      <ThinkingSteps open={open} onOpenChange={setOpen}>
        <ThinkingStepsHeader>
          <span className="flex min-w-0 items-center gap-1.5">
            {isActivelyStreaming ? (
              <ThinkingIndicator />
            ) : (
              <span className="truncate">{durationLabel}</span>
            )}
          </span>
        </ThinkingStepsHeader>
        <ThinkingStepsContent>
          {parsedSteps.map((step, index) => {
            const status: StepStatus =
              index === activeStepIndex ? "active" : "complete";

            return (
              <ThinkingStep
                description={step.content}
                index={index}
                isLast={index === parsedSteps.length - 1}
                key={`${reasoningKey}:step:${index}:${step.title.slice(0, 24)}`}
                label={step.title}
                shouldAnimate={index === activeStepIndex}
                showIcon={false}
                status={status}
              />
            );
          })}
        </ThinkingStepsContent>
      </ThinkingSteps>
    </div>
  );
});

function useElapsedSeconds(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const lastElapsedRef = useRef(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    const startedAt = Date.now();
    setElapsed(0);

    const interval = window.setInterval(() => {
      const next = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      lastElapsedRef.current = next;
      setElapsed(next);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [active]);

  return active ? elapsed : lastElapsedRef.current;
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}
