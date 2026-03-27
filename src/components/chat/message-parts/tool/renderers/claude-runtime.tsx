"use client";

import { memo } from "react";

import type { RendererProps } from "../renderer";
import { ToolLayout } from "./shared/tool-layout";
import {
  extractTextFromContent,
  formatDuration,
  isClaudeToolErrorState,
  isClaudeToolRunningState,
  useClaudeExpansionState,
  unwrapClaudeInput,
} from "./claude-helpers";
import { renderClaudeApprovalActions } from "./claude-approval-actions";
import {
  ClaudeJsonBlock,
  ClaudeTextBlock,
  formatClaudeToolName,
  renderClaudeJson,
} from "./claude-content";

export const ClaudeRuntimeTool = memo(function ClaudeRuntimeTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  if (part.type !== "dynamic-tool") {
    return null;
  }

  const rawInput = part.input;
  const unwrapped = unwrapClaudeInput<Record<string, unknown>>(rawInput);
  const hasInput = unwrapped !== undefined && unwrapped !== null;
  const hasOutput = part.output !== undefined;
  const outputText = hasOutput ? extractTextFromContent(part.output) : null;
  const partErrorText =
    "errorText" in part ? (part.errorText as string) : undefined;
  const isRunning = isClaudeToolRunningState(part.state);
  const isError = isClaudeToolErrorState(part.state);
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested" || part.state === "output-error",
  );

  const elapsedTime =
    part.output &&
    typeof part.output === "object" &&
    "elapsedTimeSeconds" in part.output &&
    typeof (part.output as Record<string, unknown>).elapsedTimeSeconds ===
      "number"
      ? ((part.output as Record<string, unknown>).elapsedTimeSeconds as number)
      : null;
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });
  const summaryLabel =
    part.state === "output-denied"
      ? `${formatClaudeToolName(part.toolName)} denied`
      : part.state === "output-error"
        ? `${formatClaudeToolName(part.toolName)} failed`
        : formatClaudeToolName(part.toolName);

  return (
    <ToolLayout
      actions={actions}
      errorText={partErrorText}
      isError={isError}
      isExpandable={hasInput || hasOutput || !!partErrorText}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      summary={
        <>
          <span>{summaryLabel}</span>
          {actions ? (
            <span className="text-foreground/40"> requires approval</span>
          ) : null}
          {elapsedTime != null && isRunning && (
            <span className="ml-1.5 text-[11px] text-foreground/40">
              {formatDuration(elapsedTime * 1000)}
            </span>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {hasInput ? <ClaudeJsonBlock label="Input" value={unwrapped} /> : null}

        {hasOutput ? (
          typeof outputText === "string" ? (
            <ClaudeTextBlock label="Output" text={outputText} />
          ) : (
            <ClaudeTextBlock
              label="Output"
              text={renderClaudeJson(part.output)}
            />
          )
        ) : null}
      </div>
    </ToolLayout>
  );
});
