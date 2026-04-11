"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { getToolName } from "../../../types";
import { ToolLayout } from "../shared/tool-layout";
import { renderCopilotApprovalActions } from "../copilot-approval-actions";
import {
  CopilotJsonBlock,
  CopilotTextBlock,
  formatCopilotToolName,
  renderCopilotJson,
} from "../copilot-content";
import { MarkdownContent } from "../../../text/markdown-content";
import {
  extractCopilotTextFromContent,
  isCopilotToolErrorState,
  isCopilotToolRunningState,
  tryParseCopilotOutput,
  unwrapCopilotInput,
  useCopilotExpansionState,
} from "../copilot-helpers";

type CopilotConfigOutput = {
  error?: string;
  operation?: "get" | "set";
  previousValue?: unknown;
  setting?: string;
  success?: boolean;
  value?: unknown;
};

type CopilotTaskStopOutput = {
  command?: string;
  message?: string;
  task_id?: string;
  task_type?: string;
};

function getSessionIcon(toolName: string) {
  switch (toolName) {
    case "copilot_report_intent":
      return "solar:lightbulb-linear";
    case "copilot_fetch_copilot_cli_documentation":
      return "solar:book-linear";
    case "copilot_exit_plan_mode":
      return "solar:exit-linear";
    case "copilot_task_complete":
      return "solar:check-circle-linear";
    case "copilot_sql":
      return "solar:database-linear";
    case "copilot_lsp":
      return "solar:code-square-linear";
    case "copilot_skill":
      return "solar:magic-stick-3-linear";
    case "copilot_config":
      return "solar:settings-linear";
    case "copilot_task_stop":
    case "copilot_taskstop":
      return "solar:playback-speed-linear";
    case "copilot_task_output":
    case "copilot_taskoutput":
      return "solar:playback-speed-linear";
    default:
      return "solar:widget-4-linear";
  }
}

function getSessionVerb(toolName: string) {
  switch (toolName) {
    case "copilot_report_intent":
      return "intent report";
    case "copilot_fetch_copilot_cli_documentation":
      return "documentation lookup";
    case "copilot_exit_plan_mode":
      return "exit plan mode";
    case "copilot_task_complete":
      return "task completion";
    case "copilot_sql":
      return "SQL query";
    case "copilot_lsp":
      return "LSP operation";
    case "copilot_skill":
      return "skill invocation";
    case "copilot_config":
      return "configuration";
    case "copilot_task_stop":
    case "copilot_taskstop":
      return "task stop";
    case "copilot_task_output":
    case "copilot_taskoutput":
      return "task output";
    default:
      return formatCopilotToolName(toolName).toLowerCase();
  }
}

function getSessionAction(
  toolName: string,
  input: Record<string, unknown> | null,
) {
  switch (toolName) {
    case "copilot_config":
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
    case "copilot_task_stop":
    case "copilot_taskstop":
      return {
        completed: "Stopped",
        denied: "Task stop denied",
        pending: "Stop",
        running: "Stopping",
      };
    case "copilot_task_output":
    case "copilot_taskoutput":
      return {
        completed: "Read",
        denied: "Task output denied",
        pending: "Read",
        running: "Reading",
      };
    case "copilot_task_complete":
      return {
        completed: "Completed",
        denied: "Task completion denied",
        pending: "Complete",
        running: "Completing",
      };
    case "copilot_exit_plan_mode":
      return {
        completed: "Exited",
        denied: "Exit denied",
        pending: "Exit",
        running: "Exiting",
      };
    default:
      return {
        completed: "Completed",
        denied: `${getSessionVerb(toolName)} denied`,
        pending: formatCopilotToolName(toolName),
        running: "Running",
      };
  }
}

function isConfigOutput(value: unknown): value is CopilotConfigOutput {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    ("success" in (value as Record<string, unknown>) ||
      "setting" in (value as Record<string, unknown>))
  );
}

function isTaskStopOutput(value: unknown): value is CopilotTaskStopOutput {
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

  return formatCopilotToolName(toolName);
}

const isStructuredOutput = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

function buildFooter(toolName: string, rawInput: unknown, rawOutput: unknown) {
  if (toolName === "copilot_config" && isConfigOutput(rawOutput)) {
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

  if (
    (toolName === "copilot_task_stop" || toolName === "copilot_taskstop") &&
    isTaskStopOutput(rawOutput)
  ) {
    return (
      <div className="flex items-center justify-between">
        <span>{rawOutput.task_type ?? "task"}</span>
        <span>{rawOutput.task_id ?? ""}</span>
      </div>
    );
  }

  if (
    (toolName === "copilot_task_output" || toolName === "copilot_taskoutput") &&
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

function renderIntentContent(input: Record<string, unknown> | null) {
  const intent = typeof input?.intent === "string" ? input.intent : null;
  if (!intent) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
      <p className="text-[13px] text-foreground/70">{intent}</p>
    </div>
  );
}

function renderSqlContent(
  input: Record<string, unknown> | null,
  outputText: string | null,
) {
  const query = typeof input?.query === "string" ? input.query : null;
  const description =
    typeof input?.description === "string" ? input.description : null;
  return (
    <div className="space-y-3">
      {description && (
        <p className="text-[12px] text-foreground/50">{description}</p>
      )}
      {query && (
        <div>
          <ScrollShadow className="max-h-[150px] overflow-x-auto">
            <pre className="rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[11px] leading-[18px] text-foreground/70 whitespace-pre-wrap wrap-break-word">
              {query}
            </pre>
          </ScrollShadow>
        </div>
      )}
      {outputText && (
        <div>
          <ScrollShadow className="max-h-[300px] overflow-x-auto">
            <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
              <div className="[&_.sentinel-prose]:text-[13px] [&_.sentinel-prose_table]:w-full [&_.sentinel-prose_th]:text-left [&_.sentinel-prose_td]:text-left">
                <MarkdownContent text={outputText} />
              </div>
            </div>
          </ScrollShadow>
        </div>
      )}
    </div>
  );
}

function renderGenericSessionContent(
  rawInput: Record<string, unknown> | null,
  rawOutput: unknown,
  outputText: string | null,
) {
  const hasOutput = rawOutput !== undefined;
  return (
    <div className="space-y-3">
      {rawInput ? <CopilotJsonBlock label="Input" value={rawInput} /> : null}
      {hasOutput ? (
        outputText ? (
          <CopilotTextBlock label="Output" text={outputText} />
        ) : (
          <CopilotTextBlock
            label="Output"
            text={renderCopilotJson(rawOutput)}
          />
        )
      ) : null}
    </div>
  );
}

export const CopilotSessionUtilityTool = memo(
  function CopilotSessionUtilityTool({
    onApprove,
    onDeny,
    part,
  }: RendererProps) {
    if (part.type !== "dynamic-tool") {
      return null;
    }

    const rawInput = unwrapCopilotInput<Record<string, unknown>>(part.input);
    const rawOutput = part.output;
    const parsedOutput =
      tryParseCopilotOutput(rawOutput, isStructuredOutput) ?? rawOutput;
    const outputText = extractCopilotTextFromContent(rawOutput);
    const errorText = "errorText" in part ? part.errorText : undefined;
    const actions = renderCopilotApprovalActions({ onApprove, onDeny, part });
    const isRunning = isCopilotToolRunningState(part.state);
    const isError = isCopilotToolErrorState(part.state);
    const toolName = part.toolName;
    const isIntent = toolName === "copilot_report_intent";
    const isSql = toolName === "copilot_sql";

    const footer = buildFooter(toolName, rawInput, parsedOutput);
    const hasOutput = rawOutput !== undefined;
    const [isExpanded, setIsExpanded] = useCopilotExpansionState(
      part,
      part.state === "approval-requested",
    );

    const isExpandable = isIntent
      ? Boolean(rawInput?.intent)
      : isSql
        ? Boolean(rawInput?.query) || Boolean(outputText)
        : Boolean(rawInput) || hasOutput || Boolean(errorText);

    let content: ReactNode;
    if (isIntent) {
      content = renderIntentContent(rawInput);
    } else if (isSql) {
      content = renderSqlContent(rawInput, outputText);
    } else {
      content = renderGenericSessionContent(rawInput, rawOutput, outputText);
    }

    const sqlStatementCount =
      isSql && outputText
        ? (/Executed (\d+) statement/i.exec(outputText)?.[1] ?? null)
        : null;

    return (
      <ToolLayout
        actions={actions}
        errorText={errorText}
        footer={
          isSql && sqlStatementCount ? (
            <div className="flex items-center justify-between">
              <span>
                {sqlStatementCount} statement
                {sqlStatementCount !== "1" ? "s" : ""}
              </span>
              <span className={isError ? "text-danger" : "text-success"}>
                {isError ? "Failed" : "Completed"}
              </span>
            </div>
          ) : (
            footer
          )
        }
        isError={isError}
        isExpandable={isExpandable}
        isExpanded={isExpanded}
        isRunning={isRunning}
        onExpandedChange={setIsExpanded}
        summary={
          <>
            <Icon
              className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
              icon={getSessionIcon(toolName)}
            />
            {buildSummary(part, toolName, rawInput)}
          </>
        }
      >
        {content}
      </ToolLayout>
    );
  },
);
