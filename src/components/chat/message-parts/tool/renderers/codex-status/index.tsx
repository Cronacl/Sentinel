"use client";

import { memo, useState } from "react";
import { ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";

type ReviewModeInput = {
  review: string;
  transition: string;
};

function isReviewModeInput(value: unknown): value is ReviewModeInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.transition === "string";
}

export const CodexReviewModeTool = memo(function CodexReviewModeTool({
  part,
}: RendererProps) {
  const input =
    "input" in part && isReviewModeInput(part.input) ? part.input : null;
  const [isExpanded, setIsExpanded] = useState(false);

  if (!input) return null;

  const entered = input.transition === "enteredReviewMode";
  const hasReviewText = Boolean(input.review?.trim());

  const summary = (
    <>
      <Icon
        icon={entered ? "solar:eye-linear" : "solar:eye-closed-linear"}
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {entered ? "Entered review mode" : "Exited review mode"}
    </>
  );

  if (!hasReviewText) {
    return (
      <ToolLayout
        summary={summary}
        isExpandable={false}
        isExpanded={false}
        onExpandedChange={() => {}}
      />
    );
  }

  return (
    <ToolLayout
      summary={summary}
      isExpandable
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <ScrollShadow className="max-h-[400px]" orientation="vertical">
        <pre className="whitespace-pre-wrap text-[12px] text-foreground/70 leading-relaxed">
          {input.review}
        </pre>
      </ScrollShadow>
    </ToolLayout>
  );
});

export const CodexContextCompactionTool = memo(
  function CodexContextCompactionTool({ part }: RendererProps) {
    const isRunning =
      part.state === "input-available" || part.state === "input-streaming";

    return (
      <div
        className={`flex items-center gap-2 text-[13px] ${
          isRunning ? "sentinel-thinking-shimmer" : "text-foreground/70"
        }`}
      >
        <Icon
          icon="solar:minimize-square-linear"
          className="h-4 w-4 shrink-0 text-foreground/50"
        />
        <span className="min-w-0 flex-1">
          {isRunning ? "Compacting context" : "Context compacted"}
        </span>
      </div>
    );
  },
);

type CollabAgentInput = {
  prompt: string | null;
  receiverThreadIds: string[];
  senderThreadId: string;
  tool: string;
};

type CollabAgentOutput = {
  agentsStates: Record<string, unknown>;
  status: string;
};

function isCollabInput(value: unknown): value is CollabAgentInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.tool === "string";
}

function isCollabOutput(value: unknown): value is CollabAgentOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "string";
}

function AgentStatesBadge({ states }: { states: Record<string, unknown> }) {
  const entries = Object.entries(states);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.map(([agentId, state]) => {
        const statusStr =
          state && typeof state === "object" && "status" in state
            ? String((state as { status: unknown }).status)
            : "unknown";
        const statusColor =
          statusStr === "completed"
            ? "bg-success/10 text-success"
            : statusStr === "failed"
              ? "bg-danger/10 text-danger"
              : "bg-foreground/5 text-foreground/60";
        return (
          <span
            key={agentId}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${statusColor}`}
          >
            <span className="font-mono">{agentId.slice(0, 8)}</span>
            <span>{statusStr}</span>
          </span>
        );
      })}
    </div>
  );
}

export const CodexCollabAgentTool = memo(function CodexCollabAgentTool({
  part,
}: RendererProps) {
  const input =
    "input" in part && isCollabInput(part.input) ? part.input : null;
  const output =
    "output" in part && isCollabOutput(part.output) ? part.output : null;
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning =
    part.state === "input-available" || part.state === "input-streaming";
  const isError = part.state === "output-error";
  const isDone = part.state === "output-available";
  const agentCount = input?.receiverThreadIds?.length ?? 0;

  const label = (() => {
    if (isError) return "Agent collaboration failed";
    if (isDone)
      return `Collaborated with ${agentCount} agent${agentCount !== 1 ? "s" : ""}`;
    if (isRunning)
      return `Collaborating with ${agentCount} agent${agentCount !== 1 ? "s" : ""}`;
    return "Agent collaboration";
  })();

  const hasDetails =
    output?.agentsStates && Object.keys(output.agentsStates).length > 0;

  const summary = (
    <>
      <Icon
        icon="solar:users-group-two-rounded-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {label}
    </>
  );

  return (
    <ToolLayout
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={Boolean(hasDetails)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {hasDetails && (
        <div className="flex flex-col gap-1">
          {input?.prompt && (
            <p className="text-[11px] text-foreground/60">{input.prompt}</p>
          )}
          <AgentStatesBadge states={output!.agentsStates} />
        </div>
      )}
    </ToolLayout>
  );
});
