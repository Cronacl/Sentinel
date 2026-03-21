"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useRef, useState } from "react";
import { ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import {
  detectLanguageFromPath,
  highlightToTokens,
  languageToVSCodeIcon,
  type ThemedToken,
} from "@/lib/syntax/highlighter";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";

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
        Found <span className="text-foreground/50">{output.totalMatches}</span>{" "}
        match{output.totalMatches === 1 ? "" : "es"} in{" "}
        <span className="text-foreground/50">{output.files.length}</span> file
        {output.files.length === 1 ? "" : "s"}
      </>
    );
  }

  return (
    <>
      Searching for <span className="font-mono text-[12px]">/{pattern}/</span>
      {root !== "." ? (
        <span className="text-foreground/40"> in {root}</span>
      ) : null}
    </>
  );
}

function tokenLinesToSegments(
  tokenLines: ThemedToken[][] | null,
): Array<Array<{ color?: string; text: string }>> {
  if (!tokenLines) return [];
  return tokenLines.map((tokens) =>
    tokens.map((t) => ({ color: t.color, text: t.content })),
  );
}

function FileMatchGroup({
  file,
  pattern,
}: {
  file: GrepToolOutput["files"][number];
  pattern: string;
}) {
  const theme = useResolvedTheme();
  const [syntaxLines, setSyntaxLines] = useState<
    Array<Array<{ color?: string; text: string }>>
  >([]);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const language = detectLanguageFromPath(file.path);
  const fileIcon = languageToVSCodeIcon[language] ?? null;
  const fileName = file.path.split("/").pop() ?? file.path;

  useEffect(() => {
    const el = ref.current;
    if (!el || hasBeenVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHasBeenVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasBeenVisible]);

  useEffect(() => {
    if (!hasBeenVisible || language === "text" || file.matches.length === 0)
      return;

    let cancelled = false;

    const run = async () => {
      try {
        const code = file.matches.map((m) => m.text).join("\n");
        const tokens = await highlightToTokens(code, language, theme);
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
  }, [hasBeenVisible, language, theme, file.matches]);

  const maxLineNum = file.matches[file.matches.length - 1]?.lineNumber ?? 0;
  const gutterWidth = `${Math.max(3, String(maxLineNum).length) * 8 + 12}px`;

  let patternRegex: RegExp | null = null;
  try {
    patternRegex = new RegExp(`(${pattern})`, "gi");
  } catch {
    // invalid regex, skip highlighting
  }

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-md border border-border/30"
    >
      <div className="flex items-center gap-1.5 border-b border-border/20 bg-foreground/2 px-2.5 py-1">
        {fileIcon ? (
          <Icon
            className="h-3 w-3 shrink-0 text-foreground/40"
            icon={fileIcon}
          />
        ) : null}
        <span
          className="truncate font-mono text-[10px] text-foreground/50"
          title={file.path}
        >
          {file.path.includes("/") ? (
            <>
              <span className="text-foreground/25">
                {file.path.slice(0, file.path.length - fileName.length)}
              </span>
              <span className="text-foreground/50">{fileName}</span>
            </>
          ) : (
            file.path
          )}
        </span>
        <span className="ml-auto shrink-0 text-[10px] text-foreground/25">
          {file.matches.length}
        </span>
      </div>
      <div className="font-mono text-[11px] leading-[18px]">
        {file.matches.map((match, idx) => (
          <div
            key={`${match.lineNumber}-${idx}`}
            className="flex hover:bg-foreground/2"
          >
            <span
              className="shrink-0 select-none border-r border-border/15 pr-1.5 text-right text-[10px] leading-[18px] text-foreground/20"
              style={{ width: gutterWidth, fontVariantNumeric: "tabular-nums" }}
            >
              {match.lineNumber}
            </span>
            <span className="whitespace-pre pl-2 pr-3">
              {syntaxLines[idx] ? (
                syntaxLines[idx].map((seg, si) => (
                  <span
                    key={si}
                    style={seg.color ? { color: seg.color } : undefined}
                  >
                    {seg.text}
                  </span>
                ))
              ) : patternRegex ? (
                match.text.split(patternRegex).map((part, pi) =>
                  pi % 2 === 1 ? (
                    <span
                      key={pi}
                      className="rounded-[2px] bg-warning-soft-hover px-px font-medium"
                    >
                      {part}
                    </span>
                  ) : (
                    <span key={pi} className="text-foreground/70">
                      {part}
                    </span>
                  ),
                )
              ) : (
                <span className="text-foreground/70">{match.text}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrepBody({
  errorText,
  output,
  pattern,
}: {
  errorText?: string;
  output: GrepToolOutput | null;
  pattern: string;
}) {
  if (!output) {
    return (
      <p className="font-mono text-[11px] text-foreground/50">
        {errorText ?? `Searching /${pattern}/`}
      </p>
    );
  }

  if (output.files.length === 0) {
    return (
      <p className="font-mono text-[11px] text-foreground/50">
        No matches found for /{output.pattern}/
      </p>
    );
  }

  return (
    <ScrollShadow className="max-h-[320px]">
      <div className="flex flex-col gap-2">
        {output.files.map((file) => (
          <FileMatchGroup key={file.path} file={file} pattern={pattern} />
        ))}
      </div>
    </ScrollShadow>
  );
}

export const GrepTool = memo(function GrepTool({ part }: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const grepInput = hasInput && isGrepToolInput(part.input) ? part.input : null;
  const grepOutput =
    hasOutput && isGrepToolOutput(part.output) ? part.output : null;
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

  const footer = grepOutput ? (
    <span>
      {grepOutput.totalMatches} match{grepOutput.totalMatches === 1 ? "" : "es"}{" "}
      · {grepOutput.files.length} file{grepOutput.files.length === 1 ? "" : "s"}
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
      errorText={
        partErrorText && part.state !== "output-error"
          ? partErrorText
          : undefined
      }
      footer={footer}
    >
      <GrepBody
        errorText={partErrorText}
        output={grepOutput}
        pattern={pattern}
      />
    </ToolLayout>
  );
});
