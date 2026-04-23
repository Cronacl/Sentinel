"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";
import {
  ArrowDown01Icon,
  Copy01Icon,
  Download04Icon,
  PlayIcon,
  Task01Icon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { writeTextToClipboard } from "@/lib/desktop/permissions";
import type { RendererProps } from "../../renderer";
import { MarkdownContent } from "../../../text/markdown-content";

type PlanStep = {
  status: "completed" | "inProgress" | "pending";
  step: string;
};

type CodexPlanOutput = {
  steps?: PlanStep[] | null;
  text: string;
};

function isPlanOutput(value: unknown): value is CodexPlanOutput {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).text === "string";
}

const STEP_COLOR: Record<PlanStep["status"], string> = {
  completed: "text-success",
  inProgress: "text-primary sentinel-thinking-shimmer",
  pending: "text-foreground/30",
};

function PlanSteps({ steps }: { steps: PlanStep[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-2">
          <span
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${STEP_COLOR[step.status]}`}
          >
            <HugeiconsIcon
              color="currentColor"
              icon={
                step.status === "completed"
                  ? Tick01Icon
                  : step.status === "inProgress"
                    ? PlayIcon
                    : Task01Icon
              }
              size={14}
              strokeWidth={1.5}
            />
          </span>
          <span
            className={`text-[12px] leading-[18px] ${
              step.status === "completed"
                ? "text-foreground/50 line-through decoration-foreground/20"
                : step.status === "inProgress"
                  ? "text-foreground/90 font-medium"
                  : "text-foreground/60"
            }`}
          >
            {step.step}
          </span>
        </div>
      ))}
    </div>
  );
}

function extractProposedPlan(text: string): string {
  const openTag = "<proposed_plan>";
  const closeTag = "</proposed_plan>";
  const openIdx = text.indexOf(openTag);
  const closeIdx = text.indexOf(closeTag);

  if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
    return text.slice(openIdx + openTag.length, closeIdx).trim();
  }

  return text.trim();
}

const MAX_COLLAPSED_HEIGHT = 320;

export const CodexPlanTool = memo(function CodexPlanTool({
  onStartPlanImplementation,
  part,
}: RendererProps) {
  const output =
    "output" in part && isPlanOutput(part.output) ? part.output : null;

  const isStreaming = part.state === "input-streaming";
  const isDone = part.state === "output-available";
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
  }, [part.toolCallId]);

  const body = useMemo(
    () => extractProposedPlan(output?.text ?? ""),
    [output?.text],
  );
  const hasSteps = output?.steps && output.steps.length > 0;

  const handleCopy = useCallback(async () => {
    const didCopy = await writeTextToClipboard(body, {
      errorMessage: "Unable to copy this plan.",
    });
    if (!didCopy) {
      return;
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [body]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plan.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [body]);

  if (!body && !output?.steps?.length) return null;

  return (
    <div className="overflow-hidden mt-2 rounded-2xl border border-border/40 bg-(--color-surface)">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-0">
        <span
          className={`text-[12.5px] font-medium ${
            isStreaming ? "sentinel-thinking-shimmer" : "text-foreground/60"
          }`}
        >
          {isStreaming
            ? hasSteps
              ? "Updating plan"
              : "Generating plan"
            : "Plan"}
          {isStreaming && (
            <span className="ml-1 text-[11px] font-normal text-foreground/30">
              ...
            </span>
          )}
        </span>
        <div className="flex items-center gap-0.5">
          {isDone && !hasSteps && (
            <>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/30 transition-colors hover:text-foreground/60"
                onClick={() => void handleDownload()}
                title="Download"
                type="button"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={Download04Icon}
                  size={13}
                  strokeWidth={1.5}
                />
              </button>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/30 transition-colors hover:text-foreground/60"
                onClick={() => void handleCopy()}
                title="Copy"
                type="button"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={copied ? Tick01Icon : Copy01Icon}
                  size={13}
                  strokeWidth={1.5}
                />
              </button>
            </>
          )}
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/30 transition-colors hover:text-foreground/60"
            onClick={() => setIsExpanded((prev) => !prev)}
            title={isExpanded ? "Collapse" : "Expand"}
            type="button"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowDown01Icon}
              size={14}
              strokeWidth={1.5}
              className={`transition-transform duration-150 ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="relative">
        <ScrollShadow
          className="overflow-y-auto px-4 pt-2 pb-3"
          style={{
            maxHeight: isExpanded ? "none" : `${MAX_COLLAPSED_HEIGHT}px`,
          }}
        >
          {hasSteps ? (
            <PlanSteps steps={output.steps!} />
          ) : (
            <div className="text-[13px] leading-relaxed text-foreground/85">
              <MarkdownContent isStreaming={isStreaming} text={body} />
            </div>
          )}
        </ScrollShadow>
        {!isExpanded && isDone && (
          <div className="absolute z-10 inset-x-0 bottom-0 flex flex-col items-center">
            <div className="-mt-4 pb-2.5">
              <button
                className="rounded-full border border-border/60 bg-(--color-surface) px-4 py-1 text-[11px] font-medium text-foreground/70 shadow-sm transition-colors hover:border-border hover:text-foreground/90"
                onClick={() => setIsExpanded(true)}
                type="button"
              >
                Expand plan
              </button>
            </div>
          </div>
        )}

        {/* Gradient fade + expand button when collapsed */}
      </div>

      {/* Footer with implement button */}
      {isDone && onStartPlanImplementation && (
        <div className="flex items-center justify-end border-t border-border/30 px-3.5 py-1.5">
          <Button
            className="h-7 min-w-0 gap-1.5 px-3 text-[11px] font-medium"
            onPress={onStartPlanImplementation}
            size="sm"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={PlayIcon}
              size={12}
              strokeWidth={2}
            />
            Implement plan
          </Button>
        </div>
      )}
    </div>
  );
});
