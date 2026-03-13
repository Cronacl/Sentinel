"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import { ScrollShadow } from "@heroui/react";

import type { RendererProps } from "../renderer";
import { ToolLayout } from "./tool-layout";

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

function buildSummary(
  part: RendererProps["part"],
  pattern: string,
  output: GlobToolOutput | null,
): ReactNode {
  if (part.state === "output-error") {
    return (
      <>
        Glob failed for <span className="font-mono text-[12px]">{pattern}</span>
      </>
    );
  }

  if (part.state === "output-available" && output) {
    if (output.files.length === 0) {
      return (
        <>
          No files matched <span className="font-mono text-[12px]">{pattern}</span>
        </>
      );
    }
    return (
      <>
        Found{" "}
        <span className="text-foreground/50">{output.totalFiles}</span>{" "}
        file{output.totalFiles === 1 ? "" : "s"} matching{" "}
        <span className="font-mono text-[12px]">{pattern}</span>
      </>
    );
  }

  return (
    <>
      Searching for <span className="font-mono text-[12px]">{pattern}</span>
    </>
  );
}

export const GlobTool = memo(function GlobTool({
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const globInput = hasInput && isGlobToolInput(part.input) ? part.input : null;
  const globOutput = hasOutput && isGlobToolOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const isFinishedState =
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(globOutput));
  const isErrorState = part.state === "output-error";
  const [isExpanded, setIsExpanded] = useState(!isFinishedState);

  useEffect(() => {
    setIsExpanded(!isFinishedState);
  }, [isFinishedState, part.toolCallId]);

  const pattern = globOutput?.pattern ?? globInput?.pattern ?? "";
  const summary = buildSummary(part, pattern, globOutput);

  const bodyText = globOutput
    ? globOutput.files.length === 0
      ? `No files matched ${pattern}`
      : globOutput.files.join("\n")
    : partErrorText ?? `Searching for ${pattern}`;

  const footer = globOutput ? (
    <span>
      {globOutput.totalFiles} file{globOutput.totalFiles === 1 ? "" : "s"}
      {globOutput.truncated ? ` · showing ${globOutput.shownFiles}` : ""}
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
