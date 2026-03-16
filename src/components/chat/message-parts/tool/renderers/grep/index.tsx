"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import { ScrollShadow } from "@heroui/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";

type GrepToolInput = {
  include?: string;
  path?: string;
  pattern: string;
};

type GrepToolOutput = {
  files: Array<{
    matches: Array<{
      lineNumber: number;
      text: string;
    }>;
    path: string;
  }>;
  hasPartialErrors: boolean;
  include: string | null;
  pattern: string;
  root: string;
  shownMatches: number;
  totalMatches: number;
  truncated: boolean;
};

function isGrepToolInput(value: unknown): value is GrepToolInput {
  const candidate = value as {
    include?: unknown;
    path?: unknown;
    pattern?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.pattern === "string" &&
    (candidate.path === undefined || typeof candidate.path === "string") &&
    (candidate.include === undefined || typeof candidate.include === "string")
  );
}

function isGrepToolOutput(value: unknown): value is GrepToolOutput {
  const candidate = value as {
    files?: unknown;
    hasPartialErrors?: unknown;
    include?: unknown;
    pattern?: unknown;
    root?: unknown;
    shownMatches?: unknown;
    totalMatches?: unknown;
    truncated?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    Array.isArray(candidate.files) &&
    typeof candidate.hasPartialErrors === "boolean" &&
    (candidate.include === null || typeof candidate.include === "string") &&
    typeof candidate.pattern === "string" &&
    typeof candidate.root === "string" &&
    typeof candidate.shownMatches === "number" &&
    typeof candidate.totalMatches === "number" &&
    typeof candidate.truncated === "boolean"
  );
}

function buildSummary(
  part: RendererProps["part"],
  pattern: string,
  root: string,
  output: GrepToolOutput | null,
): ReactNode {
  if (part.state === "output-error") {
    return (
      <>
        Search failed for{" "}
        <span className="font-mono text-[12px]">/{pattern}/</span>
      </>
    );
  }

  if (part.state === "output-available" && output) {
    if (output.totalMatches === 0) {
      return (
        <>
          No matches for{" "}
          <span className="font-mono text-[12px]">/{pattern}/</span>
          {root !== "." ? (
            <span className="text-foreground/40"> in {root}</span>
          ) : null}
        </>
      );
    }
    return (
      <>
        Found{" "}
        <span className="text-foreground/50">{output.totalMatches}</span>{" "}
        match{output.totalMatches === 1 ? "" : "es"} in{" "}
        <span className="text-foreground/50">{output.files.length}</span>{" "}
        file{output.files.length === 1 ? "" : "s"}
      </>
    );
  }

  return (
    <>
      Searching for{" "}
      <span className="font-mono text-[12px]">/{pattern}/</span>
      {root !== "." ? (
        <span className="text-foreground/40"> in {root}</span>
      ) : null}
    </>
  );
}

function buildGrepBody(output: GrepToolOutput | null, errorText?: string, pattern?: string) {
  if (output) {
    if (output.files.length === 0) {
      return `No matches found for /${output.pattern}/`;
    }
    return output.files
      .map((file) =>
        [`# ${file.path}`, ...file.matches.map((match) => `${match.lineNumber}: ${match.text}`)].join("\n"),
      )
      .join("\n\n");
  }
  if (errorText) return errorText;
  return `Searching /${pattern ?? ""}/`;
}

export const GrepTool = memo(function GrepTool({
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const grepInput = hasInput && isGrepToolInput(part.input) ? part.input : null;
  const grepOutput = hasOutput && isGrepToolOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const isFinishedState =
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(grepOutput));
  const isErrorState = part.state === "output-error";
  const [isExpanded, setIsExpanded] = useState(!isFinishedState);

  useEffect(() => {
    setIsExpanded(!isFinishedState);
  }, [isFinishedState, part.toolCallId]);

  const pattern = grepOutput?.pattern ?? grepInput?.pattern ?? "";
  const root = grepOutput?.root ?? grepInput?.path?.trim() ?? ".";
  const summary = buildSummary(part, pattern, root, grepOutput);
  const bodyText = buildGrepBody(grepOutput, partErrorText, pattern);

  const footer = grepOutput ? (
    <span>
      {grepOutput.totalMatches} match{grepOutput.totalMatches === 1 ? "" : "es"} · {grepOutput.files.length} file{grepOutput.files.length === 1 ? "" : "s"}
      {grepOutput.truncated ? ` · showing ${grepOutput.shownMatches}` : ""}
      {grepOutput.hasPartialErrors ? " · partial" : ""}
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
