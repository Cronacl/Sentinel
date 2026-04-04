"use client";

import { Button } from "@heroui/react";
import { memo } from "react";

import type { RendererProps } from "../renderer";
import { ToolLayout, useToolExpansionState } from "./shared/tool-layout";

function formatToolName(toolName: string) {
  return toolName
    .replace(/^gemini_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const GeminiRuntimeTool = memo(function GeminiRuntimeTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  if (part.type !== "dynamic-tool") {
    return null;
  }

  const hasInput = part.input !== undefined;
  const hasOutput = part.output !== undefined;
  const partErrorText =
    "errorText" in part ? (part.errorText as string) : undefined;
  const approvalId =
    part.approval &&
    typeof part.approval === "object" &&
    "id" in part.approval &&
    typeof part.approval.id === "string"
      ? part.approval.id
      : null;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;
  const isRunning =
    part.state === "input-available" ||
    part.state === "input-streaming" ||
    part.state === "approval-responded";
  const isError =
    part.state === "output-error" || part.state === "output-denied";
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded:
      part.state === "approval-requested" || part.state === "output-error",
    autoExpand:
      part.state === "approval-requested" || part.state === "output-error",
  });

  return (
    <ToolLayout
      actions={
        showApprovalActions ? (
          <div className="flex items-center gap-2">
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => approvalId && onApprove?.(approvalId)}
              size="sm"
            >
              Allow
            </Button>
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => approvalId && onDeny?.(approvalId)}
              size="sm"
              variant="ghost"
            >
              Deny
            </Button>
          </div>
        ) : undefined
      }
      footer={<span>{part.toolCallId}</span>}
      errorText={partErrorText}
      isError={isError}
      isExpandable={hasInput || hasOutput || !!partErrorText}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      summary={
        <>
          <span>{formatToolName(part.toolName)}</span>
          {showApprovalActions ? (
            <span className="text-foreground/40"> requires approval</span>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        {hasInput ? (
          <div>
            <p className="mb-2 text-[11px] text-muted">Input</p>
            <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[12px] text-muted">
              {renderJson(part.input)}
            </pre>
          </div>
        ) : null}

        {hasOutput ? (
          <div>
            <p className="mb-2 text-[11px] text-muted">Output</p>
            <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[12px] text-muted">
              {renderJson(part.output)}
            </pre>
          </div>
        ) : null}
      </div>
    </ToolLayout>
  );
});
