"use client";

import { memo, useEffect, useState } from "react";
import { Button, Disclosure, ScrollShadow, Spinner } from "@heroui/react";

import type { RendererProps } from "../renderer";

type ReadToolInput = {
  limit?: number;
  offset?: number;
  path: string;
};

type ReadToolOutput = {
  content: string | null;
  entries: string[];
  kind: "directory" | "file";
  lines: Array<{
    number: number;
    text: string;
  }>;
  nextOffset: number | null;
  path: string;
  totalEntries: number | null;
  totalLines: number | null;
  truncated: boolean;
};

function isReadToolInput(value: unknown): value is ReadToolInput {
  const candidate = value as { limit?: unknown; offset?: unknown; path?: unknown };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.path === "string" &&
    (candidate.limit === undefined || typeof candidate.limit === "number") &&
    (candidate.offset === undefined || typeof candidate.offset === "number")
  );
}

function isReadToolOutput(value: unknown): value is ReadToolOutput {
  const candidate = value as {
    content?: unknown;
    entries?: unknown;
    kind?: unknown;
    lines?: unknown;
    nextOffset?: unknown;
    path?: unknown;
    totalEntries?: unknown;
    totalLines?: unknown;
    truncated?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    (candidate.content === null || typeof candidate.content === "string") &&
    Array.isArray(candidate.entries) &&
    (candidate.kind === "directory" || candidate.kind === "file") &&
    Array.isArray(candidate.lines) &&
    (candidate.nextOffset === null || typeof candidate.nextOffset === "number") &&
    typeof candidate.path === "string" &&
    (candidate.totalEntries === null || typeof candidate.totalEntries === "number") &&
    (candidate.totalLines === null || typeof candidate.totalLines === "number") &&
    typeof candidate.truncated === "boolean"
  );
}

function getStatusChipClass(tone: "danger" | "muted" | "success") {
  switch (tone) {
    case "success":
      return "border-success/5 bg-success/10 text-success";
    case "danger":
      return "border-danger/20 bg-danger-soft text-danger-soft-foreground";
    default:
      return "border-border/60 bg-background/70 text-muted";
  }
}

function getReadStatus(part: RendererProps["part"], output: ReadToolOutput | null) {
  if (part.state === "output-error") {
    return { label: "Failed", tone: "danger" as const };
  }

  if (part.state === "output-available" && output) {
    return { label: "Success", tone: "success" as const };
  }

  return { label: "Running", tone: "muted" as const };
}

function buildReadBody({
  errorText,
  input,
  output,
}: {
  errorText?: string;
  input: ReadToolInput | null;
  output: ReadToolOutput | null;
}) {
  if (output?.content?.trim()) {
    return output.content;
  }

  if (output?.kind === "directory" && output.entries.length > 0) {
    return output.entries.join("\n");
  }

  if (errorText) {
    return errorText;
  }

  return `Reading ${input?.path ?? "."}`;
}

export const ReadTool = memo(function ReadTool({
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const readInput = hasInput && isReadToolInput(part.input) ? part.input : null;
  const readOutput = hasOutput && isReadToolOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const status = getReadStatus(part, readOutput);
  const isFinishedState =
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(readOutput));
  const [isExpanded, setIsExpanded] = useState(!isFinishedState);

  useEffect(() => {
    setIsExpanded(!isFinishedState);
  }, [isFinishedState, part.toolCallId]);

  const shownPath = readOutput?.path ?? readInput?.path ?? ".";
  const terminalText = buildReadBody({
    errorText: partErrorText,
    input: readInput,
    output: readOutput,
  });

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
      <div className="rounded-2xl border border-border/60 bg-surface/20 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-medium text-foreground">Read</p>
              <div
                className={`rounded-full flex items-center gap-1 border px-1.5 py-0.5 text-[10px] ${getStatusChipClass(status.tone)}`}
              >
                {status.label === "Running" ? (
                  <Spinner className="h-3 w-3" size="sm" />
                ) : null}
                <span className="truncate">{status.label}</span>
              </div>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-foreground/72">
              {shownPath}
            </p>
          </div>

          {isFinishedState ? (
            <Disclosure.Heading>
              <Button
                slot="trigger"
                size="sm"
                variant="tertiary"
                className="h-auto min-w-0 px-2 py-0.5 bg-background text-[10px] text-foreground transition-colors hover:text-foreground"
              >
                {isExpanded ? "Hide" : "Show"}
              </Button>
            </Disclosure.Heading>
          ) : null}
        </div>

        <Disclosure.Content>
          <Disclosure.Body>
            <div className="mt-2 overflow-hidden rounded-2xl border border-border/20 bg-surface">
              <div className="border-b border-border/50 px-3.5 py-2 text-[9px] text-foreground">
                Read
              </div>

              <div className="px-3.5 py-3">
                <ScrollShadow className="max-h-[220px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-6 text-foreground">
                  {terminalText}
                </ScrollShadow>

                {readOutput ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-foreground">
                    <span className="truncate">
                      {readOutput.kind === "file"
                        ? `${readOutput.totalLines ?? 0} lines`
                        : `${readOutput.totalEntries ?? 0} entries`}
                      {readOutput.truncated && readOutput.nextOffset
                        ? ` · next offset ${readOutput.nextOffset}`
                        : ""}
                    </span>
                    <span className="shrink-0 text-white/72">{status.label}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </Disclosure.Body>
        </Disclosure.Content>

        {partErrorText && part.state !== "output-error" ? (
          <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
            {partErrorText}
          </div>
        ) : null}
      </div>
    </Disclosure>
  );
});
