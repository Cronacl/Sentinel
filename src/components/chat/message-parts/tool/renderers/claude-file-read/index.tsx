"use client";

import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollShadow } from "@heroui/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { renderClaudeApprovalActions } from "../claude-approval-actions";
import {
  extractTextFromContent,
  getFileName,
  isClaudeToolErrorState,
  isClaudeToolRunningState,
  tryParseClaudeOutput,
  useClaudeExpansionState,
  unwrapClaudeInput,
} from "../claude-helpers";
import {
  detectLanguageFromPath,
  highlightToTokens,
  languageToVSCodeIcon,
  type ThemedToken,
} from "@/lib/syntax/highlighter";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";

type ClaudeReadInput = {
  file_path: string;
  limit?: number;
  offset?: number;
  pages?: string;
};

type ClaudeReadTextOutput = {
  file: {
    content: string;
    filePath: string;
    numLines: number;
    startLine: number;
    totalLines: number;
  };
  type: "text";
};

type ClaudeReadImageOutput = {
  file: {
    base64: string;
    type: string;
  };
  type: "image";
};

type ClaudeReadOutput = ClaudeReadTextOutput | ClaudeReadImageOutput;

function parseClaudeReadTextOutput(
  value: string,
  filePath: string,
): ClaudeReadTextOutput | null {
  const lines = value.split("\n");
  const contentLines: string[] = [];
  let startLine: number | null = null;
  let lastLine: number | null = null;

  for (const line of lines) {
    if (line.startsWith("<system-reminder>")) {
      break;
    }

    const match = /^\s*(\d+)→(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    const lineNumber = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(lineNumber)) {
      continue;
    }

    if (startLine == null) {
      startLine = lineNumber;
    }

    lastLine = lineNumber;
    contentLines.push(match[2] ?? "");
  }

  if (startLine == null || lastLine == null || contentLines.length === 0) {
    return null;
  }

  return {
    file: {
      content: contentLines.join("\n"),
      filePath,
      numLines: contentLines.length,
      startLine,
      totalLines: lastLine,
    },
    type: "text",
  };
}

function isReadInput(value: unknown): value is ClaudeReadInput {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).file_path === "string";
}

function isReadOutput(value: unknown): value is ClaudeReadOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.type === "text" || v.type === "image") &&
    v.file !== undefined &&
    typeof v.file === "object"
  );
}

function isTextOutput(
  output: ClaudeReadOutput,
): output is ClaudeReadTextOutput {
  return output.type === "text";
}

function tokenLinesToSegments(
  tokenLines: ThemedToken[][] | null,
): Array<Array<{ color?: string; text: string }>> {
  if (!tokenLines) return [];
  return tokenLines.map((tokens) =>
    tokens.map((t) => ({ color: t.color, text: t.content })),
  );
}

function FileContent({
  content,
  filePath,
  startLine,
}: {
  content: string;
  filePath: string;
  startLine: number;
}) {
  const theme = useResolvedTheme();
  const [copied, setCopied] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [syntaxLines, setSyntaxLines] = useState<
    Array<Array<{ color?: string; text: string }>>
  >([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const codeLines = useMemo(() => content.split("\n"), [content]);
  const lang = useMemo(() => detectLanguageFromPath(filePath), [filePath]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || hasBeenVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHasBeenVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [hasBeenVisible]);

  useEffect(() => {
    if (!hasBeenVisible || codeLines.length === 0) return;

    let cancelled = false;

    const run = async () => {
      try {
        const tokens = await highlightToTokens(content, lang, theme);
        if (!cancelled) {
          setSyntaxLines(tokenLinesToSegments(tokens));
        }
      } catch {
        // best-effort
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [hasBeenVisible, theme, content, lang, codeLines.length]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-label="Copy content"
        className="absolute right-1.5 top-1 z-10 flex cursor-pointer items-center justify-center rounded p-0.5 text-foreground/20 transition-colors hover:text-foreground/50"
        onClick={() => void handleCopy()}
        type="button"
      >
        <HugeiconsIcon
          color="currentColor"
          icon={copied ? Tick01Icon : Copy01Icon}
          size={11}
          strokeWidth={1.5}
        />
      </button>
      <ScrollShadow className="max-h-[300px] overflow-x-auto">
        <div className="font-mono text-[11px] leading-[18px]">
          {codeLines.map((line, idx) => (
            <div key={idx} className="flex whitespace-pre pr-6">
              <span className="mr-3 inline-block w-8 shrink-0 text-right text-foreground/20 select-none">
                {startLine + idx}
              </span>
              <span>
                {syntaxLines[idx] ? (
                  syntaxLines[idx].map((seg, si) => (
                    <span
                      key={si}
                      style={seg.color ? { color: seg.color } : undefined}
                    >
                      {seg.text}
                    </span>
                  ))
                ) : (
                  <span className="text-foreground/70">{line}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </ScrollShadow>
    </div>
  );
}

function buildSummary(
  part: RendererProps["part"],
  input: ClaudeReadInput,
  output: ClaudeReadOutput | null,
): ReactNode {
  const name = getFileName(input.file_path);

  if (part.state === "output-denied") {
    return (
      <>
        Read denied <span className="font-mono text-[12px]">{name}</span>
      </>
    );
  }

  if (part.state === "output-error") {
    return (
      <>
        Failed to read <span className="font-mono text-[12px]">{name}</span>
      </>
    );
  }

  if (output && isTextOutput(output)) {
    const lineInfo =
      output.file.totalLines > output.file.numLines
        ? ` (${output.file.startLine}–${output.file.startLine + output.file.numLines - 1} of ${output.file.totalLines})`
        : ` (${output.file.totalLines} lines)`;
    return (
      <>
        Read <span className="font-mono text-[12px]">{name}</span>
        <span className="ml-1 text-[11px] text-foreground/40">{lineInfo}</span>
      </>
    );
  }

  if (output?.type === "image") {
    return (
      <>
        Viewed <span className="font-mono text-[12px]">{name}</span>
      </>
    );
  }

  if (part.state === "output-available") {
    return (
      <>
        Read <span className="font-mono text-[12px]">{name}</span>
      </>
    );
  }

  if (part.state === "approval-requested") {
    return (
      <>
        Read <span className="font-mono text-[12px]">{name}</span>
      </>
    );
  }

  return (
    <>
      Reading <span className="font-mono text-[12px]">{name}</span>
    </>
  );
}

export const ClaudeFileReadTool = memo(function ClaudeFileReadTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const unwrapped = unwrapClaudeInput<ClaudeReadInput>(
    hasInput ? part.input : undefined,
  );
  const readInput = unwrapped && isReadInput(unwrapped) ? unwrapped : null;
  const rawOutput = hasOutput ? part.output : undefined;
  const readOutputDirect = hasOutput
    ? tryParseClaudeOutput(part.output, isReadOutput)
    : null;
  const readOutputFromText =
    !readOutputDirect && readInput
      ? (() => {
          const text =
            typeof rawOutput === "string"
              ? rawOutput
              : extractTextFromContent(rawOutput);
          return text
            ? parseClaudeReadTextOutput(text, readInput.file_path)
            : null;
        })()
      : null;
  const readOutput = readOutputDirect ?? readOutputFromText;
  const fallbackOutputText =
    rawOutput !== undefined && readOutput === null
      ? extractTextFromContent(rawOutput)
      : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;

  const isRunning = isClaudeToolRunningState(part.state);
  const isFinished =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied";
  const isError = isClaudeToolErrorState(part.state);

  if (!readInput) return null;

  const summary = buildSummary(part, readInput, readOutput);
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });

  const hasContent =
    (readOutput &&
      ((isTextOutput(readOutput) && readOutput.file.content.trim()) ||
        readOutput.type === "image")) ||
    Boolean(fallbackOutputText?.trim());
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested",
  );

  return (
    <ToolLayout
      actions={actions}
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={Boolean(hasContent) || isRunning}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={partErrorText}
      footer={
        isFinished ? (
          <span
            className="truncate font-mono text-[10px]"
            title={readInput.file_path}
          >
            {readInput.file_path}
          </span>
        ) : null
      }
    >
      {readOutput &&
        isTextOutput(readOutput) &&
        readOutput.file.content.trim() && (
          <FileContent
            content={readOutput.file.content}
            filePath={readInput.file_path}
            startLine={readOutput.file.startLine}
          />
        )}
      {readOutput?.type === "image" && (
        <div className="flex justify-center rounded-md bg-foreground/2 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={getFileName(readInput.file_path)}
            className="max-h-[400px] max-w-full rounded object-contain"
            src={`data:${(readOutput as ClaudeReadImageOutput).file.type};base64,${(readOutput as ClaudeReadImageOutput).file.base64}`}
          />
        </div>
      )}
      {!readOutput && fallbackOutputText?.trim() && (
        <ScrollShadow className="max-h-[300px] overflow-x-auto">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
            {fallbackOutputText}
          </pre>
        </ScrollShadow>
      )}
    </ToolLayout>
  );
});
