"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";
import {
  ArrowDown01Icon,
  Copy01Icon,
  Download04Icon,
  PlayIcon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererProps } from "../../renderer";
import { MarkdownContent } from "../../../text/markdown-content";
import { useToolExpansionState } from "../shared/tool-layout";
import {
  unwrapClaudeInput,
  extractTextFromContent,
  getApprovalReason,
} from "../claude-helpers";

type ClaudePlanInput = {
  allowedPrompts?: Array<{ prompt: string; tool: string }>;
  plan?: string;
  planFilePath?: string;
};

type ClaudePlanOutput = {
  awaitingLeaderApproval?: boolean;
  filePath?: string;
  isAgent?: boolean;
  plan?: string | null;
};

function isPlanInput(value: unknown): value is ClaudePlanInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.plan === "string" ||
    typeof v.planFilePath === "string" ||
    Array.isArray(v.allowedPrompts)
  );
}

function isPlanOutput(value: unknown): value is ClaudePlanOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.plan === "string" ||
    typeof v.isAgent === "boolean" ||
    typeof v.filePath === "string"
  );
}

function extractPlanText(
  input: ClaudePlanInput | null,
  output: ClaudePlanOutput | null,
  rawOutput: unknown,
): string {
  if (output?.plan) return output.plan;
  if (input?.plan) return input.plan;
  const fallback = extractTextFromContent(rawOutput);
  if (fallback) return fallback;
  return "";
}

const MAX_COLLAPSED_HEIGHT = 320;

export const ClaudePlanTool = memo(function ClaudePlanTool({
  onApprove,
  onDeny,
  onStartPlanImplementation,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const rawInput = hasInput ? part.input : undefined;
  const rawOutput = hasOutput ? part.output : undefined;
  const unwrapped = unwrapClaudeInput<ClaudePlanInput>(rawInput);
  const planInput = unwrapped && isPlanInput(unwrapped) ? unwrapped : null;
  const planOutput =
    hasOutput && isPlanOutput(part.output)
      ? (part.output as ClaudePlanOutput)
      : null;

  const isStreaming =
    part.state === "input-available" || part.state === "input-streaming";
  const isDone =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied";
  const isApproval = part.state === "approval-requested";

  const approvalId =
    part.approval &&
    typeof part.approval === "object" &&
    "id" in part.approval &&
    typeof part.approval.id === "string"
      ? part.approval.id
      : null;

  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: isApproval,
    autoExpand: isApproval,
  });
  const [copied, setCopied] = useState(false);

  const body = useMemo(
    () => extractPlanText(planInput, planOutput, rawOutput),
    [planInput, planOutput, rawOutput],
  );

  if (!body) return null;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(body);
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

  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-(--color-surface)">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-0">
        <span
          className={`text-[12.5px] font-medium ${
            isStreaming ? "sentinel-thinking-shimmer" : "text-foreground/60"
          }`}
        >
          {isStreaming ? "Generating plan" : isApproval ? "Plan ready" : "Plan"}
          {isStreaming && (
            <span className="ml-1 text-[11px] font-normal text-foreground/30">
              ...
            </span>
          )}
        </span>
        <div className="flex items-center gap-0.5">
          {(isDone || isApproval) && (
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
          <div className="text-[13px] leading-relaxed text-foreground/85">
            <MarkdownContent isStreaming={isStreaming} text={body} />
          </div>
        </ScrollShadow>
        {!isExpanded && (isDone || isApproval) && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center">
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
      </div>

      {/* Footer: approval or implement */}
      {isApproval && approvalId && onApprove && onDeny ? (
        <div className="flex items-center justify-between border-t border-border/30 px-3.5 py-1.5">
          {getApprovalReason(part.approval) && (
            <p className="mr-3 line-clamp-1 min-w-0 flex-1 text-[11px] text-muted">
              {getApprovalReason(part.approval)}
            </p>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => onDeny(approvalId)}
              size="sm"
              variant="ghost"
            >
              Deny
            </Button>
            <Button
              className="h-7 min-w-0 gap-1.5 px-3 text-[11px] font-medium"
              onPress={() => onApprove(approvalId)}
              size="sm"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={PlayIcon}
                size={12}
                strokeWidth={2}
              />
              Approve plan
            </Button>
          </div>
        </div>
      ) : isDone && onStartPlanImplementation ? (
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
      ) : null}
    </div>
  );
});
