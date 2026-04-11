"use client";

import { memo } from "react";

import type { RendererProps } from "../renderer";
import { ToolLayout } from "./shared/tool-layout";
import {
  CopilotJsonBlock,
  CopilotTextBlock,
  formatCopilotToolName,
  renderCopilotJson,
} from "./copilot-content";
import { renderCopilotApprovalActions } from "./copilot-approval-actions";
import {
  extractCopilotTextFromContent,
  formatDuration,
  isCopilotToolErrorState,
  isCopilotToolRunningState,
  unwrapCopilotInput,
  useCopilotExpansionState,
} from "./copilot-helpers";

export const CopilotRuntimeTool = memo(function CopilotRuntimeTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  if (part.type !== "dynamic-tool") {
    return null;
  }

  const rawInput = part.input;
  const unwrapped = unwrapCopilotInput<Record<string, unknown>>(rawInput);
  const hasInput = unwrapped !== undefined && unwrapped !== null;
  const hasOutput = part.output !== undefined;
  const outputText = hasOutput
    ? extractCopilotTextFromContent(part.output)
    : null;
  const partErrorText =
    "errorText" in part ? (part.errorText as string) : undefined;
  const isRunning = isCopilotToolRunningState(part.state);
  const isError = isCopilotToolErrorState(part.state);
  const [isExpanded, setIsExpanded] = useCopilotExpansionState(
    part,
    part.state === "approval-requested",
  );

  const elapsedTime =
    part.output &&
    typeof part.output === "object" &&
    "elapsedTimeSeconds" in part.output &&
    typeof (part.output as Record<string, unknown>).elapsedTimeSeconds ===
      "number"
      ? ((part.output as Record<string, unknown>).elapsedTimeSeconds as number)
      : null;
  const actions = renderCopilotApprovalActions({ onApprove, onDeny, part });
  const summaryLabel =
    part.state === "output-denied"
      ? `${formatCopilotToolName(part.toolName)} denied`
      : part.state === "output-error"
        ? `${formatCopilotToolName(part.toolName)} failed`
        : formatCopilotToolName(part.toolName);

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
          {elapsedTime != null && isRunning ? (
            <span className="ml-1.5 text-[11px] text-foreground/40">
              {formatDuration(elapsedTime * 1000)}
            </span>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        {hasInput ? <CopilotJsonBlock label="Input" value={unwrapped} /> : null}
        {hasOutput ? (
          outputText ? (
            <CopilotTextBlock label="Output" text={outputText} />
          ) : (
            <CopilotTextBlock
              label="Output"
              text={renderCopilotJson(part.output)}
            />
          )
        ) : null}
      </div>
    </ToolLayout>
  );
});
