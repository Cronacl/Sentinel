"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { MarkdownContent } from "../../../text/markdown-content";
import { ToolLayout } from "../shared/tool-layout";
import { renderClaudeApprovalActions } from "../claude-approval-actions";
import {
  extractTextFromContent,
  formatDuration,
  isClaudeToolErrorState,
  isClaudeToolRunningState,
  tryParseClaudeOutput,
  useClaudeExpansionState,
  unwrapClaudeInput,
} from "../claude-helpers";

type ClaudeAgentInput = {
  description: string;
  isolation?: "worktree";
  max_turns?: number;
  model?: "haiku" | "opus" | "sonnet";
  name?: string;
  prompt: string;
  run_in_background?: boolean;
  subagent_type: string;
};

type ClaudeAgentCompletedOutput = {
  agentId: string;
  content: Array<{ text: string; type: "text" }>;
  prompt: string;
  status: "completed";
  totalDurationMs?: number;
  totalTokens?: number;
  totalToolUseCount?: number;
};

type ClaudeAgentAsyncOutput = {
  agentId: string;
  description: string;
  outputFile: string;
  prompt: string;
  status: "async_launched";
};

type ClaudeAgentOutput = ClaudeAgentCompletedOutput | ClaudeAgentAsyncOutput;

function isAgentInput(value: unknown): value is ClaudeAgentInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.prompt === "string" && typeof v.description === "string";
}

function isAgentOutput(value: unknown): value is ClaudeAgentOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "string" && typeof v.agentId === "string";
}

function isCompletedOutput(
  output: ClaudeAgentOutput,
): output is ClaudeAgentCompletedOutput {
  return output.status === "completed";
}

export function getAgentResultText(output: ClaudeAgentCompletedOutput): string {
  return output.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

function AgentSummary(
  part: RendererProps["part"],
  input: ClaudeAgentInput,
  output: ClaudeAgentOutput | null,
): ReactNode {
  const label = input.name ?? input.subagent_type ?? "agent";

  if (part.state === "output-denied") {
    return <>Agent denied: {label}</>;
  }

  if (part.state === "output-error") {
    return <>Agent failed: {label}</>;
  }

  if (output && isCompletedOutput(output)) {
    return (
      <>
        Agent completed: {input.description}
        {output.totalDurationMs != null && (
          <span className="ml-1.5 text-[11px] text-foreground/40">
            {formatDuration(output.totalDurationMs)}
          </span>
        )}
      </>
    );
  }

  if (output?.status === "async_launched") {
    return <>Agent launched in background: {input.description}</>;
  }

  if (part.state === "output-available") {
    return <>Agent completed: {input.description}</>;
  }

  if (
    part.state === "input-available" ||
    part.state === "input-streaming" ||
    part.state === "approval-responded"
  ) {
    return <>Running agent: {input.description}</>;
  }

  if (part.state === "approval-requested") {
    return <>Launch agent: {input.description}</>;
  }

  return <>Running agent: {input.description}</>;
}

export const ClaudeAgentTool = memo(function ClaudeAgentTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const unwrapped = unwrapClaudeInput<ClaudeAgentInput>(
    hasInput ? part.input : undefined,
  );
  const agentInput = unwrapped && isAgentInput(unwrapped) ? unwrapped : null;
  const agentOutput = hasOutput
    ? tryParseClaudeOutput(part.output, isAgentOutput)
    : null;
  const fallbackOutputText =
    hasOutput && !agentOutput ? extractTextFromContent(part.output) : null;

  const isRunning = isClaudeToolRunningState(part.state);
  const isError = isClaudeToolErrorState(part.state);

  if (!agentInput) return null;

  const resultText =
    agentOutput && isCompletedOutput(agentOutput)
      ? getAgentResultText(agentOutput)
      : fallbackOutputText;
  const hasContent = Boolean(resultText?.trim());
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested" || isRunning,
  );

  const summary = (
    <>
      <Icon
        icon="solar:cpu-bolt-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {AgentSummary(part, agentInput, agentOutput)}
    </>
  );
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });

  return (
    <ToolLayout
      actions={actions}
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={hasContent}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        agentOutput && isCompletedOutput(agentOutput) ? (
          <div className="flex items-center justify-between">
            <span>
              {agentInput.subagent_type}
              {agentInput.model ? ` · ${agentInput.model}` : ""}
            </span>
            <div className="flex items-center gap-2">
              {agentOutput.totalToolUseCount != null && (
                <span>{agentOutput.totalToolUseCount} tools</span>
              )}
              {agentOutput.totalTokens != null && (
                <span>
                  {Math.round(agentOutput.totalTokens / 1000)}k tokens
                </span>
              )}
            </div>
          </div>
        ) : null
      }
    >
      {hasContent && resultText && (
        <ScrollShadow className="max-h-[300px] overflow-x-auto">
          <div className="[&_.sentinel-prose]:text-[13px] [&_.sentinel-prose_h1]:text-[1.15em] [&_.sentinel-prose_h2]:text-[1.05em] [&_.sentinel-prose_h3]:text-[0.95em]">
            <MarkdownContent text={resultText} />
          </div>
        </ScrollShadow>
      )}
    </ToolLayout>
  );
});
