"use client";

import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererProps } from "../../renderer";
import {
  buildPreviewUnifiedDiff,
  DiffView as SharedDiffView,
} from "../shared/diff-view";
import { ToolLayout } from "../shared/tool-layout";

type EditInput = {
  newString: string;
  oldString: string;
  path: string;
  rationale: string;
  replaceAll?: boolean;
};

type EditOutput = {
  bytesWritten: number;
  path: string;
  replacements: number;
};

type MultiEditInput = {
  edits: Array<{
    newString: string;
    oldString: string;
    replaceAll?: boolean;
  }>;
  path: string;
  rationale: string;
};

type MultiEditOutput = {
  bytesWritten: number;
  edits: Array<{
    index: number;
    replacements: number;
    replaceAll: boolean;
  }>;
  editsApplied: number;
  path: string;
  replacements: number;
};

type CreateFileInput = {
  content: string;
  path: string;
  rationale: string;
};

type CreateFileOutput = {
  bytesWritten: number;
  lineCount: number;
  path: string;
};

type DeleteFileInput = {
  path: string;
  rationale: string;
};

type DeleteFileOutput = {
  bytesDeleted: number;
  path: string;
};

function getToolName(part: RendererProps["part"]) {
  return part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
}

function isEditInput(value: unknown): value is EditInput {
  const candidate = value as {
    newString?: unknown;
    oldString?: unknown;
    path?: unknown;
    rationale?: unknown;
    replaceAll?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.newString === "string" &&
    typeof candidate.oldString === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.rationale === "string" &&
    (candidate.replaceAll === undefined ||
      typeof candidate.replaceAll === "boolean")
  );
}

function isEditOutput(value: unknown): value is EditOutput {
  const candidate = value as {
    bytesWritten?: unknown;
    path?: unknown;
    replacements?: unknown;
  };
  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.bytesWritten === "number" &&
    typeof candidate.path === "string" &&
    typeof candidate.replacements === "number"
  );
}

function isMultiEditInput(value: unknown): value is MultiEditInput {
  const candidate = value as {
    edits?: unknown;
    path?: unknown;
    rationale?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    Array.isArray(candidate.edits) &&
    candidate.edits.every(
      (edit) =>
        !!edit &&
        typeof edit === "object" &&
        typeof (edit as { newString?: unknown }).newString === "string" &&
        typeof (edit as { oldString?: unknown }).oldString === "string" &&
        ((edit as { replaceAll?: unknown }).replaceAll === undefined ||
          typeof (edit as { replaceAll?: unknown }).replaceAll === "boolean"),
    ) &&
    typeof candidate.path === "string" &&
    typeof candidate.rationale === "string"
  );
}

function isMultiEditOutput(value: unknown): value is MultiEditOutput {
  const candidate = value as {
    bytesWritten?: unknown;
    edits?: unknown;
    editsApplied?: unknown;
    path?: unknown;
    replacements?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.bytesWritten === "number" &&
    Array.isArray(candidate.edits) &&
    candidate.edits.every(
      (edit) =>
        !!edit &&
        typeof edit === "object" &&
        typeof (edit as { index?: unknown }).index === "number" &&
        typeof (edit as { replacements?: unknown }).replacements === "number" &&
        typeof (edit as { replaceAll?: unknown }).replaceAll === "boolean",
    ) &&
    typeof candidate.editsApplied === "number" &&
    typeof candidate.path === "string" &&
    typeof candidate.replacements === "number"
  );
}

function isCreateFileInput(value: unknown): value is CreateFileInput {
  const candidate = value as {
    content?: unknown;
    path?: unknown;
    rationale?: unknown;
  };
  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.content === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.rationale === "string"
  );
}

function isCreateFileOutput(value: unknown): value is CreateFileOutput {
  const candidate = value as {
    bytesWritten?: unknown;
    lineCount?: unknown;
    path?: unknown;
  };
  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.bytesWritten === "number" &&
    typeof candidate.lineCount === "number" &&
    typeof candidate.path === "string"
  );
}

function isDeleteFileInput(value: unknown): value is DeleteFileInput {
  const candidate = value as { path?: unknown; rationale?: unknown };
  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.path === "string" &&
    typeof candidate.rationale === "string"
  );
}

function isDeleteFileOutput(value: unknown): value is DeleteFileOutput {
  const candidate = value as { bytesDeleted?: unknown; path?: unknown };
  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.bytesDeleted === "number" &&
    typeof candidate.path === "string"
  );
}

function toDiffLines(value: string) {
  return value.split(/\r?\n/);
}

function buildUnifiedDiff({
  after,
  before,
  path,
}: {
  after: string;
  before: string;
  path: string;
}) {
  return buildPreviewUnifiedDiff({ after, before, path });
}

type DiffLineKind = "add" | "del" | "ctx";

type DiffLine = {
  kind: DiffLineKind;
  text: string;
  oldNum: number | null;
  newNum: number | null;
};

type DiffGroup =
  | { type: "lines"; lines: DiffLine[] }
  | { type: "collapsed"; lines: DiffLine[]; count: number };

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
    )
      continue;

    if (rawLine.startsWith("+")) {
      additions++;
      lines.push({
        kind: "add",
        text: rawLine.slice(1),
        oldNum: null,
        newNum: newNum++,
      });
    } else if (rawLine.startsWith("-")) {
      deletions++;
      lines.push({
        kind: "del",
        text: rawLine.slice(1),
        oldNum: oldNum++,
        newNum: null,
      });
    } else {
      lines.push({
        kind: "ctx",
        text: rawLine.slice(1),
        oldNum: oldNum++,
        newNum: newNum++,
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
      groups.push({ type: "lines", lines: ctxBuffer });
    } else {
      const top = ctxBuffer.slice(0, CONTEXT_KEEP);
      const bottom = ctxBuffer.slice(-CONTEXT_KEEP);
      const middle = ctxBuffer.slice(CONTEXT_KEEP, -CONTEXT_KEEP);
      if (groups.length > 0 && top.length > 0) {
        groups.push({ type: "lines", lines: top });
      } else if (groups.length === 0) {
        groups.push({ type: "lines", lines: top });
      }
      if (middle.length > 0) {
        groups.push({ type: "collapsed", lines: middle, count: middle.length });
      }
      groups.push({ type: "lines", lines: bottom });
    }
    ctxBuffer = [];
  }

  for (const line of lines) {
    if (line.kind === "ctx") {
      ctxBuffer.push(line);
    } else {
      flushCtx();
      const last = groups[groups.length - 1];
      if (last && last.type === "lines") {
        last.lines.push(line);
      } else {
        groups.push({ type: "lines", lines: [line] });
      }
    }
  }

  flushCtx();

  return groups;
}

type WordSegment = { text: string; highlight: boolean };

function computeWordDiff(
  oldText: string,
  newText: string,
): {
  oldSegments: WordSegment[];
  newSegments: WordSegment[];
} {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const lcs = longestCommonSubsequence(oldTokens, newTokens);

  const oldSegments = buildSegments(oldTokens, lcs, "old");
  const newSegments = buildSegments(newTokens, lcs, "new");

  return { oldSegments, newSegments };
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

  for (let i = 1; i <= m; i++) {
    const prevRow = dp[i - 1]!;
    const curRow = dp[i]!;
    for (let j = 1; j <= n; j++) {
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
      i--;
      j--;
    } else if (dp[i - 1]![j]! > dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }

  return new Set([
    ...Array.from(commonIndicesA).map((idx) => `a:${idx}`),
    ...Array.from(commonIndicesB).map((idx) => `b:${idx}`),
  ]);
}

function buildSegments(
  tokens: string[],
  lcs: Set<string>,
  side: "new" | "old",
): WordSegment[] {
  const segments: WordSegment[] = [];
  let buffer = "";
  let bufferHighlight = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    const isCommon = lcs.has(`${side === "old" ? "a" : "b"}:${i}`);
    const highlight = !isCommon;

    if (segments.length === 0 && buffer === "") {
      buffer = token;
      bufferHighlight = highlight;
    } else if (highlight === bufferHighlight) {
      buffer += token;
    } else {
      segments.push({ text: buffer, highlight: bufferHighlight });
      buffer = token;
      bufferHighlight = highlight;
    }
  }

  if (buffer) {
    segments.push({ text: buffer, highlight: bufferHighlight });
  }

  return segments;
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
  segments: WordSegment[];
  kind: "add" | "del";
}) {
  const hlClass =
    kind === "add"
      ? "bg-success/20 rounded-[2px] px-px"
      : "bg-danger/20 rounded-[2px] px-px";

  return (
    <>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <span key={i} className={hlClass}>
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function computeWordDiffsForLines(lines: DiffLine[]) {
  const wordDiffByIndex = new Map<
    number,
    { oldSegments: WordSegment[]; newSegments: WordSegment[] }
  >();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.kind !== "del") continue;
    const next = lines[i + 1];
    if (!next || next.kind !== "add") continue;
    wordDiffByIndex.set(i, computeWordDiff(line.text, next.text));
  }

  return wordDiffByIndex;
}

function DiffView({ diff, path }: { diff: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(
    () => new Set(),
  );

  const { additions, deletions, allLines, groups, wordDiffs } = useMemo(() => {
    const { additions: a, deletions: d, lines } = parseDiff(diff);
    const g = groupLines(lines);
    const wd = computeWordDiffsForLines(lines);
    return {
      additions: a,
      deletions: d,
      allLines: lines,
      groups: g,
      wordDiffs: wd,
    };
  }, [diff]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(diff);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [diff]);

  const handleExpand = useCallback((regionIndex: number) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      next.add(regionIndex);
      return next;
    });
  }, []);

  const fileName = path.split("/").pop() ?? path;
  const gutterW = "w-[34px]";

  const renderLine = (line: DiffLine, absIdx: number) => {
    const isAdd = line.kind === "add";
    const isDel = line.kind === "del";
    const isCtx = line.kind === "ctx";

    const wd = isDel ? wordDiffs.get(absIdx) : undefined;
    const prevWd = isAdd ? wordDiffs.get(absIdx - 1) : undefined;

    return (
      <div
        key={absIdx}
        className={isAdd ? "bg-success/6" : isDel ? "bg-danger/6" : ""}
      >
        <span
          className={`${gutterW} inline-block shrink-0 select-none border-r border-border/20 pr-1 text-right text-[10px] ${
            isAdd
              ? "text-success/40"
              : isDel
                ? "text-danger/40"
                : "text-foreground/15"
          }`}
        >
          {line.oldNum ?? " "}
        </span>
        <span
          className={`${gutterW} inline-block shrink-0 select-none border-r border-border/20 pr-1 text-right text-[10px] ${
            isAdd
              ? "text-success/40"
              : isDel
                ? "text-danger/40"
                : "text-foreground/15"
          }`}
        >
          {line.newNum ?? " "}
        </span>
        <span
          className={`inline-block w-4 select-none text-center ${
            isAdd
              ? "text-success/60"
              : isDel
                ? "text-danger/60"
                : "text-foreground/10"
          }`}
        >
          {isAdd ? "+" : isDel ? "−" : " "}
        </span>
        <span className={isCtx ? "text-foreground/40" : "text-foreground/80"}>
          {isDel && wd ? (
            <WordDiffLine segments={wd.oldSegments} kind="del" />
          ) : isAdd && prevWd ? (
            <WordDiffLine segments={prevWd.newSegments} kind="add" />
          ) : (
            line.text
          )}
        </span>
      </div>
    );
  };

  const absoluteIndex = (line: DiffLine) => allLines.indexOf(line);

  return (
    <div className="overflow-hidden rounded-lg border border-border/40">
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-1">
        <span className="font-mono text-[11px] text-foreground/50">
          {fileName}
        </span>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            {additions > 0 ? (
              <span className="text-success">+{additions}</span>
            ) : null}
            {deletions > 0 ? (
              <span className="text-danger">-{deletions}</span>
            ) : null}
          </div>
          <button
            aria-label="Copy diff"
            className="flex cursor-pointer items-center justify-center rounded p-0.5 text-foreground/30 hover:text-foreground/60"
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
      <ScrollShadow className="max-h-[320px]">
        <div className="font-mono text-[11px]">
          {groups.map((group, gi) => {
            if (group.type === "collapsed" && !expandedRegions.has(gi)) {
              return (
                <CollapsedRegion
                  key={`c-${gi}`}
                  count={group.count}
                  onExpand={() => handleExpand(gi)}
                />
              );
            }

            return group.lines.map((line) =>
              renderLine(line, absoluteIndex(line)),
            );
          })}
        </div>
      </ScrollShadow>
    </div>
  );
}

function getPathAndRationale(part: RendererProps["part"], toolName: string) {
  if ("input" in part && part.input !== undefined) {
    if (toolName === "edit" && isEditInput(part.input)) {
      return { path: part.input.path, rationale: part.input.rationale };
    }
    if (toolName === "multiedit" && isMultiEditInput(part.input)) {
      return { path: part.input.path, rationale: part.input.rationale };
    }
    if (toolName === "create_file" && isCreateFileInput(part.input)) {
      return { path: part.input.path, rationale: part.input.rationale };
    }
    if (toolName === "delete_file" && isDeleteFileInput(part.input)) {
      return { path: part.input.path, rationale: part.input.rationale };
    }
  }
  return { path: "", rationale: "" };
}

function getVerb(toolName: string, tense: "past" | "present") {
  switch (toolName) {
    case "create_file":
      return tense === "past" ? "Created" : "Creating";
    case "delete_file":
      return tense === "past" ? "Deleted" : "Deleting";
    default:
      return tense === "past" ? "Edited" : "Editing";
  }
}

function buildSummary(
  part: RendererProps["part"],
  toolName: string,
  path: string,
): ReactNode {
  const isRunning =
    part.state === "approval-responded" ||
    part.state === "input-streaming" ||
    part.state === "input-available";
  const isDenied = part.state === "output-denied";
  const isError = part.state === "output-error";
  const isDone = part.state === "output-available";

  if (isDenied) {
    return <>{getVerb(toolName, "past")} denied</>;
  }

  if (isError) {
    return (
      <>
        Failed to{" "}
        {toolName === "create_file"
          ? "create"
          : toolName === "delete_file"
            ? "delete"
            : "edit"}{" "}
        <span className="font-mono text-[12px]">{path}</span>
      </>
    );
  }

  if (isDone && "output" in part && part.output !== undefined) {
    if (toolName === "edit" && isEditOutput(part.output)) {
      return (
        <>
          {getVerb(toolName, "past")}{" "}
          <span className="font-mono text-[12px]">{part.output.path}</span>
          <span className="ml-1.5 text-[11px] text-foreground/40">
            {part.output.replacements} replacement
            {part.output.replacements === 1 ? "" : "s"}
          </span>
        </>
      );
    }
    if (toolName === "multiedit" && isMultiEditOutput(part.output)) {
      return (
        <>
          {getVerb(toolName, "past")}{" "}
          <span className="font-mono text-[12px]">{part.output.path}</span>
          <span className="ml-1.5 text-[11px] text-foreground/40">
            {part.output.editsApplied} edit
            {part.output.editsApplied === 1 ? "" : "s"}
          </span>
        </>
      );
    }
    if (toolName === "create_file" && isCreateFileOutput(part.output)) {
      return (
        <>
          {getVerb(toolName, "past")}{" "}
          <span className="font-mono text-[12px]">{part.output.path}</span>
          <span className="ml-1.5 text-[11px] text-foreground/40">
            {part.output.lineCount} lines
          </span>
        </>
      );
    }
    if (toolName === "delete_file" && isDeleteFileOutput(part.output)) {
      return (
        <>
          {getVerb(toolName, "past")}{" "}
          <span className="font-mono text-[12px]">{part.output.path}</span>
        </>
      );
    }
  }

  if (isRunning || part.state === "approval-requested") {
    return (
      <>
        {getVerb(toolName, "present")}{" "}
        <span className="font-mono text-[12px]">{path}</span>
      </>
    );
  }

  return (
    <>
      {getVerb(toolName, "present")}{" "}
      <span className="font-mono text-[12px]">{path}</span>
    </>
  );
}

function buildBody(
  part: RendererProps["part"],
  toolName: string,
  errorText?: string,
): ReactNode {
  if (part.state === "output-denied") {
    return <p className="text-[11px] text-muted">Execution denied.</p>;
  }

  if ("output" in part && part.output !== undefined) {
    if (toolName === "edit" && isEditOutput(part.output)) {
      return (
        <p className="whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
          {[
            `${part.output.replacements} replacement${part.output.replacements === 1 ? "" : "s"} applied`,
            `${part.output.bytesWritten} bytes written`,
          ].join("\n")}
        </p>
      );
    }

    if (toolName === "multiedit" && isMultiEditOutput(part.output)) {
      return (
        <p className="whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
          {[
            `${part.output.editsApplied} edit${part.output.editsApplied === 1 ? "" : "s"} applied`,
            `${part.output.replacements} replacement${part.output.replacements === 1 ? "" : "s"}`,
            `${part.output.bytesWritten} bytes written`,
          ].join("\n")}
        </p>
      );
    }

    if (toolName === "create_file" && isCreateFileOutput(part.output)) {
      return (
        <p className="whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
          {`${part.output.lineCount} lines · ${part.output.bytesWritten} bytes written`}
        </p>
      );
    }

    if (toolName === "delete_file" && isDeleteFileOutput(part.output)) {
      return (
        <p className="whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
          {`${part.output.bytesDeleted} bytes removed`}
        </p>
      );
    }
  }

  if ("input" in part && part.input !== undefined) {
    if (toolName === "edit" && isEditInput(part.input)) {
      const diff = buildUnifiedDiff({
        after: part.input.newString,
        before: part.input.oldString,
        path: part.input.path,
      });
      return <SharedDiffView diff={diff} path={part.input.path} />;
    }

    if (toolName === "multiedit" && isMultiEditInput(part.input)) {
      const input = part.input;
      return (
        <div className="flex flex-col gap-2">
          {input.edits.map((edit, index) => {
            const diff = buildUnifiedDiff({
              after: edit.newString,
              before: edit.oldString,
              path: input.path,
            });
            return (
              <SharedDiffView
                key={index}
                diff={diff}
                path={`${input.path} #${index + 1}${edit.replaceAll ? " (all)" : ""}`}
              />
            );
          })}
        </div>
      );
    }

    if (toolName === "create_file" && isCreateFileInput(part.input)) {
      const diff = buildUnifiedDiff({
        after: part.input.content,
        before: "",
        path: part.input.path,
      });
      return <SharedDiffView diff={diff} path={part.input.path} />;
    }

    if (toolName === "delete_file" && isDeleteFileInput(part.input)) {
      return (
        <p className="font-mono text-[11px] text-foreground/70">
          {part.input.path}
        </p>
      );
    }
  }

  if (errorText) {
    return (
      <p className="text-[11px] text-danger-soft-foreground">{errorText}</p>
    );
  }

  return null;
}

export const FileTool = memo(function FileTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part);
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;
  const isRunningState = part.state === "approval-responded";
  const isFinishedState =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    part.state === "output-available";
  const isErrorState =
    part.state === "output-denied" || part.state === "output-error";
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const { path, rationale } = getPathAndRationale(part, toolName);
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested" || isRunningState,
  );

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested" || isRunningState);
  }, [isRunningState, part.state, part.toolCallId]);

  const body = buildBody(part, toolName, partErrorText);
  const summary = buildSummary(part, toolName, path);

  return (
    <ToolLayout
      summary={summary}
      isRunning={
        isRunningState ||
        (!isFinishedState && part.state !== "approval-requested")
      }
      isError={isErrorState}
      isExpandable={isFinishedState}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={
        partErrorText && part.state !== "output-error"
          ? partErrorText
          : undefined
      }
      actions={
        <>
          {part.state === "approval-requested" && rationale ? (
            <p className="mb-1.5 line-clamp-2 text-[11px] text-muted">
              {rationale}
            </p>
          ) : null}
          {showApprovalActions ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="h-7 min-w-0 px-3 text-[11px]"
                onPress={() => approvalId && onApprove?.(approvalId)}
                type="button"
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 min-w-0 px-3 text-[11px]"
                onPress={() => approvalId && onDeny?.(approvalId)}
                type="button"
              >
                Deny
              </Button>
            </div>
          ) : null}
        </>
      }
    >
      {body}
    </ToolLayout>
  );
});
