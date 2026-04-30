"use client";

import type { ReactNode } from "react";
import { memo, useMemo, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { DiffView } from "../shared/diff-view";
import { ToolLayout } from "../shared/tool-layout";
import {
  detectLanguageFromPath,
  languageToVSCodeIcon,
} from "@/lib/syntax/highlighter";

type FileChangeKind = string | { type: string; move_path?: string | null };

type FileChange = {
  diff?: string;
  kind: FileChangeKind;
  path: string;
};

type CodexFileChangeInput = {
  changes: FileChange[];
  reason?: string | null;
};

type CodexFileChangeOutput = {
  output: string;
  status: string;
};

function resolveKindString(kind: FileChangeKind): string {
  if (typeof kind === "string") return kind;
  if (kind && typeof kind === "object" && typeof kind.type === "string") {
    return kind.type;
  }
  return "update";
}

function isFileChange(value: unknown): value is FileChange {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.path === "string" &&
    (typeof v.kind === "string" ||
      (typeof v.kind === "object" && v.kind !== null))
  );
}

function isFileChangeInput(value: unknown): value is CodexFileChangeInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.changes) && v.changes.every(isFileChange);
}

function isFileChangeOutput(value: unknown): value is CodexFileChangeOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "string";
}

function getMovePath(kind: FileChangeKind): string | null {
  if (typeof kind === "object" && kind?.move_path) {
    return kind.move_path;
  }
  return null;
}

function getChangeVerb(kind: FileChangeKind): string {
  const k = resolveKindString(kind);
  if (getMovePath(kind)) return "Renamed";
  switch (k) {
    case "add":
      return "Created";
    case "delete":
      return "Deleted";
    default:
      return "Modified";
  }
}

function getChangeColor(kind: FileChangeKind): string {
  const k = resolveKindString(kind);
  switch (k) {
    case "add":
      return "text-success";
    case "delete":
      return "text-danger";
    default:
      return "text-warning";
  }
}

function getFileName(path: string) {
  return path.split("/").pop() ?? path;
}

function stripDiffMetadata(raw: string): string {
  const lines = raw.split("\n");
  const cleaned: string[] = [];

  for (const line of lines) {
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to") ||
      line.startsWith("Binary files")
    ) {
      continue;
    }
    cleaned.push(line);
  }

  return cleaned.join("\n");
}

/**
 * Split a multi-file git diff into per-file sections.
 * Each section preserves its unified diff content (@@, +, -, context).
 */
function splitGitDiffByFile(rawDiff: string) {
  const sections: Array<{ diff: string; path: string }> = [];
  const lines = rawDiff.split("\n");
  let currentPath = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const gitHeader = line.match(/^diff --git a\/(.+?) b\//);
    if (gitHeader) {
      if (currentPath && currentLines.length > 0) {
        sections.push({
          diff: stripDiffMetadata(currentLines.join("\n")),
          path: currentPath,
        });
      }
      currentPath = gitHeader[1] ?? "";
      currentLines = [line];
      continue;
    }

    const unifiedHeader = line.match(/^---\s+a\/(.+)/);
    if (unifiedHeader && !currentPath) {
      if (currentLines.length > 0) {
        sections.push({
          diff: stripDiffMetadata(currentLines.join("\n")),
          path: "patch",
        });
      }
      currentPath = unifiedHeader[1] ?? "";
      currentLines = [line];
      continue;
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    const diff = stripDiffMetadata(currentLines.join("\n"));
    if (diff.trim()) {
      sections.push({ diff, path: currentPath || "patch" });
    }
  }

  return sections;
}

/**
 * Build per-file diff sections from all available sources:
 * 1. Individual `diff` fields on each change entry
 * 2. The accumulated output.output diff text
 */
function buildDiffSections(
  changes: FileChange[],
  output: CodexFileChangeOutput | null,
) {
  const sections: Array<{ diff: string; path: string }> = [];

  const perChangeDiffs = changes.filter(
    (c) => typeof c.diff === "string" && c.diff.trim(),
  );

  if (perChangeDiffs.length > 0) {
    for (const change of perChangeDiffs) {
      sections.push({
        diff: stripDiffMetadata(change.diff!),
        path: change.path,
      });
    }
    return sections;
  }

  if (output?.output?.trim()) {
    return splitGitDiffByFile(output.output);
  }

  return sections;
}

function buildSummary(
  part: RendererProps["part"],
  input: CodexFileChangeInput,
  output: CodexFileChangeOutput | null,
): ReactNode {
  const count = input.changes.length;
  const fileLabel = count === 1 ? "file" : "files";

  if (part.state === "output-denied") {
    return <>File changes denied</>;
  }

  if (part.state === "output-error") {
    return (
      <>
        Failed to apply changes to{" "}
        <span className="font-mono text-[12px]">
          {count} {fileLabel}
        </span>
      </>
    );
  }

  if (output?.status === "completed" || part.state === "output-available") {
    if (count === 1 && input.changes[0]) {
      return (
        <>
          {getChangeVerb(input.changes[0].kind)}{" "}
          <span className="font-mono text-[12px]">
            {getFileName(input.changes[0].path)}
          </span>
        </>
      );
    }
    return (
      <>
        Applied changes to{" "}
        <span className="font-mono text-[12px]">
          {count} {fileLabel}
        </span>
      </>
    );
  }

  if (part.state === "approval-requested") {
    if (count === 1 && input.changes[0]) {
      return (
        <>
          {getChangeVerb(input.changes[0].kind).replace(/d$/, "")}{" "}
          <span className="font-mono text-[12px]">
            {getFileName(input.changes[0].path)}
          </span>
        </>
      );
    }
    return (
      <>
        Apply changes to{" "}
        <span className="font-mono text-[12px]">
          {count} {fileLabel}
        </span>
      </>
    );
  }

  if (count === 1 && input.changes[0]) {
    return (
      <>
        Modifying{" "}
        <span className="font-mono text-[12px]">
          {getFileName(input.changes[0].path)}
        </span>
      </>
    );
  }

  return (
    <>
      Applying changes to{" "}
      <span className="font-mono text-[12px]">
        {count} {fileLabel}
      </span>
    </>
  );
}

function FileChangeList({ changes }: { changes: FileChange[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {changes.map((change, idx) => {
        const lang = detectLanguageFromPath(change.path);
        const icon = languageToVSCodeIcon[lang] ?? "vscode-icons:default-file";
        const name = getFileName(change.path);
        const dir = change.path.includes("/")
          ? change.path.slice(0, change.path.length - name.length)
          : "";

        return (
          <div
            key={`${change.path}-${idx}`}
            className="flex items-center gap-2 rounded px-1 py-0.5"
          >
            <Icon
              className="h-3.5 w-3.5 shrink-0 text-foreground/50"
              icon={icon}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
              {dir ? <span className="text-foreground/30">{dir}</span> : null}
              <span className="text-foreground/60">{name}</span>
              {getMovePath(change.kind) && (
                <span className="text-foreground/30">
                  {" → "}
                  {getFileName(getMovePath(change.kind)!)}
                </span>
              )}
            </span>
            <span
              className={`shrink-0 text-[10px] font-medium ${getChangeColor(change.kind)}`}
            >
              {getChangeVerb(change.kind)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const CodexFileChangeTool = memo(function CodexFileChangeTool({
  onApprove,
  onApproveWithDecision,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const fileInput =
    hasInput && isFileChangeInput(part.input) ? part.input : null;
  const fileOutput =
    hasOutput && isFileChangeOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const approvalId = approval?.id;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;

  const isRunning =
    part.state === "approval-responded" ||
    part.state === "input-available" ||
    part.state === "input-streaming";
  const isFinished =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    part.state === "output-available";
  const isError =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    (fileOutput != null && fileOutput.status === "failed");
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested",
  );

  const diffSections = useMemo(
    () => (fileInput ? buildDiffSections(fileInput.changes, fileOutput) : []),
    [fileInput, fileOutput],
  );

  if (!fileInput) return null;

  const summary = buildSummary(part, fileInput, fileOutput);
  const hasDiff = diffSections.length > 0;

  return (
    <ToolLayout
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={
        isFinished || isRunning || part.state === "approval-requested"
      }
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={isError ? partErrorText : undefined}
      footer={
        fileOutput ? (
          <div className="flex items-center justify-between">
            <span>
              {fileInput.changes.length} file
              {fileInput.changes.length !== 1 ? "s" : ""}
            </span>
            <span
              className={
                fileOutput.status === "completed"
                  ? "text-success"
                  : "text-danger"
              }
            >
              {fileOutput.status === "completed" ? "Applied" : "Failed"}
            </span>
          </div>
        ) : null
      }
      actions={
        showApprovalActions ? (
          <div className="flex flex-col gap-2">
            {fileInput.reason ? (
              <p className="line-clamp-2 text-[11px] text-muted">
                {fileInput.reason}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => approvalId && onApprove?.(approvalId)}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  approvalId &&
                  onApproveWithDecision?.(approvalId, "acceptForSession")
                }
              >
                Approve for session
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => approvalId && onDeny?.(approvalId)}
              >
                Deny
              </Button>
              <Button
                size="sm"
                variant="danger-soft"
                onClick={() =>
                  approvalId && onApproveWithDecision?.(approvalId, "cancel")
                }
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2">
        {fileInput.changes.length > 1 ? (
          <FileChangeList changes={fileInput.changes} />
        ) : null}
        {hasDiff ? (
          <ScrollShadow className="max-h-[500px]" orientation="vertical">
            <div className="flex flex-col gap-2">
              {diffSections.map((section, idx) => (
                <DiffView
                  key={`${section.path}-${idx}`}
                  diff={section.diff}
                  path={section.path}
                />
              ))}
            </div>
          </ScrollShadow>
        ) : null}
      </div>
    </ToolLayout>
  );
});
