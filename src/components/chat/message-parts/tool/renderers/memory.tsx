"use client";

import { memo, useEffect, useState } from "react";
import { Button, Disclosure } from "@heroui/react";

import type { RendererProps } from "../renderer";

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

function getLabel(toolName: string) {
  switch (toolName) {
    case "search_memory":
      return "Search memory";
    case "save_memory":
      return "Save memory";
    default:
      return "Forget memory";
  }
}

function getStatusTone(part: RendererProps["part"]) {
  if (part.state === "output-error" || part.state === "output-denied") {
    return "border-danger/20 bg-danger-soft text-danger-soft-foreground";
  }

  if (part.state === "output-available") {
    return "border-success/5 bg-success/10 text-success";
  }

  return "border-border/60 bg-background/70 text-muted";
}

function getSummary(part: RendererProps["part"], toolName: string) {
  if (toolName === "search_memory" && "input" in part) {
    const input = part.input as SearchMemoryInput | undefined;
    return input?.query ?? "Search long-term memory";
  }

  if (toolName === "save_memory" && "input" in part) {
    const input = part.input as SaveMemoryInput | undefined;
    return input?.summary ?? input?.content ?? "Save a durable memory";
  }

  if (toolName === "forget_memory" && "input" in part) {
    const input = part.input as ForgetMemoryInput | undefined;
    return input?.memoryId ?? "Remove a stored memory";
  }

  return "Memory operation";
}

function MemoryResultBody({
  output,
  toolName,
}: {
  output: ForgetMemoryOutput | SaveMemoryOutput | SearchMemoryOutput | null;
  toolName: string;
}) {
  if (!output) {
    return null;
  }

  if (toolName === "search_memory") {
    const data = output as SearchMemoryOutput;
    return (
      <div className="space-y-3">
        <div className="text-muted text-xs">
          {data.resultCount} result{data.resultCount === 1 ? "" : "s"} •{" "}
          {data.resolvedScope}
        </div>
        <div className="space-y-2">
          {data.results.map((result) => (
            <div
              className="border-separator bg-background/60 rounded-lg border px-3 py-2.5"
              key={result.id}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-foreground">{result.kind}</span>
                <span className="text-muted">{result.scope}</span>
                <span className="text-muted">{result.id}</span>
              </div>
              <p className="text-foreground mt-1 text-sm">
                {result.summary ?? result.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (toolName === "save_memory") {
    const data = output as SaveMemoryOutput;
    return (
      <div className="text-sm">
        <p className="text-foreground">
          {data.status === "created" ? "Stored" : "Updated"} {data.kind} memory
          in {data.scope} scope.
        </p>
        <p className="text-muted mt-1">{data.memoryId}</p>
      </div>
    );
  }

  const data = output as ForgetMemoryOutput;
  return (
    <div className="text-sm">
      <p className="text-foreground">Removed stored {data.kind} memory.</p>
      <p className="text-muted mt-1">{data.memoryId}</p>
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
  const [isExpanded, setIsExpanded] = useState(false);
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

  useEffect(() => {
    setIsExpanded(
      part.state === "approval-requested" ||
        part.state === "output-error" ||
        part.state === "output-available",
    );
  }, [part.state]);

  return (
    <Disclosure.Root
      className="border-border/60 bg-surface/20 overflow-hidden rounded-2xl border"
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <p className="shrink-0 text-[12px] font-medium text-foreground">
            {getLabel(toolName)}
          </p>
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${getStatusTone(part)}`}
          >
            {part.state === "approval-requested"
              ? "Needs approval"
              : part.state === "output-error"
                ? "Failed"
                : part.state === "output-denied"
                  ? "Denied"
                  : part.state === "output-available"
                    ? "Completed"
                    : "Running"}
          </span>
          <p className="text-muted min-w-0 flex-1 truncate text-[11px]">
            {getSummary(part, toolName)}
          </p>
          <Disclosure.Trigger className="text-muted shrink-0 text-[10px] transition-colors hover:text-foreground">
            {isExpanded ? "Hide" : "Show"}
          </Disclosure.Trigger>
        </div>

        {part.state === "approval-requested" && approvalId ? (
          <div className="mt-2 flex items-center gap-2">
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
        ) : null}
      </div>

      <Disclosure.Content>
        <div className="border-border/60 border-t px-3 py-2">
          {isRunning ? (
            <p className="text-muted text-[11px]">Working with memory...</p>
          ) : part.state === "output-error" ? (
            <p className="text-danger-soft-foreground text-[11px]">
              {errorText ?? "Memory operation failed."}
            </p>
          ) : part.state === "output-denied" ? (
            <p className="text-muted text-[11px]">Memory operation denied.</p>
          ) : (
            <MemoryResultBody
              output={output ?? null}
              toolName={toolName}
            />
          )}
        </div>
      </Disclosure.Content>
    </Disclosure.Root>
  );
});
