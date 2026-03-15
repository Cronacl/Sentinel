"use client";

import { useCallback, useMemo, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { createUnifiedDiff } from "@/lib/diff/unified";

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

const CONTEXT_KEEP = 2;

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

function CollapsedRegion({
  count,
  onExpand,
}: {
  count: number;
  onExpand: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-2 bg-foreground/2 px-0 py-px text-left hover:bg-foreground/4"
      onClick={onExpand}
      type="button"
    >
      <span className="w-[72px] shrink-0 select-none border-r border-border/20 text-center font-mono text-[10px] text-foreground/20">
        ···
      </span>
      <span className="font-mono text-[10px] text-foreground/30">
        {count} unchanged line{count !== 1 ? "s" : ""}
      </span>
    </button>
  );
}

function WordDiffLine({
  segments,
  kind,
}: {
  kind: "add" | "del";
  segments: WordSegment[];
}) {
  const highlightClass =
    kind === "add"
      ? "rounded-[2px] bg-success/20 px-px"
      : "rounded-[2px] bg-danger/20 px-px";

  return (
    <>
      {segments.map((segment, index) =>
        segment.highlight ? (
          <span key={index} className={highlightClass}>
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
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

export function DiffView({ diff, path }: { diff: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(
    () => new Set(),
  );

  const { additions, allLines, deletions, groups, wordDiffs } = useMemo(() => {
    const { additions: nextAdditions, deletions: nextDeletions, lines } =
      parseDiff(diff);
    return {
      additions: nextAdditions,
      allLines: lines,
      deletions: nextDeletions,
      groups: groupLines(lines),
      wordDiffs: computeWordDiffsForLines(lines),
    };
  }, [diff]);

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
  const gutterWidth = "w-[34px]";

  return (
    <div className="overflow-hidden rounded-lg border border-border/40">
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-1">
        <span className="font-mono text-[11px] text-foreground/50">
          {fileName}
        </span>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            {additions > 0 ? <span className="text-success">+{additions}</span> : null}
            {deletions > 0 ? <span className="text-danger">-{deletions}</span> : null}
          </div>
          <Button
            isIconOnly
            aria-label="Copy diff"
            className="h-5 min-w-0 bg-transparent p-0 text-foreground/30 hover:text-foreground/60"
            onPress={() => void handleCopy()}
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={copied ? Tick01Icon : Copy01Icon}
              size={11}
              strokeWidth={1.5}
            />
          </Button>
        </div>
      </div>
      <ScrollShadow className="max-h-[320px]">
        <div className="font-mono text-[11px] leading-[18px]">
          {groups.map((group, groupIndex) => {
            if (group.type === "collapsed" && !expandedRegions.has(groupIndex)) {
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
              const wordDiff = line.kind === "del" ? wordDiffs.get(lineIndex) : undefined;
              const previousWordDiff =
                line.kind === "add" ? wordDiffs.get(lineIndex - 1) : undefined;

              return (
                <div
                  key={`${lineIndex}:${line.kind}:${line.text}`}
                  className={
                    line.kind === "add"
                      ? "bg-success/6"
                      : line.kind === "del"
                        ? "bg-danger/6"
                        : ""
                  }
                >
                  <span
                    className={`${gutterWidth} inline-block shrink-0 select-none border-r border-border/20 pr-1 text-right text-[10px] ${
                      line.kind === "add"
                        ? "text-success/40"
                        : line.kind === "del"
                          ? "text-danger/40"
                          : "text-foreground/15"
                    }`}
                  >
                    {line.oldNum ?? " "}
                  </span>
                  <span
                    className={`${gutterWidth} inline-block shrink-0 select-none border-r border-border/20 pr-1 text-right text-[10px] ${
                      line.kind === "add"
                        ? "text-success/40"
                        : line.kind === "del"
                          ? "text-danger/40"
                          : "text-foreground/15"
                    }`}
                  >
                    {line.newNum ?? " "}
                  </span>
                  <span
                    className={`inline-block w-4 select-none text-center ${
                      line.kind === "add"
                        ? "text-success/60"
                        : line.kind === "del"
                          ? "text-danger/60"
                          : "text-foreground/10"
                    }`}
                  >
                    {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
                  </span>
                  <span
                    className={
                      line.kind === "ctx" ? "text-foreground/40" : "text-foreground/80"
                    }
                  >
                    {line.kind === "del" && wordDiff ? (
                      <WordDiffLine kind="del" segments={wordDiff.oldSegments} />
                    ) : line.kind === "add" && previousWordDiff ? (
                      <WordDiffLine kind="add" segments={previousWordDiff.newSegments} />
                    ) : (
                      line.text
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
