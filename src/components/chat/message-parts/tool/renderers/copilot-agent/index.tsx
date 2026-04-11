"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { getToolName } from "../../../types";
import { MarkdownContent } from "../../../text/markdown-content";
import { ToolLayout } from "../shared/tool-layout";
import { renderCopilotApprovalActions } from "../copilot-approval-actions";
import {
  extractCopilotTextFromContent,
  formatDuration,
  isCopilotToolErrorState,
  isCopilotToolRunningState,
  tryParseCopilotOutput,
  unwrapCopilotInput,
  useCopilotExpansionState,
} from "../copilot-helpers";

type CopilotAgentInput = {
  agent_type?: string;
  description?: string;
  model?: string;
  prompt?: string;
  task_id?: string;
};

type CopilotAgentCompletedOutput = {
  agentId?: string;
  content?: Array<{ text: string; type: "text" }>;
  status: "completed";
  taskId?: string;
  totalDurationMs?: number;
  totalTokens?: number;
  totalToolUseCount?: number;
};

type CopilotAgentAsyncOutput = {
  agentId?: string;
  description?: string;
  outputFile?: string;
  status: "async_launched" | "launched";
  taskId?: string;
};

type CopilotAgentOutput = CopilotAgentCompletedOutput | CopilotAgentAsyncOutput;

function isAgentOutput(value: unknown): value is CopilotAgentOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.status === "string" ||
    typeof v.agentId === "string" ||
    typeof v.taskId === "string"
  );
}

function isCompletedOutput(
  output: CopilotAgentOutput,
): output is CopilotAgentCompletedOutput {
  return output.status === "completed";
}

function getAgentResultText(output: CopilotAgentCompletedOutput): string {
  if (!output.content) return "";
  return output.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

function getAgentSummary(
  part: RendererProps["part"],
  input: CopilotAgentInput | null,
  output: CopilotAgentOutput | null,
): ReactNode {
  const toolName = getToolName(part);
  const label =
    input?.description ??
    input?.agent_type ??
    input?.task_id ??
    (toolName === "copilot_list_agents" ? "agents" : "task");

  if (toolName === "copilot_list_agents") {
    return part.state === "output-available"
      ? "Listed agents"
      : "Listing agents";
  }

  if (toolName === "copilot_read_agent") {
    return part.state === "output-available"
      ? `Read agent ${label}`
      : `Reading agent ${label}`;
  }

  if (part.state === "output-denied") {
    return <>Agent denied: {label}</>;
  }

  if (part.state === "output-error") {
    return <>Agent failed: {label}</>;
  }

  if (output && isCompletedOutput(output)) {
    return (
      <>
        Agent completed: {label}
        {output.totalDurationMs != null && (
          <span className="ml-1.5 text-[11px] text-foreground/40">
            {formatDuration(output.totalDurationMs)}
          </span>
        )}
      </>
    );
  }

  if (
    output &&
    (output.status === "async_launched" || output.status === "launched")
  ) {
    return <>Agent launched in background: {label}</>;
  }

  if (part.state === "output-available") {
    return <>Agent completed: {label}</>;
  }

  if (part.state === "approval-requested") {
    return <>Launch agent: {label}</>;
  }

  return <>Running agent: {label}</>;
}

export const CopilotAgentTool = memo(function CopilotAgentTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const input = unwrapCopilotInput<CopilotAgentInput>(
    hasInput ? part.input : undefined,
  );
  const agentOutput = hasOutput
    ? tryParseCopilotOutput(part.output, isAgentOutput)
    : null;
  const fallbackOutputText =
    hasOutput && !agentOutput
      ? extractCopilotTextFromContent(part.output)
      : null;
  const isRunning = isCopilotToolRunningState(part.state);
  const isError = isCopilotToolErrorState(part.state);
  const [isExpanded, setIsExpanded] = useCopilotExpansionState(
    part,
    part.state === "approval-requested",
  );
  const actions = renderCopilotApprovalActions({ onApprove, onDeny, part });

  const resultText =
    agentOutput && isCompletedOutput(agentOutput)
      ? getAgentResultText(agentOutput)
      : fallbackOutputText;
  const hasContent = Boolean(resultText?.trim());

  return (
    <ToolLayout
      actions={actions}
      isError={isError}
      isExpandable={hasContent}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      footer={
        agentOutput && isCompletedOutput(agentOutput) ? (
          <div className="flex items-center justify-between">
            <span>
              {input?.agent_type ?? "agent"}
              {input?.model ? ` · ${input.model}` : ""}
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
      summary={
        <>
          <Icon
            className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            icon="solar:users-group-rounded-linear"
          />
          {getAgentSummary(part, input, agentOutput)}
        </>
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
