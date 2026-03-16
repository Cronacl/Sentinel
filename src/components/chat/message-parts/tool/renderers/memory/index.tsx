"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import { Button } from "@heroui/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";

type SearchMemoryInput = {
  limit?: number;
  query: string;
  scope?: string;
};

type SearchMemoryOutput = {
  query: string;
  resolvedScope: string;
  resultCount: number;
  results: Array<{
    content: string;
    id: string;
    kind: string;
    scope: string;
    score: number;
    summary: string | null;
    workspaceId: string | null;
  }>;
};

type SaveMemoryInput = {
  content: string;
  kind: string;
  scope?: string;
  summary?: string;
};

type SaveMemoryOutput = {
  kind: string;
  memoryId: string;
  scope: string;
  status: "created" | "updated";
  summary: string | null;
};

type ForgetMemoryInput = {
  memoryId: string;
};

type ForgetMemoryOutput = {
  deleted: boolean;
  kind: string;
  memoryId: string;
  summary: string | null;
};

function getToolName(part: RendererProps["part"]) {
  return part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
}

function buildSummary(
  part: RendererProps["part"],
  toolName: string,
): ReactNode {
  const isError =
    part.state === "output-error" || part.state === "output-denied";
  const isDone = part.state === "output-available";

  if (toolName === "search_memory") {
    const input =
      "input" in part
        ? (part.input as SearchMemoryInput | undefined)
        : undefined;
    const output =
      isDone && "output" in part
        ? (part.output as SearchMemoryOutput | undefined)
        : undefined;

    if (isError) return <>Memory search failed</>;
    if (output) {
      return (
        <>
          Searched memory
          <span className="ml-1.5 text-[11px] text-foreground/40">
            {output.resultCount} result{output.resultCount === 1 ? "" : "s"}
          </span>
        </>
      );
    }
    return <>Searching memory for &ldquo;{input?.query ?? "..."}&rdquo;</>;
  }

  if (toolName === "save_memory") {
    const output =
      isDone && "output" in part
        ? (part.output as SaveMemoryOutput | undefined)
        : undefined;
    if (isError) return <>Failed to save memory</>;
    if (output) {
      return (
        <>
          {output.status === "created" ? "Saved" : "Updated"} {output.kind}{" "}
          memory
        </>
      );
    }
    return <>Saving memory...</>;
  }

  const output =
    isDone && "output" in part
      ? (part.output as ForgetMemoryOutput | undefined)
      : undefined;
  if (isError) return <>Failed to forget memory</>;
  if (output) return <>Forgot {output.kind} memory</>;
  return <>Forgetting memory...</>;
}

function MemoryResultBody({
  output,
  toolName,
}: {
  output: ForgetMemoryOutput | SaveMemoryOutput | SearchMemoryOutput | null;
  toolName: string;
}) {
  if (!output) return null;

  if (toolName === "search_memory") {
    const data = output as SearchMemoryOutput;
    return (
      <div className="space-y-2">
        {data.results.map((result) => (
          <div
            className="rounded-lg border border-border/30 bg-background/40 px-2.5 py-2"
            key={result.id}
          >
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-foreground/50">
              <span className="font-medium text-foreground/70">
                {result.kind}
              </span>
              <span>{result.scope}</span>
            </div>
            <p className="mt-0.5 text-[12px] text-foreground/80">
              {result.summary ?? result.content}
            </p>
          </div>
        ))}
      </div>
    );
  }

  if (toolName === "save_memory") {
    const data = output as SaveMemoryOutput;
    return (
      <div className="text-[11px]">
        <p className="text-foreground/70">
          {data.status === "created" ? "Stored" : "Updated"} {data.kind} memory
          in {data.scope} scope.
        </p>
        <p className="mt-0.5 text-foreground/40">{data.memoryId}</p>
      </div>
    );
  }

  const data = output as ForgetMemoryOutput;
  return (
    <div className="text-[11px]">
      <p className="text-foreground/70">Removed {data.kind} memory.</p>
      <p className="mt-0.5 text-foreground/40">{data.memoryId}</p>
    </div>
  );
}

export const MemoryTool = memo(function MemoryTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part);
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const output =
    "output" in part
      ? (part.output as
          | ForgetMemoryOutput
          | SaveMemoryOutput
          | SearchMemoryOutput
          | undefined)
      : undefined;
  const errorText = "errorText" in part ? part.errorText : undefined;
  const isRunning =
    part.state === "approval-responded" ||
    part.state === "input-streaming" ||
    part.state === "input-available";
  const isFinished =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied";
  const isDenied = part.state === "output-denied";
  const isError = part.state === "output-error";
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;

  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(
      part.state === "approval-requested" || part.state === "output-error",
    );
  }, [part.state]);

  const summary = buildSummary(part, toolName);

  const body = isRunning ? (
    <p className="text-[11px] text-foreground/50">Working with memory...</p>
  ) : isError ? (
    <p className="text-[11px] text-danger-soft-foreground">
      {errorText ?? "Memory operation failed."}
    </p>
  ) : isDenied ? (
    <p className="text-[11px] text-muted">Memory operation denied.</p>
  ) : (
    <MemoryResultBody output={output ?? null} toolName={toolName} />
  );

  const footer =
    toolName === "search_memory" && output ? (
      <span>
        {(output as SearchMemoryOutput).resultCount} result
        {(output as SearchMemoryOutput).resultCount === 1 ? "" : "s"} ·{" "}
        {(output as SearchMemoryOutput).resolvedScope}
      </span>
    ) : null;

  return (
    <ToolLayout
      summary={summary}
      isRunning={isRunning}
      isError={isError || isDenied}
      isExpandable={isFinished}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={
        errorText && part.state !== "output-error" ? errorText : undefined
      }
      footer={footer}
      actions={
        showApprovalActions ? (
          <div className="flex items-center gap-2">
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => onApprove?.(approvalId)}
              size="sm"
            >
              Allow
            </Button>
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => onDeny?.(approvalId)}
              size="sm"
              variant="tertiary"
            >
              Deny
            </Button>
          </div>
        ) : undefined
      }
    >
      {body}
    </ToolLayout>
  );
});
