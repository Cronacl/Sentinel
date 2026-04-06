"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";

import type { RendererProps } from "./renderer";
import { ToolLayout } from "./renderers/shared/tool-layout";
import { getToolName, getToolStateLabel, stringifyJson } from "../types";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[12px] text-muted">
      {stringifyJson(value)}
    </pre>
  );
}

export const GenericTool = memo(function GenericTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part);
  const stateLabel = getToolStateLabel(part.state);
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;
  const isRunningState =
    part.state === "approval-responded" ||
    part.state === "input-streaming" ||
    part.state === "input-available";
  const isErrorState =
    part.state === "output-error" || part.state === "output-denied";
  const isFinishedState =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied";
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
  }, [part.toolCallId]);

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
      errorText={isErrorState ? partErrorText : undefined}
      footer={
        <div className="flex items-center justify-between">
          <span>{stateLabel}</span>
          <span>{part.toolCallId}</span>
        </div>
      }
      isError={isErrorState}
      isExpandable={hasInput || hasOutput}
      isExpanded={isExpanded}
      isRunning={isRunningState}
      onExpandedChange={setIsExpanded}
      summary={
        <>
          <span className="capitalize">{toolName.replace(/[-_]/g, " ")}</span>
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
            <JsonBlock value={part.input} />
          </div>
        ) : null}

        {hasOutput ? (
          <div>
            <p className="mb-2 text-[11px] text-muted">Output</p>
            <JsonBlock value={part.output} />
          </div>
        ) : null}
      </div>
    </ToolLayout>
  );
});
