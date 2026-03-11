"use client";

import { memo, useEffect, useState } from "react";
import { Button, Disclosure, ScrollShadow, Spinner } from "@heroui/react";

import type { RendererProps } from "../renderer";

type GlobToolInput = {
  path?: string;
  pattern: string;
};

type GlobToolOutput = {
  files: string[];
  pattern: string;
  root: string;
  shownFiles: number;
  totalFiles: number;
  truncated: boolean;
};

function isGlobToolInput(value: unknown): value is GlobToolInput {
  const candidate = value as { path?: unknown; pattern?: unknown };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.pattern === "string" &&
    (candidate.path === undefined || typeof candidate.path === "string")
  );
}

function isGlobToolOutput(value: unknown): value is GlobToolOutput {
  const candidate = value as {
    files?: unknown;
    pattern?: unknown;
    root?: unknown;
    shownFiles?: unknown;
    totalFiles?: unknown;
    truncated?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    Array.isArray(candidate.files) &&
    typeof candidate.pattern === "string" &&
    typeof candidate.root === "string" &&
    typeof candidate.shownFiles === "number" &&
    typeof candidate.totalFiles === "number" &&
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

function getGlobStatus(part: RendererProps["part"], output: GlobToolOutput | null) {
  if (part.state === "output-error") {
    return { label: "Failed", tone: "danger" as const };
  }

  if (part.state === "output-available" && output) {
    return { label: "Success", tone: "success" as const };
  }

  return { label: "Running", tone: "muted" as const };
}

function buildGlobBody({
  errorText,
  output,
  pattern,
}: {
  errorText?: string;
  output: GlobToolOutput | null;
  pattern: string;
}) {
  if (output) {
    if (output.files.length === 0) {
      return `No files matched ${pattern}`;
    }

    return output.files.join("\n");
  }

  if (errorText) {
    return errorText;
  }

  return `Searching for ${pattern}`;
}

export const GlobTool = memo(function GlobTool({
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const globInput = hasInput && isGlobToolInput(part.input) ? part.input : null;
  const globOutput = hasOutput && isGlobToolOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const status = getGlobStatus(part, globOutput);
  const isFinishedState =
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(globOutput));
  const [isExpanded, setIsExpanded] = useState(!isFinishedState);

  useEffect(() => {
    setIsExpanded(!isFinishedState);
  }, [isFinishedState, part.toolCallId]);

  const pattern = globOutput?.pattern ?? globInput?.pattern ?? "";
  const root = globOutput?.root ?? globInput?.path ?? ".";
  const terminalText = buildGlobBody({
    errorText: partErrorText,
    output: globOutput,
    pattern,
  });

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
      <div className="rounded-2xl border border-border/60 bg-surface/20 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-medium text-foreground">Glob</p>
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
              {pattern} in {root}
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
                Glob
              </div>

              <div className="px-3.5 py-3">
                <ScrollShadow className="max-h-[220px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground">
                  {terminalText}
                </ScrollShadow>

                {globOutput ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-foreground">
                    <span className="truncate">
                      {globOutput.totalFiles} files
                      {globOutput.truncated
                        ? ` · showing ${globOutput.shownFiles}`
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
