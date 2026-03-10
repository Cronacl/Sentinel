"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRightSidebar } from "@/components/shell/shell-context";

import { ReasoningSidebar } from "./reasoning-sidebar";
import {
  getReasoningSidebarState,
  setReasoningSidebarState,
} from "./reasoning-sidebar-store";
import { extractLastTitle } from "./reasoning-utils";

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

export const ReasoningPart = memo(function ReasoningPart({
  activeSinceMs,
  durationMs,
  isLastStreamingPart,
  isStreaming,
  reasoningKey,
  text,
  tokenCount,
}: {
  activeSinceMs?: number | null;
  durationMs?: number;
  isLastStreamingPart: boolean;
  isStreaming: boolean;
  reasoningKey: string;
  text: string;
  tokenCount?: number;
}) {
  const { isOpen, open, setContent } = useRightSidebar();
  const elapsedSeconds = useElapsedSeconds(
    isStreaming && isLastStreamingPart && activeSinceMs != null,
  );
  const title = useMemo(() => {
    const parsed = extractLastTitle(text);
    if (parsed) return parsed;
    if (isStreaming) return "Thinking...";
    return "Planning next moves";
  }, [isStreaming, text]);

  const liveDurationMs = useMemo(() => {
    if (!isStreaming || !isLastStreamingPart || activeSinceMs == null) {
      return durationMs;
    }

    return (durationMs ?? 0) + elapsedSeconds * 1000;
  }, [
    activeSinceMs,
    durationMs,
    elapsedSeconds,
    isLastStreamingPart,
    isStreaming,
  ]);

  const summaryText = useMemo(() => {
    if (isStreaming && isLastStreamingPart) {
      if (liveDurationMs && liveDurationMs > 0) {
        return `Thought for ${formatDuration(liveDurationMs)}`;
      }
      return title;
    }

    if (liveDurationMs && liveDurationMs > 0) {
      return `Thought for ${formatDuration(liveDurationMs)}`;
    }

    return title;
  }, [isLastStreamingPart, isStreaming, liveDurationMs, title]);

  const syncSidebarState = useCallback(() => {
    setReasoningSidebarState({
      isLastStreamingPart,
      isStreaming,
      reasoning: text,
      reasoningKey,
      title,
      tokenCount,
    });
  }, [isLastStreamingPart, isStreaming, reasoningKey, text, title, tokenCount]);

  const handleOpen = useCallback(() => {
    syncSidebarState();
    open(<ReasoningSidebar />);
  }, [open, syncSidebarState]);

  useEffect(() => {
    if (!isOpen) return;
    if (getReasoningSidebarState().reasoningKey !== reasoningKey) return;
    syncSidebarState();
    setContent(<ReasoningSidebar />);
  }, [isOpen, reasoningKey, setContent, syncSidebarState]);

  return (
    <div
      className="w-full overflow-hidden rounded-lg transition-all"
      aria-busy={isStreaming}
    >
      <div className="flex w-full items-center justify-between gap-3 pr-1">
        <button
          className="group flex min-w-0 flex-1 items-center gap-2 text-left text-default-600 transition-colors hover:text-foreground dark:text-default-400"
          onClick={handleOpen}
          type="button"
        >
          <p className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground/70">
            <span
              className={`truncate ${
                isStreaming && isLastStreamingPart
                  ? "sentinel-thinking-shimmer"
                  : ""
              }`}
            >
              {summaryText}
            </span>
          </p>
        </button>
      </div>
    </div>
  );
});

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
