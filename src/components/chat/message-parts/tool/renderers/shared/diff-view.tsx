"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollShadow } from "@heroui/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@iconify/react";

import { createUnifiedDiff } from "@/lib/diff/unified";
import {
  detectLanguageFromPath,
  highlightToTokensCached,
  languageToVSCodeIcon,
  tokenLinesToSegments,
  type SyntaxSegment,
  type ThemedToken,
} from "@/lib/syntax/highlighter";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";

type DiffLineKind = "add" | "ctx" | "del";

type DiffLine = {
  kind: DiffLineKind;
  newNum: number | null;
  oldNum: number | null;
  text: string;
};

type DiffGroup =
  | { lines: DiffLine[]; type: "lines" }
  | { count: number; lines: DiffLine[]; type: "collapsed" };

type WordSegment = { highlight: boolean; text: string };

type HighlightedWordSegment = {
  color?: string;
  highlight: boolean;
  text: string;
};

const CONTEXT_KEEP = 3;

function parseDiff(raw: string): {
  additions: number;
  deletions: number;
  lines: DiffLine[];
} {
  let additions = 0;
  let deletions = 0;
  let oldNum = 1;
  let newNum = 1;
  const lines: DiffLine[] = [];

  for (const rawLine of raw.split("\n")) {
    if (
      rawLine.startsWith("---") ||
      rawLine.startsWith("+++") ||
      rawLine.startsWith("@@")
    ) {
      continue;
    }

    if (rawLine.startsWith("+")) {
      additions += 1;
      lines.push({
        kind: "add",
        newNum: newNum++,
        oldNum: null,
        text: rawLine.slice(1),
      });
    } else if (rawLine.startsWith("-")) {
      deletions += 1;
      lines.push({
        kind: "del",
        newNum: null,
        oldNum: oldNum++,
        text: rawLine.slice(1),
      });
    } else {
      lines.push({
        kind: "ctx",
        newNum: newNum++,
        oldNum: oldNum++,
        text: rawLine.slice(1),
      });
    }
  }

  return { additions, deletions, lines };
}

function groupLines(lines: DiffLine[]): DiffGroup[] {
  const groups: DiffGroup[] = [];
  let ctxBuffer: DiffLine[] = [];

  function flushCtx() {
    if (ctxBuffer.length === 0) return;

    if (ctxBuffer.length <= CONTEXT_KEEP * 2 + 1) {
      groups.push({ lines: ctxBuffer, type: "lines" });
    } else {
      const top = ctxBuffer.slice(0, CONTEXT_KEEP);
      const bottom = ctxBuffer.slice(-CONTEXT_KEEP);
      const middle = ctxBuffer.slice(CONTEXT_KEEP, -CONTEXT_KEEP);
      groups.push({ lines: top, type: "lines" });
      if (middle.length > 0) {
        groups.push({
          count: middle.length,
          lines: middle,
          type: "collapsed",
        });
      }
      groups.push({ lines: bottom, type: "lines" });
    }
    ctxBuffer = [];
  }

  for (const line of lines) {
    if (line.kind === "ctx") {
      ctxBuffer.push(line);
      continue;
    }

    flushCtx();
    const last = groups[groups.length - 1];
    if (last?.type === "lines") {
      last.lines.push(line);
    } else {
      groups.push({ lines: [line], type: "lines" });
    }
  }

  flushCtx();

  return groups;
}

function tokenize(text: string): string[] {
  return text.match(/\S+|\s+/g) ?? [text];
}

function longestCommonSubsequence(a: string[], b: string[]): Set<string> {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i += 1) {
    const prevRow = dp[i - 1]!;
    const curRow = dp[i]!;
    for (let j = 1; j <= n; j += 1) {
      curRow[j] =
        a[i - 1] === b[j - 1]
          ? prevRow[j - 1]! + 1
          : Math.max(prevRow[j]!, curRow[j - 1]!);
    }
  }

  const commonIndicesA = new Set<number>();
  const commonIndicesB = new Set<number>();
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      commonIndicesA.add(i - 1);
      commonIndicesB.add(j - 1);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1]![j]! > dp[i]![j - 1]!) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return new Set([
    ...Array.from(commonIndicesA).map((index) => `a:${index}`),
    ...Array.from(commonIndicesB).map((index) => `b:${index}`),
  ]);
}

function buildSegments(
  tokens: string[],
  lcs: Set<string>,
  side: "new" | "old",
): WordSegment[] {
  const segments: WordSegment[] = [];
  let buffer = "";
  let highlight = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    const isCommon = lcs.has(`${side === "old" ? "a" : "b"}:${index}`);
    const nextHighlight = !isCommon;

    if (!buffer) {
      buffer = token;
      highlight = nextHighlight;
      continue;
    }

    if (nextHighlight === highlight) {
      buffer += token;
      continue;
    }

    segments.push({ highlight, text: buffer });
    buffer = token;
    highlight = nextHighlight;
  }

  if (buffer) {
    segments.push({ highlight, text: buffer });
  }

  return segments;
}

function computeWordDiff(oldText: string, newText: string) {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const lcs = longestCommonSubsequence(oldTokens, newTokens);

  return {
    newSegments: buildSegments(newTokens, lcs, "new"),
    oldSegments: buildSegments(oldTokens, lcs, "old"),
  };
}

function computeWordDiffsForLines(lines: DiffLine[]) {
  const wordDiffByIndex = new Map<
    number,
    { newSegments: WordSegment[]; oldSegments: WordSegment[] }
  >();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.kind !== "del") continue;
    const next = lines[index + 1];
    if (!next || next.kind !== "add") continue;
    wordDiffByIndex.set(index, computeWordDiff(line.text, next.text));
  }

  return wordDiffByIndex;
}

function buildSyntaxMaps(
  lines: DiffLine[],
  oldTokenLines: ThemedToken[][] | null,
  newTokenLines: ThemedToken[][] | null,
): Map<number, SyntaxSegment[]> {
  const map = new Map<number, SyntaxSegment[]>();

  if (oldTokenLines) {
    let tokenIdx = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      if (line.kind === "del" || line.kind === "ctx") {
        if (tokenIdx < oldTokenLines.length) {
          map.set(i, tokenLinesToSegments([oldTokenLines[tokenIdx]!])[0] ?? []);
        }
        tokenIdx += 1;
      }
    }
  }

  if (newTokenLines) {
    let tokenIdx = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      if (line.kind === "add" || line.kind === "ctx") {
        if (line.kind === "add" && tokenIdx < newTokenLines.length) {
          map.set(i, tokenLinesToSegments([newTokenLines[tokenIdx]!])[0] ?? []);
        }
        tokenIdx += 1;
      }
    }
  }

  return map;
}

function overlayWordDiffOnSyntax(
  syntaxSegments: SyntaxSegment[],
  wordSegments: WordSegment[],
): HighlightedWordSegment[] {
  const result: HighlightedWordSegment[] = [];

  let syntaxPos = 0;
  let syntaxCharPos = 0;

  for (const wordSeg of wordSegments) {
    let remaining = wordSeg.text.length;

    while (remaining > 0 && syntaxPos < syntaxSegments.length) {
      const syntaxSeg = syntaxSegments[syntaxPos]!;
      const availableChars = syntaxSeg.text.length - syntaxCharPos;
      const take = Math.min(remaining, availableChars);

      result.push({
        color: syntaxSeg.color,
        highlight: wordSeg.highlight,
        text: syntaxSeg.text.slice(syntaxCharPos, syntaxCharPos + take),
      });

      remaining -= take;
      syntaxCharPos += take;

      if (syntaxCharPos >= syntaxSeg.text.length) {
        syntaxPos += 1;
        syntaxCharPos = 0;
      }
    }

    if (remaining > 0) {
      result.push({
        highlight: wordSeg.highlight,
        text: wordSeg.text.slice(wordSeg.text.length - remaining),
      });
    }
  }

  return result;
}

function CollapsedRegion({
  count,
  onExpand,
}: {
  count: number;
  onExpand: () => void;
}) {
  return (
    <button
      className="sentinel-diff-collapsed flex w-full items-center gap-2 px-0 py-[3px] text-left"
      onClick={onExpand}
      type="button"
    >
      <span className="sentinel-diff-gutter w-[76px] shrink-0 select-none border-r border-border/15 text-center font-mono text-[10px] text-foreground/20">
        ···
      </span>
      <span className="flex items-center gap-1 pl-1 font-mono text-[10px] text-foreground/30">
        <svg
          className="h-3 w-3 text-foreground/20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            d="M19 9l-7 7-7-7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {count} unchanged line{count !== 1 ? "s" : ""}
      </span>
    </button>
  );
}

function getDiffTint(kind: DiffLineKind) {
  if (kind === "add") {
    return "var(--syntax-token-inserted)";
  }

  if (kind === "del") {
    return "var(--syntax-token-deleted)";
  }

  return null;
}

function getSegmentStyle(color: string | undefined, kind: DiffLineKind) {
  const tint = getDiffTint(kind);

  if (!tint) {
    return color ? { color } : undefined;
  }

  return {
    color: color ? `color-mix(in srgb, ${color} 78%, ${tint})` : tint,
  };
}

function SyntaxLine({
  segments,
  fallbackText,
  kind,
  opacity,
}: {
  fallbackText: string;
  kind: DiffLineKind;
  opacity?: string;
  segments: SyntaxSegment[] | undefined;
}) {
  if (!segments) {
    return (
      <span className={opacity} style={getSegmentStyle(undefined, kind)}>
        {fallbackText}
      </span>
    );
  }

  return (
    <>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={opacity}
          style={getSegmentStyle(seg.color, kind)}
        >
          {seg.text}
        </span>
      ))}
    </>
  );
}

function HighlightedWordDiffLine({
  segments,
  kind,
}: {
  kind: "add" | "del";
  segments: HighlightedWordSegment[];
}) {
  const hlClass =
    kind === "add" ? "sentinel-diff-word-add" : "sentinel-diff-word-del";

  return (
    <>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <span
            key={i}
            className={hlClass}
            style={getSegmentStyle(seg.color, kind)}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i} style={getSegmentStyle(seg.color, kind)}>
            {seg.text}
          </span>
        ),
      )}
    </>
  );
}

function PlainWordDiffLine({
  segments,
  kind,
}: {
  kind: "add" | "del";
  segments: WordSegment[];
}) {
  const hlClass =
    kind === "add" ? "sentinel-diff-word-add" : "sentinel-diff-word-del";

  return (
    <>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <span
            key={i}
            className={hlClass}
            style={getSegmentStyle(undefined, kind)}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i} style={getSegmentStyle(undefined, kind)}>
            {seg.text}
          </span>
        ),
      )}
    </>
  );
}

export function buildPreviewUnifiedDiff({
  after,
  before,
  path,
}: {
  after: string;
  before: string;
  path: string;
}) {
  return createUnifiedDiff({
    after,
    before,
    leftPath: path,
    rightPath: path,
  }).diff;
}

export function DiffView({
  diff,
  path,
  language: languageOverride,
}: {
  diff: string;
  language?: string;
  path: string;
}) {
  const theme = useResolvedTheme();
  const [copied, setCopied] = useState(false);
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(
    () => new Set(),
  );
  const [syntaxMap, setSyntaxMap] = useState<Map<number, SyntaxSegment[]>>(
    () => new Map(),
  );
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const language = languageOverride ?? detectLanguageFromPath(path);
  const fileIcon =
    languageToVSCodeIcon[language] ?? "vscode-icons:default-file";

  const { additions, allLines, deletions, groups, wordDiffs } = useMemo(() => {
    const {
      additions: nextAdditions,
      deletions: nextDeletions,
      lines,
    } = parseDiff(diff);
    return {
      additions: nextAdditions,
      allLines: lines,
      deletions: nextDeletions,
      groups: groupLines(lines),
      wordDiffs: computeWordDiffsForLines(lines),
    };
  }, [diff]);

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
    if (!hasBeenVisible || language === "text" || allLines.length === 0) return;

    let cancelled = false;

    const run = async () => {
      try {
        const oldContent = allLines
          .filter((l) => l.kind === "del" || l.kind === "ctx")
          .map((l) => l.text)
          .join("\n");
        const newContent = allLines
          .filter((l) => l.kind === "add" || l.kind === "ctx")
          .map((l) => l.text)
          .join("\n");

        const [oldTokens, newTokens] = await Promise.all([
          highlightToTokensCached(oldContent, language, theme),
          highlightToTokensCached(newContent, language, theme),
        ]);

        if (!cancelled) {
          setSyntaxMap(buildSyntaxMaps(allLines, oldTokens, newTokens));
        }
      } catch {
        // Syntax highlighting is best-effort
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [hasBeenVisible, language, theme, allLines]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(diff);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [diff]);

  const handleExpand = useCallback((regionIndex: number) => {
    setExpandedRegions((previous) => {
      const next = new Set(previous);
      next.add(regionIndex);
      return next;
    });
  }, []);

  const absoluteIndex = useCallback(
    (line: DiffLine) => allLines.indexOf(line),
    [allLines],
  );

  const fileName = path.split("/").pop() ?? path;
  const isFullPath = path.includes("/");

  return (
    <div
      ref={containerRef}
      className="sentinel-diff overflow-hidden rounded-lg border border-border/40"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/30 bg-foreground/2 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon
            className="h-3.5 w-3.5 shrink-0 text-foreground/50"
            icon={fileIcon}
          />
          <span
            className="truncate font-mono text-[11px] text-foreground/50"
            title={path}
          >
            {isFullPath ? (
              <>
                <span className="text-foreground/30">
                  {path.slice(0, path.length - fileName.length)}
                </span>
                <span className="text-foreground/60">{fileName}</span>
              </>
            ) : (
              <span className="text-foreground/60">{path}</span>
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            {additions > 0 ? (
              <span className="text-success">+{additions}</span>
            ) : null}
            {deletions > 0 ? (
              <span className="text-danger">
                {"\u2212"}
                {deletions}
              </span>
            ) : null}
          </div>
          <button
            aria-label="Copy diff"
            className="flex cursor-pointer items-center justify-center rounded p-0.5 text-foreground/30 transition-colors hover:text-foreground/60"
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
        </div>
      </div>

      {/* Lines */}
      <ScrollShadow className="max-h-[400px] overflow-x-auto">
        <div className="font-mono text-[11px] leading-[18px]">
          {groups.map((group, groupIndex) => {
            if (
              group.type === "collapsed" &&
              !expandedRegions.has(groupIndex)
            ) {
              return (
                <CollapsedRegion
                  key={`collapsed-${groupIndex}`}
                  count={group.count}
                  onExpand={() => handleExpand(groupIndex)}
                />
              );
            }

            return group.lines.map((line) => {
              const lineIndex = absoluteIndex(line);
              const wordDiff =
                line.kind === "del" ? wordDiffs.get(lineIndex) : undefined;
              const previousWordDiff =
                line.kind === "add" ? wordDiffs.get(lineIndex - 1) : undefined;
              const lineSyntax = syntaxMap.get(lineIndex);

              const bgClass =
                line.kind === "add"
                  ? "sentinel-diff-add"
                  : line.kind === "del"
                    ? "sentinel-diff-del"
                    : "sentinel-diff-ctx";

              const gutterColor =
                line.kind === "add"
                  ? "text-success/40"
                  : line.kind === "del"
                    ? "text-danger/40"
                    : "text-foreground/15";

              const signChar =
                line.kind === "add"
                  ? "+"
                  : line.kind === "del"
                    ? "\u2212"
                    : " ";

              const signColor =
                line.kind === "add"
                  ? "text-success/50"
                  : line.kind === "del"
                    ? "text-danger/50"
                    : "text-foreground/10";

              return (
                <div
                  key={`${lineIndex}:${line.kind}`}
                  className={`sentinel-diff-line ${bgClass} flex`}
                >
                  {/* Old line number */}
                  <span
                    className={`sentinel-diff-gutter w-[38px] shrink-0 select-none border-r border-border/15 pr-1.5 text-right text-[10px] leading-[18px] ${gutterColor}`}
                  >
                    {line.oldNum ?? ""}
                  </span>
                  {/* New line number */}
                  <span
                    className={`sentinel-diff-gutter w-[38px] shrink-0 select-none border-r border-border/15 pr-1.5 text-right text-[10px] leading-[18px] ${gutterColor}`}
                  >
                    {line.newNum ?? ""}
                  </span>
                  {/* Sign */}
                  <span
                    className={`w-[18px] shrink-0 select-none text-center leading-[18px] ${signColor}`}
                  >
                    {signChar}
                  </span>
                  {/* Content */}
                  <span className="whitespace-pre pr-3">
                    {line.kind === "del" && wordDiff ? (
                      lineSyntax ? (
                        <HighlightedWordDiffLine
                          kind="del"
                          segments={overlayWordDiffOnSyntax(
                            lineSyntax,
                            wordDiff.oldSegments,
                          )}
                        />
                      ) : (
                        <PlainWordDiffLine
                          kind="del"
                          segments={wordDiff.oldSegments}
                        />
                      )
                    ) : line.kind === "add" && previousWordDiff ? (
                      lineSyntax ? (
                        <HighlightedWordDiffLine
                          kind="add"
                          segments={overlayWordDiffOnSyntax(
                            lineSyntax,
                            previousWordDiff.newSegments,
                          )}
                        />
                      ) : (
                        <PlainWordDiffLine
                          kind="add"
                          segments={previousWordDiff.newSegments}
                        />
                      )
                    ) : (
                      <SyntaxLine
                        fallbackText={line.text}
                        kind={line.kind}
                        opacity={line.kind === "ctx" ? "opacity-50" : undefined}
                        segments={lineSyntax}
                      />
                    )}
                  </span>
                </div>
              );
            });
          })}
        </div>
      </ScrollShadow>
    </div>
  );
}
