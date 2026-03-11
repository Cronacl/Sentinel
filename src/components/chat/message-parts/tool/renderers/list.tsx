"use client";

import { memo, useEffect, useState } from "react";
import { Button, Disclosure, ScrollShadow, Spinner } from "@heroui/react";

import type { RendererProps } from "../renderer";

type ListToolInput = {
  ignore?: string[];
  path?: string;
};

type ListToolOutput = {
  directoryCount: number;
  entries: Array<{
    depth: number;
    kind: "directory" | "file";
    name: string;
    path: string;
  }>;
  fileCount: number;
  root: string;
  totalEntries: number;
  tree: string;
  truncated: boolean;
};

function isListToolInput(value: unknown): value is ListToolInput {
  const candidate = value as { ignore?: unknown; path?: unknown };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    (candidate.path === undefined || typeof candidate.path === "string") &&
    (candidate.ignore === undefined ||
      (Array.isArray(candidate.ignore) &&
        candidate.ignore.every((item) => typeof item === "string")))
  );
}

function isListToolOutput(value: unknown): value is ListToolOutput {
  const candidate = value as {
    directoryCount?: unknown;
    entries?: unknown;
    fileCount?: unknown;
    root?: unknown;
    totalEntries?: unknown;
    tree?: unknown;
    truncated?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.root === "string" &&
    typeof candidate.directoryCount === "number" &&
    typeof candidate.fileCount === "number" &&
    typeof candidate.totalEntries === "number" &&
    typeof candidate.tree === "string" &&
    typeof candidate.truncated === "boolean" &&
    Array.isArray(candidate.entries)
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

function getListStatus(part: RendererProps["part"], output: ListToolOutput | null) {
  if (part.state === "output-error") {
    return { label: "Failed", tone: "danger" as const };
  }

  if (part.state === "output-available" && output) {
    return { label: "Success", tone: "success" as const };
  }

  return { label: "Running", tone: "muted" as const };
}

function buildListBody({
  errorText,
  input,
  output,
}: {
  errorText?: string;
  input: ListToolInput | null;
  output: ListToolOutput | null;
}) {
  if (output?.tree.trim()) {
    return output.tree;
  }

  if (errorText) {
    return errorText;
  }

  const requestedPath = input?.path?.trim() || ".";
  return `Listing ${requestedPath}`;
}

export const ListTool = memo(function ListTool({
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const listInput = hasInput && isListToolInput(part.input) ? part.input : null;
  const listOutput = hasOutput && isListToolOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const status = getListStatus(part, listOutput);
  const isFinishedState =
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(listOutput));
  const [isExpanded, setIsExpanded] = useState(!isFinishedState);

  useEffect(() => {
    setIsExpanded(!isFinishedState);
  }, [isFinishedState, part.toolCallId]);

  const requestedPath = listInput?.path?.trim() || ".";
  const shownRoot = listOutput?.root ?? requestedPath;
  const terminalText = buildListBody({
    errorText: partErrorText,
    input: listInput,
    output: listOutput,
  });

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
      <div className="rounded-2xl border border-border/60 bg-surface/20 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-medium text-foreground">List</p>
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
              {shownRoot}
            </p>
            {listInput?.ignore?.length ? (
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted">
                Ignore: {listInput.ignore.join(", ")}
              </p>
            ) : null}
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
                List
              </div>

              <div className="px-3.5 py-3">
                <ScrollShadow className="max-h-[220px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-6 text-foreground">
                  {terminalText}
                </ScrollShadow>

                {listOutput ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-foreground">
                    <span className="truncate">
                      {listOutput.directoryCount} dirs · {listOutput.fileCount} files ·{" "}
                      {listOutput.totalEntries} shown
                      {listOutput.truncated ? " · truncated" : ""}
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
