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
    <div className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-5">
      <div className="relative flex justify-center">
        <div className="mt-[9px] h-[8px] w-[8px] rounded-full bg-foreground/50" />
        {connectsToNext ? (
          <div className="absolute left-1/2 top-[25px] h-[calc(100%-6px)] w-px -translate-x-1/2 bg-border/75" />
        ) : null}
      </div>

      <div className={`${isLast ? "pb-0" : "pb-8"} min-w-0`}>
        <p className="mb-2 text-[15px] font-medium text-foreground/88">
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
    <div className="flex h-full w-full flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-border/20 px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-snug text-foreground">
            {sidebarTitle}
          </h2>
          {tokenCount !== undefined ? (
            <p className="mt-1.5 text-[11px] text-muted">
              {formatTokenCount(tokenCount)} reasoning tokens
            </p>
          ) : null}
        </div>
        <CloseButton
          aria-label="Close reasoning sidebar"
          className="mt-0.5 shrink-0"
          onPress={handleClose}
        />
      </header>

      <div className="min-h-0 flex-1">
        <ScrollShadow className="h-full px-7 pb-6 pt-5" orientation="vertical">
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
                  <div className="min-w-0 text-[15px] font-medium text-foreground/88">
                    Done
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </ScrollShadow>
      </div>
    </div>
  );
});
