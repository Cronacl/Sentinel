"use client";

import { CloseButton, ScrollShadow } from "@heroui/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { useRightSidebar } from "@/components/shell/shell-context";

import { MarkdownContent } from "../text";
import { formatTokenCount } from "../types";
import {
  closeReasoningSidebarState,
  useReasoningSidebarState,
} from "./reasoning-sidebar-store";
import { parseReasoning, type ReasoningStep } from "./reasoning-utils";

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
    <div className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-3">
      <div className="relative flex justify-center">
        <div className="mt-[7px] h-[6px] w-[6px] rounded-full bg-foreground/40" />
        {connectsToNext ? (
          <div className="absolute left-1/2 top-[18px] bottom-0 w-px -translate-x-1/2 bg-border/50" />
        ) : null}
      </div>

      <div className={`${isLast ? "pb-0" : "pb-4"} min-w-0`}>
        <p className="text-[13px] font-medium text-foreground/80">
          {step.title}
        </p>
        {shouldRenderContent && step.content ? (
          <div className="mt-1">
            <MarkdownContent text={step.content} variant="reasoning-timeline" />
          </div>
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
    <div className="flex h-full w-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/20 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-medium text-foreground">
            {sidebarTitle}
          </h2>
          {tokenCount !== undefined ? (
            <p className="mt-0.5 text-[11px] text-foreground/40">
              {formatTokenCount(tokenCount)} reasoning tokens
            </p>
          ) : null}
        </div>
        <CloseButton
          aria-label="Close reasoning sidebar"
          className="shrink-0"
          onPress={handleClose}
        />
      </header>

      <div className="min-h-0 flex-1">
        <ScrollShadow className="h-full px-4 pb-4 pt-3" orientation="vertical">
          {parsedSteps.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-foreground/30">
              No thinking content available
            </p>
          ) : (
            <div className="relative flex flex-col">
              {parsedSteps.map((step, index) => {
                const isLast = index === parsedSteps.length - 1;
                return (
                  <TimelineStep
                    connectsToNext={
                      index < parsedSteps.length - 1 || showDoneIndicator
                    }
                    isLast={isLast && !showDoneIndicator}
                    key={`reasoning-step-${index}-${step.title.slice(0, 20)}`}
                    shouldRenderContent={index < renderedCount}
                    step={step}
                  />
                );
              })}

              {showDoneIndicator ? (
                <div className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-3">
                  <div className="relative flex justify-center">
                    <div className="mt-[7px] h-[6px] w-[6px] rounded-full bg-foreground/60" />
                  </div>
                  <p className="text-[13px] font-medium text-foreground/60">
                    Done
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </ScrollShadow>
      </div>
    </div>
  );
});
