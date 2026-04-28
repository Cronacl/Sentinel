"use client";

import { Button, ScrollShadow } from "@heroui/react";
import { memo, useEffect, useState } from "react";

import type { RendererProps } from "./renderer";
import { ToolLayout } from "./renderers/shared/tool-layout";
import { getToolName, getToolStateLabel, stringifyJson } from "../types";

const MAX_TEXT_LENGTH = 5000;

function extractTextContent(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const textKeys = [
    "stdout",
    "stderr",
    "output",
    "content",
    "text",
    "message",
    "result",
    "digest",
  ];

  for (const key of textKeys) {
    const field = record[key];
    if (typeof field === "string" && field.trim()) {
      return field.trim();
    }
  }

  return null;
}

function TextOutput({ value }: { value: string }) {
  const capped =
    value.length > MAX_TEXT_LENGTH
      ? `${value.slice(0, MAX_TEXT_LENGTH)}\n\u2026(truncated)`
      : value;

  return (
    <ScrollShadow className="max-h-[300px] overflow-x-auto">
      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
        {capped}
      </pre>
    </ScrollShadow>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const json = stringifyJson(value);
  const capped =
    json.length > MAX_TEXT_LENGTH
      ? `${json.slice(0, MAX_TEXT_LENGTH)}\n\u2026(truncated)`
      : json;

  return (
    <ScrollShadow className="max-h-[300px] overflow-x-auto">
      <pre className="rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[12px] text-muted whitespace-pre-wrap wrap-break-word">
        {capped}
      </pre>
    </ScrollShadow>
  );
}

function OutputBlock({ value }: { value: unknown }) {
  const text = extractTextContent(value);
  if (text) {
    return (
      <div>
        <p className="mb-2 text-[11px] text-muted">Output</p>
        <TextOutput value={text} />
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-[11px] text-muted">Output</p>
      <JsonBlock value={value} />
    </div>
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

        {hasOutput ? <OutputBlock value={part.output} /> : null}
      </div>
    </ToolLayout>
  );
});
