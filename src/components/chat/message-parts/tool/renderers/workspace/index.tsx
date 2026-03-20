"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useMemo, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { DiffView } from "../shared/diff-view";

type DiffInput = {
  comparePath?: string;
  contextLines?: number;
  path: string;
  proposedContent?: string;
};

type DiffOutput = {
  additions: number;
  deletions: number;
  diff: string;
  leftPath: string;
  rightPath: string;
  truncated: boolean;
};

type BatchReadOutput = {
  results: Array<{
    content: string | null;
    entries: string[];
    kind: "directory" | "file";
    path: string;
    truncated: boolean;
  }>;
};

type ApplyPatchInput = {
  patchText: string;
  rationale: string;
};

type ApplyPatchOutput = {
  files: Array<{
    additions: number;
    deletions: number;
    diff: string;
    operation: "add" | "delete" | "move" | "update";
    path: string;
  }>;
};

type MoveFileInput = {
  fromPath: string;
  rationale: string;
  toPath: string;
};

type MoveFileOutput = {
  bytesMoved: number;
  fromPath: string;
  toPath: string;
};

type DiagnosticsOutput = {
  diagnostics: Array<{
    code?: string;
    column: number;
    endColumn: number;
    endLine: number;
    file: string;
    line: number;
    message: string;
    severity: "error" | "info" | "warning";
    source: string;
  }>;
  summary: string;
};

type GitOutput =
  | {
      action: "status";
      branch: string | null;
      isClean: boolean;
      staged: Array<{ path: string; staged: string; unstaged: string }>;
      untracked: string[];
      unstaged: Array<{ path: string; staged: string; unstaged: string }>;
    }
  | {
      action: "diff";
      additions: number;
      deletions: number;
      diff: string;
      truncated: boolean;
    }
  | {
      action: "log";
      commits: Array<{
        author: string;
        date: string;
        hash: string;
        subject: string;
      }>;
      limit: number;
    }
  | {
      action: "branch_list";
      branches: Array<{ current: boolean; name: string }>;
    }
  | {
      action: "branch_create";
      name: string;
    }
  | {
      action: "checkout";
      branch: string;
    }
  | {
      action: "add";
      paths: string[];
    }
  | {
      action: "commit";
      commit: string;
      summary: string;
    };

function isDiffInput(value: unknown): value is DiffInput {
  const candidate = value as DiffInput;
  return !!candidate && typeof candidate.path === "string";
}

function isDiffOutput(value: unknown): value is DiffOutput {
  const candidate = value as DiffOutput;
  return (
    !!candidate &&
    typeof candidate.diff === "string" &&
    typeof candidate.leftPath === "string" &&
    typeof candidate.rightPath === "string"
  );
}

function isBatchReadOutput(value: unknown): value is BatchReadOutput {
  const candidate = value as BatchReadOutput;
  return !!candidate && Array.isArray(candidate.results);
}

function isApplyPatchInput(value: unknown): value is ApplyPatchInput {
  const candidate = value as ApplyPatchInput;
  return (
    !!candidate &&
    typeof candidate.patchText === "string" &&
    typeof candidate.rationale === "string"
  );
}

function isApplyPatchOutput(value: unknown): value is ApplyPatchOutput {
  const candidate = value as ApplyPatchOutput;
  return !!candidate && Array.isArray(candidate.files);
}

function isMoveFileInput(value: unknown): value is MoveFileInput {
  const candidate = value as MoveFileInput;
  return (
    !!candidate &&
    typeof candidate.fromPath === "string" &&
    typeof candidate.toPath === "string" &&
    typeof candidate.rationale === "string"
  );
}

function isMoveFileOutput(value: unknown): value is MoveFileOutput {
  const candidate = value as MoveFileOutput;
  return (
    !!candidate &&
    typeof candidate.fromPath === "string" &&
    typeof candidate.toPath === "string" &&
    typeof candidate.bytesMoved === "number"
  );
}

function isDiagnosticsOutput(value: unknown): value is DiagnosticsOutput {
  const candidate = value as DiagnosticsOutput;
  return (
    !!candidate &&
    Array.isArray(candidate.diagnostics) &&
    typeof candidate.summary === "string"
  );
}

function isGitOutput(value: unknown): value is GitOutput {
  const candidate = value as GitOutput;
  return !!candidate && typeof candidate.action === "string";
}

function splitPatchByFile(
  patchText: string,
): Array<{ diff: string; path: string }> {
  const results: Array<{ diff: string; path: string }> = [];
  const lines = patchText.split("\n");
  let currentPath = "";
  let currentLines: string[] = [];

  function flush() {
    if (currentPath && currentLines.length > 0) {
      results.push({ diff: currentLines.join("\n"), path: currentPath });
    }
    currentLines = [];
    currentPath = "";
  }

  for (const line of lines) {
    if (line.startsWith("--- a/") || line.startsWith("--- /dev/null")) {
      flush();
      currentLines.push(line);
    } else if (line.startsWith("+++ b/")) {
      currentPath = line.slice(6);
      currentLines.push(line);
    } else if (line.startsWith("+++ /dev/null")) {
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  flush();
  return results;
}

function buildSummary(
  toolName: string,
  part: RendererProps["part"],
): ReactNode {
  if (toolName === "diff") {
    const output =
      "output" in part && isDiffOutput(part.output) ? part.output : null;
    const input =
      "input" in part && isDiffInput(part.input) ? part.input : null;
    const shownPath = output?.leftPath ?? input?.path ?? "file";

    if (part.state === "output-available" && output) {
      return (
        <>
          Compared <span className="font-mono text-[12px]">{shownPath}</span>
          <span className="ml-1.5 text-[11px] text-foreground/40">
            +{output.additions} / -{output.deletions}
          </span>
        </>
      );
    }

    return (
      <>
        Generating diff for{" "}
        <span className="font-mono text-[12px]">{shownPath}</span>
      </>
    );
  }

  if (toolName === "batch_read") {
    const output =
      "output" in part && isBatchReadOutput(part.output) ? part.output : null;
    if (part.state === "output-available" && output) {
      return <>Read {output.results.length} paths</>;
    }
    return <>Reading multiple paths</>;
  }

  if (toolName === "apply_patch") {
    const output =
      "output" in part && isApplyPatchOutput(part.output) ? part.output : null;
    if (part.state === "output-available" && output) {
      return <>Applied patch to {output.files.length} files</>;
    }
    return <>Applying patch</>;
  }

  if (toolName === "move_file") {
    const output =
      "output" in part && isMoveFileOutput(part.output) ? part.output : null;
    const input =
      "input" in part && isMoveFileInput(part.input) ? part.input : null;
    const fromPath = output?.fromPath ?? input?.fromPath ?? "";
    const toPath = output?.toPath ?? input?.toPath ?? "";

    return (
      <>
        Move <span className="font-mono text-[12px]">{fromPath}</span>
        {toPath ? (
          <>
            {" "}
            to <span className="font-mono text-[12px]">{toPath}</span>
          </>
        ) : null}
      </>
    );
  }

  if (toolName === "diagnostics") {
    const output =
      "output" in part && isDiagnosticsOutput(part.output) ? part.output : null;
    if (part.state === "output-available" && output) {
      return <>{output.summary}</>;
    }
    return <>Collecting diagnostics</>;
  }

  if (toolName === "git") {
    const output =
      "output" in part && isGitOutput(part.output) ? part.output : null;
    const input =
      "input" in part
        ? (part.input as { action?: string } | undefined)
        : undefined;
    const action = output?.action ?? input?.action ?? "git";

    if (part.state === "output-available" && output) {
      switch (output.action) {
        case "status":
          return (
            <>
              Git status
              <span className="ml-1.5 text-[11px] text-foreground/40">
                {output.branch ? output.branch : "detached"}
              </span>
            </>
          );
        case "diff":
          return <>Git diff</>;
        case "log":
          return <>Git log</>;
        case "branch_list":
          return <>Git branches</>;
        case "branch_create":
          return <>Created branch {output.name}</>;
        case "checkout":
          return <>Checked out {output.branch}</>;
        case "add":
          return <>Staged {output.paths.length} paths</>;
        case "commit":
          return <>Created commit {output.commit.slice(0, 7)}</>;
      }
    }

    return <>Running git {action.replaceAll("_", " ")}</>;
  }

  return <>{toolName.replaceAll("_", " ")}</>;
}

function renderActions({
  onApprove,
  onDeny,
  part,
  rationale,
}: {
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
  part: RendererProps["part"];
  rationale?: string;
}) {
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;

  if (!showApprovalActions && !rationale) return null;

  return (
    <>
      {part.state === "approval-requested" && rationale ? (
        <p className="mb-1.5 line-clamp-2 text-[11px] text-muted">
          {rationale}
        </p>
      ) : null}
      {showApprovalActions ? (
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-7 min-w-0 px-3 text-[11px]"
            onPress={() => approvalId && onApprove?.(approvalId)}
            size="sm"
            type="button"
          >
            Approve
          </Button>
          <Button
            className="h-7 min-w-0 px-3 text-[11px]"
            onPress={() => approvalId && onDeny?.(approvalId)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Deny
          </Button>
        </div>
      ) : null}
    </>
  );
}

function renderGitBody(output: GitOutput) {
  switch (output.action) {
    case "status":
      return (
        <div className="space-y-3 font-mono text-[11px] text-foreground/70">
          <p>Branch: {output.branch ?? "detached"}</p>
          <p>
            Clean: {output.isClean ? "yes" : "no"} · staged{" "}
            {output.staged.length} · unstaged {output.unstaged.length} ·
            untracked {output.untracked.length}
          </p>
          {output.staged.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] text-foreground/40">Staged</p>
              {output.staged.map((entry) => (
                <div key={`staged-${entry.path}`}>{entry.path}</div>
              ))}
            </div>
          ) : null}
          {output.unstaged.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] text-foreground/40">Unstaged</p>
              {output.unstaged.map((entry) => (
                <div key={`unstaged-${entry.path}`}>{entry.path}</div>
              ))}
            </div>
          ) : null}
          {output.untracked.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] text-foreground/40">Untracked</p>
              {output.untracked.map((entry) => (
                <div key={`untracked-${entry}`}>{entry}</div>
              ))}
            </div>
          ) : null}
        </div>
      );
    case "diff":
      return output.diff ? (
        <DiffView diff={output.diff} path="git diff" />
      ) : (
        <p className="font-mono text-[11px] text-foreground/70">
          No diff output.
        </p>
      );
    case "log":
      return (
        <div className="space-y-2 font-mono text-[11px] text-foreground/70">
          {output.commits.map((commit) => (
            <div key={commit.hash}>
              <p>
                {commit.hash.slice(0, 12)} · {commit.subject}
              </p>
              <p className="text-foreground/40">
                {commit.author} · {commit.date}
              </p>
            </div>
          ))}
        </div>
      );
    case "branch_list":
      return (
        <div className="space-y-1 font-mono text-[11px] text-foreground/70">
          {output.branches.map((branch) => (
            <div key={branch.name}>
              {branch.current ? "* " : "  "}
              {branch.name}
            </div>
          ))}
        </div>
      );
    case "branch_create":
      return (
        <p className="font-mono text-[11px] text-foreground/70">
          {output.name}
        </p>
      );
    case "checkout":
      return (
        <p className="font-mono text-[11px] text-foreground/70">
          {output.branch}
        </p>
      );
    case "add":
      return (
        <div className="space-y-1 font-mono text-[11px] text-foreground/70">
          {output.paths.map((entry) => (
            <div key={entry}>{entry}</div>
          ))}
        </div>
      );
    case "commit":
      return (
        <div className="space-y-1 font-mono text-[11px] text-foreground/70">
          <p>{output.commit}</p>
          <p>{output.summary}</p>
        </div>
      );
  }
}

function renderBody(
  toolName: string,
  part: RendererProps["part"],
  errorText?: string,
) {
  if (part.state === "output-denied") {
    return <p className="text-[11px] text-muted">Execution denied.</p>;
  }

  if ("output" in part && part.output !== undefined) {
    if (toolName === "diff" && isDiffOutput(part.output)) {
      return part.output.diff ? (
        <DiffView diff={part.output.diff} path={part.output.leftPath} />
      ) : (
        <p className="font-mono text-[11px] text-foreground/70">
          No changes detected.
        </p>
      );
    }

    if (toolName === "batch_read" && isBatchReadOutput(part.output)) {
      return (
        <div className="space-y-3">
          {part.output.results.map((result) => (
            <div key={result.path}>
              <p className="mb-1 font-mono text-[11px] text-foreground/50">
                {result.path}
              </p>
              <ScrollShadow className="max-h-[140px] whitespace-pre-wrap rounded-lg border border-border/30 p-2 font-mono text-[11px] text-foreground/70">
                {result.content ??
                  (result.kind === "directory"
                    ? result.entries.join("\n")
                    : "")}
              </ScrollShadow>
            </div>
          ))}
        </div>
      );
    }

    if (toolName === "apply_patch" && isApplyPatchOutput(part.output)) {
      return (
        <div className="flex flex-col gap-2">
          {part.output.files.map((file) => (
            <DiffView
              key={`${file.path}:${file.operation}`}
              diff={file.diff}
              path={file.path}
            />
          ))}
        </div>
      );
    }

    if (toolName === "move_file" && isMoveFileOutput(part.output)) {
      return (
        <p className="whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
          {[
            `from: ${part.output.fromPath}`,
            `to: ${part.output.toPath}`,
            `${part.output.bytesMoved} bytes moved`,
          ].join("\n")}
        </p>
      );
    }

    if (toolName === "diagnostics" && isDiagnosticsOutput(part.output)) {
      return (
        <div className="space-y-3">
          <p className="text-[11px] text-foreground/60">
            {part.output.summary}
          </p>
          <div className="space-y-2 font-mono text-[11px] text-foreground/70">
            {part.output.diagnostics.map((diagnostic, index) => (
              <div key={`${diagnostic.file}:${diagnostic.line}:${index}`}>
                <p>
                  <span className="text-foreground/40">{diagnostic.file}</span>{" "}
                  [{diagnostic.severity}] {diagnostic.line}:{diagnostic.column}
                </p>
                <p>{diagnostic.message}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (toolName === "git" && isGitOutput(part.output)) {
      return renderGitBody(part.output);
    }
  }

  if ("input" in part && part.input !== undefined) {
    if (toolName === "apply_patch" && isApplyPatchInput(part.input)) {
      const fileDiffs = splitPatchByFile(part.input.patchText);
      if (fileDiffs.length > 0) {
        return (
          <div className="flex flex-col gap-2">
            {fileDiffs.map((fd, i) => (
              <DiffView key={`${fd.path}-${i}`} diff={fd.diff} path={fd.path} />
            ))}
          </div>
        );
      }
      return (
        <ScrollShadow className="max-h-[220px] whitespace-pre-wrap rounded-lg border border-border/30 p-2 font-mono text-[11px] text-foreground/70">
          {part.input.patchText}
        </ScrollShadow>
      );
    }

    if (toolName === "move_file" && isMoveFileInput(part.input)) {
      return (
        <p className="whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
          {`${part.input.fromPath}\n->\n${part.input.toPath}`}
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

function getRationale(toolName: string, part: RendererProps["part"]) {
  if (!("input" in part) || part.input === undefined) return "";
  if (toolName === "apply_patch" && isApplyPatchInput(part.input)) {
    return part.input.rationale;
  }
  if (toolName === "move_file" && isMoveFileInput(part.input)) {
    return part.input.rationale;
  }
  return "";
}

export const WorkspaceTool = memo(function WorkspaceTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const isRunningState = part.state === "approval-responded";
  const isFinishedState =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    part.state === "output-available";
  const isErrorState =
    part.state === "output-denied" || part.state === "output-error";
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const rationale = getRationale(toolName, part);
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested" || isRunningState,
  );

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested" || isRunningState);
  }, [isRunningState, part.state, part.toolCallId]);

  const summary = useMemo(() => buildSummary(toolName, part), [part, toolName]);
  const body = renderBody(toolName, part, partErrorText);

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
      actions={renderActions({ onApprove, onDeny, part, rationale })}
    >
      {body}
    </ToolLayout>
  );
});
