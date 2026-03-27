"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { renderClaudeApprovalActions } from "../claude-approval-actions";
import {
  ClaudeJsonBlock,
  ClaudeTextBlock,
  formatClaudeToolName,
  renderClaudeJson,
} from "../claude-content";
import {
  extractTextFromContent,
  isClaudeToolErrorState,
  isClaudeToolRunningState,
  tryParseClaudeOutput,
  useClaudeExpansionState,
  unwrapClaudeInput,
} from "../claude-helpers";

type ClaudeEnterWorktreeOutput = {
  message?: string;
  worktreeBranch?: string;
  worktreePath?: string;
};

type ClaudeConfigOutput = {
  error?: string;
  operation?: "get" | "set";
  previousValue?: unknown;
  setting?: string;
  success?: boolean;
  value?: unknown;
};

type ClaudeTaskStopOutput = {
  command?: string;
  message?: string;
  task_id?: string;
  task_type?: string;
};

function getSessionIcon(toolName: string) {
  switch (toolName) {
    case "claude_enterworktree":
      return "solar:folder-with-files-linear";
    case "claude_taskoutput":
    case "claude_taskstop":
      return "solar:playback-speed-linear";
    case "claude_config":
      return "solar:settings-linear";
    default:
      return "solar:widget-4-linear";
  }
}

function getSessionVerb(toolName: string) {
  switch (toolName) {
    case "claude_enterworktree":
      return "worktree";
    case "claude_taskoutput":
      return "task output";
    case "claude_taskstop":
      return "task stop";
    case "claude_config":
      return "configuration";
    default:
      return formatClaudeToolName(toolName).toLowerCase();
  }
}

function getSessionAction(
  toolName: string,
  input: Record<string, unknown> | null,
) {
  switch (toolName) {
    case "claude_config":
      return input && "value" in input
        ? {
            completed: "Updated",
            denied: "Configuration update denied",
            pending: "Update",
            running: "Updating",
          }
        : {
            completed: "Read",
            denied: "Configuration read denied",
            pending: "Read",
            running: "Reading",
          };
    case "claude_enterworktree":
      return {
        completed: "Entered",
        denied: "Worktree entry denied",
        pending: "Enter",
        running: "Entering",
      };
    case "claude_taskoutput":
      return {
        completed: "Read",
        denied: "Task output denied",
        pending: "Read",
        running: "Reading",
      };
    case "claude_taskstop":
      return {
        completed: "Stopped",
        denied: "Task stop denied",
        pending: "Stop",
        running: "Stopping",
      };
    default:
      return {
        completed: "Completed",
        denied: `${getSessionVerb(toolName)} denied`,
        pending: formatClaudeToolName(toolName),
        running: "Running",
      };
  }
}

function isEnterWorktreeOutput(
  value: unknown,
): value is ClaudeEnterWorktreeOutput {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    "worktreePath" in (value as Record<string, unknown>)
  );
}

function isConfigOutput(value: unknown): value is ClaudeConfigOutput {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    ("success" in (value as Record<string, unknown>) ||
      "setting" in (value as Record<string, unknown>))
  );
}

function isTaskStopOutput(value: unknown): value is ClaudeTaskStopOutput {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    ("task_id" in (value as Record<string, unknown>) ||
      "task_type" in (value as Record<string, unknown>))
  );
}

function buildSummary(
  part: RendererProps["part"],
  toolName: string,
  rawInput: Record<string, unknown> | null,
  outputText: string | null,
): ReactNode {
  const label = getSessionVerb(toolName);
  const action = getSessionAction(toolName, rawInput);

  if (part.state === "output-denied") {
    return <>{action.denied}</>;
  }

  if (part.state === "output-error") {
    return <>Failed {label}</>;
  }

  if (part.state === "approval-requested") {
    return (
      <>
        {action.pending} {label}
      </>
    );
  }

  if (part.state === "output-available") {
    return (
      <>
        {action.completed} {label}
      </>
    );
  }

  if (
    part.state === "approval-responded" ||
    part.state === "input-streaming" ||
    part.state === "input-available"
  ) {
    return (
      <>
        {action.running} {label}
      </>
    );
  }

  if (outputText?.trim()) {
    return outputText;
  }

  return formatClaudeToolName(toolName);
}

const isStructuredOutput = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

function buildFooter(toolName: string, rawInput: unknown, rawOutput: unknown) {
  if (toolName === "claude_enterworktree" && isEnterWorktreeOutput(rawOutput)) {
    return (
      <div className="flex flex-col gap-0.5">
        {rawOutput.worktreePath ? <span>{rawOutput.worktreePath}</span> : null}
        {rawOutput.worktreeBranch ? (
          <span>{rawOutput.worktreeBranch}</span>
        ) : null}
      </div>
    );
  }

  if (toolName === "claude_config" && isConfigOutput(rawOutput)) {
    return (
      <div className="flex items-center justify-between">
        <span>{rawOutput.setting ?? "setting"}</span>
        <span
          className={
            rawOutput.success === false ? "text-danger" : "text-success"
          }
        >
          {rawOutput.operation ?? "updated"}
        </span>
      </div>
    );
  }

  if (toolName === "claude_taskstop" && isTaskStopOutput(rawOutput)) {
    return (
      <div className="flex items-center justify-between">
        <span>{rawOutput.task_type ?? "task"}</span>
        <span>{rawOutput.task_id ?? ""}</span>
      </div>
    );
  }

  if (
    toolName === "claude_taskoutput" &&
    rawInput &&
    typeof rawInput === "object" &&
    "task_id" in (rawInput as Record<string, unknown>)
  ) {
    return (
      <span>{String((rawInput as Record<string, unknown>).task_id ?? "")}</span>
    );
  }

  return null;
}

export const ClaudeSessionUtilityTool = memo(function ClaudeSessionUtilityTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  if (part.type !== "dynamic-tool") {
    return null;
  }

  const rawInput = unwrapClaudeInput<Record<string, unknown>>(part.input);
  const rawOutput = part.output;
  const parsedOutput =
    tryParseClaudeOutput(rawOutput, isStructuredOutput) ?? rawOutput;
  const outputText = extractTextFromContent(rawOutput);
  const errorText = "errorText" in part ? part.errorText : undefined;
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });
  const isRunning = isClaudeToolRunningState(part.state);
  const isError = isClaudeToolErrorState(part.state);

  const footer = buildFooter(part.toolName, rawInput, parsedOutput);
  const hasOutput = rawOutput !== undefined;
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested",
  );

  return (
    <ToolLayout
      actions={actions}
      errorText={errorText}
      footer={footer}
      isError={isError}
      isExpandable={Boolean(rawInput) || hasOutput || Boolean(errorText)}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      summary={
        <>
          <Icon
            className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            icon={getSessionIcon(part.toolName)}
          />
          {buildSummary(part, part.toolName, rawInput, outputText)}
        </>
      }
    >
      <div className="space-y-3">
        {rawInput ? <ClaudeJsonBlock label="Input" value={rawInput} /> : null}
        {hasOutput ? (
          outputText ? (
            <ClaudeTextBlock label="Output" text={outputText} />
          ) : (
            <ClaudeTextBlock
              label="Output"
              text={renderClaudeJson(rawOutput)}
            />
          )
        ) : null}
      </div>
    </ToolLayout>
  );
});
