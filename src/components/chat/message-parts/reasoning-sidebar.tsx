"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { useRightSidebar } from "@/components/shell/shell-context";

import { MarkdownContent } from "./markdown-content";
import {
  closeReasoningSidebarState,
  useReasoningSidebarState,
} from "./reasoning-sidebar-store";
import { parseReasoning, type ReasoningStep } from "./reasoning-utils";
import { formatTokenCount } from "./types";

const TimelineStep = memo(function TimelineStep({
  connectsToNext,
  isLast,
  shouldRenderContent,
  step,
}: {
  connectsToNext: boolean;
  isLast: boolean;
  shouldRenderContent: boolean;
  step: ReasoningStep;
}) {
  return (
    <div className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-5">
      <div className="relative flex justify-center">
        <div className="mt-[9px] h-[8px] w-[8px] rounded-full bg-foreground/50" />
        {connectsToNext ? (
          <div className="absolute left-1/2 top-[25px] h-[calc(100%-6px)] w-px -translate-x-1/2 bg-border/75" />
        ) : null}
      </div>

      <div className={`${isLast ? "pb-0" : "pb-8"} min-w-0`}>
        <p className="mb-2 text-[15px] font-medium leading-[1.3] tracking-[-0.01em] text-foreground/88">
          {step.title}
        </p>
        {shouldRenderContent ? (
          <MarkdownContent text={step.content} variant="reasoning-timeline" />
        ) : null}
      </div>
    </div>
  );
});

export const ReasoningSidebar = memo(function ReasoningSidebar() {
  const { close } = useRightSidebar();
  const reasoning = useReasoningSidebarState((state) => state.reasoning);
  const isStreaming = useReasoningSidebarState((state) => state.isStreaming);
  const isLastStreamingPart = useReasoningSidebarState(
    (state) => state.isLastStreamingPart,
  );
  const title = useReasoningSidebarState((state) => state.title);
  const tokenCount = useReasoningSidebarState((state) => state.tokenCount);

  const [parsedSteps, setParsedSteps] = useState<ReasoningStep[]>([]);
  const [renderedCount, setRenderedCount] = useState(0);
  const parseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current);
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current);
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);

    parseTimeoutRef.current = setTimeout(() => {
      const steps = parseReasoning(reasoning);
      setParsedSteps(steps);
      setRenderedCount((prev) => {
        if (steps.length === 0) return 0;
        const safePrev = prev === 0 ? 1 : prev;
        return Math.min(safePrev, steps.length);
      });
    }, 16);

    return () => {
      if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current);
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    };
  }, [reasoning]);

  useEffect(() => {
    if (parsedSteps.length === 0 || renderedCount >= parsedSteps.length) return;

    renderTimeoutRef.current = setTimeout(() => {
      setRenderedCount((prev) => Math.min(prev + 1, parsedSteps.length));
    }, 50);

    return () => {
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    };
  }, [parsedSteps.length, renderedCount]);

  const handleClose = useCallback(() => {
    closeReasoningSidebarState();
    close();
  }, [close]);

  const showDoneIndicator = !isLastStreamingPart || !isStreaming;
  const sidebarTitle =
    parsedSteps.length === 1 && parsedSteps[0]?.title
      ? parsedSteps[0].title
      : title || "Thinking";

  return (
    <div className="flex h-full w-full flex-col bg-transparent px-7 pb-6 pt-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[22px] font-medium leading-none tracking-[-0.02em] text-foreground/78">
            {sidebarTitle}
          </h2>
          {tokenCount !== undefined ? (
            <p className="mt-2 text-[13px] leading-none text-muted/90">
              {formatTokenCount(tokenCount)} reasoning tokens
            </p>
          ) : null}
        </div>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted/80 transition-colors hover:text-foreground/80"
          onClick={handleClose}
          type="button"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={Cancel01Icon}
            size={16}
            strokeWidth={1.5}
          />
        </button>
      </div>

      <div className="sentinel-scroll-shell min-h-0 flex-1">
        <div className="sentinel-scroll-area flex h-full flex-col">
          {parsedSteps.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-default-400">
              No thinking content available
            </div>
          ) : (
            <div className="relative flex flex-col">
              {parsedSteps.map((step, index) => (
                <TimelineStep
                  connectsToNext={
                    index < parsedSteps.length - 1 || showDoneIndicator
                  }
                  isLast={index === parsedSteps.length - 1}
                  key={`reasoning-step-${index}-${step.title.slice(0, 20)}`}
                  shouldRenderContent={index < renderedCount}
                  step={step}
                />
              ))}

              {showDoneIndicator ? (
                <div className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-5 pt-2">
                  <div className="relative flex justify-center">
                    <div className="mt-[8px] h-[8px] w-[8px] rounded-full bg-foreground/80" />
                  </div>
                  <div className="min-w-0 text-[15px] font-medium leading-none tracking-[-0.01em] text-foreground/88">
                    Done
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
