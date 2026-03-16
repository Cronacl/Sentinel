"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import { ScrollShadow } from "@heroui/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";

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

function buildSummary(
  part: RendererProps["part"],
  shownRoot: string,
  output: ListToolOutput | null,
): ReactNode {
  if (part.state === "output-error") {
    return (
      <>
        Failed to list{" "}
        <span className="font-mono text-[12px]">{shownRoot}</span>
      </>
    );
  }

  if (part.state === "output-available" && output) {
    return (
      <>
        Listed{" "}
        <span className="font-mono text-[12px]">{shownRoot}</span>
        <span className="ml-1.5 text-[11px] text-foreground/40">
          {output.directoryCount} dir{output.directoryCount === 1 ? "" : "s"}, {output.fileCount} file{output.fileCount === 1 ? "" : "s"}
        </span>
      </>
    );
  }

  return (
    <>
      Listing{" "}
      <span className="font-mono text-[12px]">{shownRoot}</span>
    </>
  );
}

export const ListTool = memo(function ListTool({
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const listInput = hasInput && isListToolInput(part.input) ? part.input : null;
  const listOutput = hasOutput && isListToolOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const isFinishedState =
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(listOutput));
  const isErrorState = part.state === "output-error";
  const [isExpanded, setIsExpanded] = useState(!isFinishedState);

  useEffect(() => {
    setIsExpanded(!isFinishedState);
  }, [isFinishedState, part.toolCallId]);

  const requestedPath = listInput?.path?.trim() || ".";
  const shownRoot = listOutput?.root ?? requestedPath;
  const summary = buildSummary(part, shownRoot, listOutput);

  const bodyText = listOutput?.tree.trim()
    ? listOutput.tree
    : partErrorText ?? `Listing ${requestedPath}`;

  const footer = listOutput ? (
    <span>
      {listOutput.directoryCount} dir{listOutput.directoryCount === 1 ? "" : "s"} · {listOutput.fileCount} file{listOutput.fileCount === 1 ? "" : "s"} · {listOutput.totalEntries} shown
      {listOutput.truncated ? " · truncated" : ""}
    </span>
  ) : null;

  return (
    <ToolLayout
      summary={summary}
      isRunning={!isFinishedState}
      isError={isErrorState}
      isExpandable={isFinishedState}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={partErrorText && part.state !== "output-error" ? partErrorText : undefined}
      footer={footer}
    >
      <ScrollShadow className="max-h-[220px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
        {bodyText}
      </ScrollShadow>
    </ToolLayout>
  );
});
