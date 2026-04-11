"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { renderCopilotApprovalActions } from "../copilot-approval-actions";
import { CopilotTextBlock } from "../copilot-content";
import {
  extractCopilotTextFromContent,
  isCopilotToolErrorState,
  isCopilotToolRunningState,
  unwrapCopilotInput,
  useCopilotExpansionState,
} from "../copilot-helpers";

type CopilotMemoryInput = {
  action?: "store" | "vote";
  citations?: string;
  direction?: "upvote" | "downvote";
  fact?: string;
  reason?: string;
  subject?: string;
};

function getMemoryIcon(input: CopilotMemoryInput | null) {
  if (input?.action === "vote") {
    return input.direction === "downvote"
      ? "solar:dislike-linear"
      : "solar:like-linear";
  }
  return "solar:bookmark-square-linear";
}

function truncateText(text: string, maxLen = 50): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function buildSummary(
  part: RendererProps["part"],
  input: CopilotMemoryInput | null,
): ReactNode {
  const subject = input?.subject ?? null;
  const fact = input?.fact ? truncateText(input.fact) : null;
  const label = subject ?? fact ?? "memory";

  if (part.state === "output-denied") {
    return <>Memory action denied for {label}</>;
  }

  if (part.state === "output-error") {
    return <>Memory action failed for {label}</>;
  }

  if (input?.action === "vote") {
    const voteVerb = input.direction === "downvote" ? "Downvoted" : "Upvoted";
    const voteProgressiveVerb =
      input.direction === "downvote" ? "Downvoting" : "Upvoting";

    if (part.state === "output-available") {
      return (
        <>
          {voteVerb} memory for{" "}
          <span className="font-mono text-[12px]">{label}</span>
        </>
      );
    }

    return (
      <>
        {voteProgressiveVerb} memory for{" "}
        <span className="font-mono text-[12px]">{label}</span>
      </>
    );
  }

  if (part.state === "output-available") {
    return (
      <>
        Saved memory for <span className="font-mono text-[12px]">{label}</span>
      </>
    );
  }

  if (part.state === "approval-requested") {
    return (
      <>
        Store memory for <span className="font-mono text-[12px]">{label}</span>
      </>
    );
  }

  return (
    <>
      Saving memory for <span className="font-mono text-[12px]">{label}</span>
    </>
  );
}

function MemoryDetails({ input }: { input: CopilotMemoryInput }) {
  return (
    <div className="flex flex-col gap-2">
      {input.fact && (
        <div>
          <p className="mb-1 text-[11px] text-muted">Fact</p>
          <p className="rounded-lg border border-border/40 bg-surface/20 px-3 py-2 text-[12px] text-foreground/80 whitespace-pre-wrap">
            {input.fact}
          </p>
        </div>
      )}
      {input.subject && (
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-foreground/40">Subject:</span>
          <span className="font-mono text-foreground/70">{input.subject}</span>
        </div>
      )}
      {input.reason && (
        <div className="flex items-start gap-2 text-[12px]">
          <span className="shrink-0 text-foreground/40">Reason:</span>
          <span className="text-foreground/60">{input.reason}</span>
        </div>
      )}
      {input.citations && (
        <div className="flex items-start gap-2 text-[12px]">
          <span className="shrink-0 text-foreground/40">Citations:</span>
          <span className="font-mono text-foreground/50">
            {input.citations}
          </span>
        </div>
      )}
    </div>
  );
}

export const CopilotMemoryTool = memo(function CopilotMemoryTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const input = unwrapCopilotInput<CopilotMemoryInput>(
    hasInput ? part.input : undefined,
  );
  const outputText = hasOutput
    ? extractCopilotTextFromContent(part.output)
    : null;
  const isRunning = isCopilotToolRunningState(part.state);
  const isError = isCopilotToolErrorState(part.state);
  const [isExpanded, setIsExpanded] = useCopilotExpansionState(
    part,
    part.state === "approval-requested",
  );
  const actions = renderCopilotApprovalActions({ onApprove, onDeny, part });

  const hasDetails = Boolean(
    input?.fact || input?.subject || input?.reason || input?.citations,
  );

  return (
    <ToolLayout
      actions={actions}
      isError={isError}
      isExpandable={hasDetails || Boolean(outputText?.trim())}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      footer={
        input?.action === "vote" && input.direction ? (
          <div className="flex items-center justify-between">
            <span>{input.subject ?? "memory"}</span>
            <span
              className={
                input.direction === "downvote" ? "text-danger" : "text-success"
              }
            >
              {input.direction}
            </span>
          </div>
        ) : null
      }
      summary={
        <>
          <Icon
            className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            icon={getMemoryIcon(input)}
          />
          {buildSummary(part, input)}
        </>
      }
    >
      <div className="space-y-3">
        {hasDetails && input ? <MemoryDetails input={input} /> : null}
        {outputText?.trim() ? (
          <CopilotTextBlock label="Result" text={outputText} />
        ) : null}
      </div>
    </ToolLayout>
  );
});
