"use client";

import { memo, useMemo } from "react";
import { ScrollShadow } from "@heroui/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout, useToolExpansionState } from "../shared/tool-layout";
import { MarkdownContent } from "../../../text/markdown-content";

type LoadDocumentInput = {
  attachmentIndex?: number;
  filename?: string;
  messageId?: string;
  path?: string;
  source: "workspace_path" | "message_attachment";
};

type LoadDocumentOutput = {
  content: string;
  filename: string;
  format: string;
  mediaType: string;
  requestedSource: "workspace_path" | "message_attachment";
  resolvedFromMessageId?: string | null;
  sheetNames?: string[];
  slideCount?: number;
  sourceKind: "workspace_path" | "message_attachment";
  truncated: boolean;
  warnings: string[];
};

function isLoadDocumentInput(value: unknown): value is LoadDocumentInput {
  const candidate = value as LoadDocumentInput | null;
  return (
    !!candidate &&
    typeof candidate === "object" &&
    (candidate.source === "workspace_path" ||
      candidate.source === "message_attachment")
  );
}

function isLoadDocumentOutput(value: unknown): value is LoadDocumentOutput {
  const candidate = value as LoadDocumentOutput | null;
  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.content === "string" &&
    typeof candidate.filename === "string" &&
    typeof candidate.format === "string" &&
    typeof candidate.mediaType === "string" &&
    typeof candidate.truncated === "boolean" &&
    Array.isArray(candidate.warnings)
  );
}

export const LoadDocumentTool = memo(function LoadDocumentTool({
  part,
}: RendererProps) {
  const loadInput =
    "input" in part && isLoadDocumentInput(part.input) ? part.input : null;
  const loadOutput =
    "output" in part && isLoadDocumentOutput(part.output) ? part.output : null;
  const isFinishedState =
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(loadOutput));
  const isErrorState = part.state === "output-error";
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: !isFinishedState,
  });

  const targetLabel =
    loadOutput?.filename ??
    loadInput?.path ??
    loadInput?.filename ??
    "document";
  const summary =
    part.state === "output-error"
      ? `Failed to load ${targetLabel}`
      : part.state === "output-available" && loadOutput
        ? `Loaded ${loadOutput.filename}`
        : `Loading ${targetLabel}`;

  const footer = loadOutput ? (
    <span>
      {loadOutput.format.toUpperCase()} · {loadOutput.mediaType}
      {loadOutput.sheetNames?.length
        ? ` · ${loadOutput.sheetNames.length} sheet${loadOutput.sheetNames.length === 1 ? "" : "s"}`
        : ""}
      {loadOutput.slideCount !== undefined
        ? ` · ${loadOutput.slideCount} slide${loadOutput.slideCount === 1 ? "" : "s"}`
        : ""}
      {loadOutput.truncated ? " · truncated" : ""}
    </span>
  ) : null;

  const body = useMemo(() => {
    if (!loadOutput) {
      return (
        <p className="font-mono text-[11px] text-foreground/50">
          Loading {targetLabel}...
        </p>
      );
    }

    return (
      <div className="space-y-3">
        {loadOutput.warnings.length > 0 ? (
          <div className="space-y-1">
            {loadOutput.warnings.map((warning) => (
              <p
                className="text-[11px] text-warning-soft-foreground"
                key={warning}
              >
                {warning}
              </p>
            ))}
          </div>
        ) : null}
        <ScrollShadow className="max-h-[320px]">
          <MarkdownContent text={loadOutput.content} />
        </ScrollShadow>
      </div>
    );
  }, [loadOutput, targetLabel]);

  return (
    <ToolLayout
      summary={summary}
      isRunning={!isFinishedState}
      isError={isErrorState}
      isExpandable={true}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={"errorText" in part ? part.errorText : undefined}
      footer={footer}
    >
      {body}
    </ToolLayout>
  );
});
