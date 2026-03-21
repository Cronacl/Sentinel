"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useMemo, useState } from "react";
import { ScrollShadow } from "@heroui/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { CodePreview } from "../shared/code-preview";
import { MarkdownContent } from "../../../text/markdown-content";
import { detectLanguageFromPath } from "@/lib/syntax/highlighter";

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
  const candidate = value as {
    limit?: unknown;
    offset?: unknown;
    path?: unknown;
  };

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
    (candidate.nextOffset === null ||
      typeof candidate.nextOffset === "number") &&
    typeof candidate.path === "string" &&
    (candidate.totalEntries === null ||
      typeof candidate.totalEntries === "number") &&
    (candidate.totalLines === null ||
      typeof candidate.totalLines === "number") &&
    typeof candidate.truncated === "boolean"
  );
}

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown"]);

function isMarkdownFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext ? MARKDOWN_EXTENSIONS.has(ext) : false;
}

function isCodeFile(path: string): boolean {
  const lang = detectLanguageFromPath(path);
  return lang !== "text";
}

function buildSummary(
  part: RendererProps["part"],
  shownPath: string,
  output: ReadToolOutput | null,
): ReactNode {
  if (part.state === "output-error") {
    return (
      <>
        Failed to read{" "}
        <span className="font-mono text-[12px]">{shownPath}</span>
      </>
    );
  }

  if (part.state === "output-available" && output) {
    const detail =
      output.kind === "file"
        ? `${output.totalLines ?? 0} lines`
        : `${output.totalEntries ?? 0} entries`;
    return (
      <>
        Read <span className="font-mono text-[12px]">{output.path}</span>
        <span className="ml-1.5 text-[11px] text-foreground/40">{detail}</span>
      </>
    );
  }

  return (
    <>
      Reading <span className="font-mono text-[12px]">{shownPath}</span>
    </>
  );
}

function buildBody(
  output: ReadToolOutput | null,
  shownPath: string,
  errorText?: string,
): ReactNode {
  if (!output) {
    return (
      <p className="font-mono text-[11px] text-foreground/50">
        Reading {shownPath}...
      </p>
    );
  }

  if (output.kind === "directory") {
    return (
      <ScrollShadow className="max-h-[220px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
        {output.entries.length > 0
          ? output.entries.join("\n")
          : "(empty directory)"}
      </ScrollShadow>
    );
  }

  const content = output.content?.trim();
  if (!content && output.lines.length === 0) {
    if (errorText) {
      return (
        <p className="text-[11px] text-danger-soft-foreground">{errorText}</p>
      );
    }
    return (
      <p className="font-mono text-[11px] text-foreground/50">(empty file)</p>
    );
  }

  if (isMarkdownFile(output.path)) {
    const mdContent =
      output.lines.length > 0
        ? output.lines.map((l) => l.text).join("\n")
        : (content ?? "");
    return (
      <ScrollShadow className="max-h-[300px]">
        <MarkdownContent text={mdContent} />
      </ScrollShadow>
    );
  }

  if (isCodeFile(output.path)) {
    const codeLines = output.lines.length > 0 ? output.lines : undefined;
    const codeStr = codeLines ? undefined : (content ?? "");
    return (
      <CodePreview
        code={codeStr}
        lines={codeLines}
        path={output.path}
        showHeader={false}
      />
    );
  }

  return (
    <ScrollShadow className="max-h-[220px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
      {output.lines.length > 0
        ? output.lines.map((l) => `${l.number}: ${l.text}`).join("\n")
        : content}
    </ScrollShadow>
  );
}

export const ReadTool = memo(function ReadTool({ part }: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const readInput = hasInput && isReadToolInput(part.input) ? part.input : null;
  const readOutput =
    hasOutput && isReadToolOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const isFinishedState =
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(readOutput));
  const isErrorState = part.state === "output-error";
  const [isExpanded, setIsExpanded] = useState(!isFinishedState);

  useEffect(() => {
    setIsExpanded(!isFinishedState);
  }, [isFinishedState, part.toolCallId]);

  const shownPath = readOutput?.path ?? readInput?.path ?? ".";
  const summary = buildSummary(part, shownPath, readOutput);
  const body = useMemo(
    () => buildBody(readOutput, shownPath, partErrorText),
    [readOutput, shownPath, partErrorText],
  );

  const footer = readOutput ? (
    <span>
      {readOutput.kind === "file"
        ? `${readOutput.totalLines ?? 0} lines`
        : `${readOutput.totalEntries ?? 0} entries`}
      {readOutput.truncated && readOutput.nextOffset
        ? ` · next offset ${readOutput.nextOffset}`
        : ""}
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
      errorText={
        partErrorText && part.state !== "output-error"
          ? partErrorText
          : undefined
      }
      footer={footer}
    >
      {body}
    </ToolLayout>
  );
});
