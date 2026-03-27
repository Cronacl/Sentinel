"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useMemo, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { DiffView } from "../shared/diff-view";
import { ToolLayout } from "../shared/tool-layout";
import {
  extractTextFromContent,
  getApprovalReason,
  getFileName,
  unwrapClaudeInput,
} from "../claude-helpers";
import {
  detectLanguageFromPath,
  languageToVSCodeIcon,
} from "@/lib/syntax/highlighter";

type ClaudeEditInput = {
  file_path: string;
  new_string: string;
  old_string: string;
  replace_all?: boolean;
};

type ClaudeWriteInput = {
  content: string;
  file_path: string;
};

type StructuredPatchHunk = {
  lines: string[];
  newLines: number;
  newStart: number;
  oldLines: number;
  oldStart: number;
};

type GitDiffInfo = {
  additions: number;
  changes: number;
  deletions: number;
  filename: string;
  patch: string;
  status: "modified" | "added";
};

type ClaudeFileOutput = {
  content?: string;
  filePath?: string;
  gitDiff?: GitDiffInfo;
  originalFile?: string | null;
  structuredPatch?: StructuredPatchHunk[];
  type?: "create" | "update";
};

function isEditInput(value: unknown): value is ClaudeEditInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.file_path === "string" &&
    typeof v.old_string === "string" &&
    typeof v.new_string === "string"
  );
}

function isWriteInput(value: unknown): value is ClaudeWriteInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.file_path === "string" && typeof v.content === "string";
}

function isFileOutput(value: unknown): value is ClaudeFileOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.filePath === "string" ||
    v.structuredPatch !== undefined ||
    v.gitDiff !== undefined
  );
}

function buildDiffFromStructuredPatch(hunks: StructuredPatchHunk[]): string {
  return hunks
    .map((h) => {
      const header = `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
      return [header, ...h.lines].join("\n");
    })
    .join("\n");
}

function buildDiffFromEdit(input: ClaudeEditInput): string {
  const oldLines = input.old_string.split("\n");
  const newLines = input.new_string.split("\n");
  const header = `--- a/${input.file_path}\n+++ b/${input.file_path}`;
  const removed = oldLines.map((l) => `-${l}`).join("\n");
  const added = newLines.map((l) => `+${l}`).join("\n");
  return `${header}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n${removed}\n${added}`;
}

function getFileAction(
  isEdit: boolean,
  output: ClaudeFileOutput | null,
): string {
  if (output?.type === "create" || output?.gitDiff?.status === "added")
    return "Created";
  if (isEdit) return "Modified";
  return output?.originalFile === null ? "Created" : "Modified";
}

function getActionColor(action: string): string {
  switch (action) {
    case "Created":
      return "text-success";
    case "Deleted":
      return "text-danger";
    default:
      return "text-warning";
  }
}

function buildSummary(
  part: RendererProps["part"],
  filePath: string,
  isEdit: boolean,
  output: ClaudeFileOutput | null,
): ReactNode {
  const name = getFileName(filePath);
  const action = getFileAction(isEdit, output);

  if (part.state === "output-denied") {
    return <>File change denied</>;
  }

  if (part.state === "output-error") {
    return (
      <>
        Failed to modify <span className="font-mono text-[12px]">{name}</span>
      </>
    );
  }

  if (part.state === "output-available") {
    return (
      <>
        {action} <span className="font-mono text-[12px]">{name}</span>
        {output?.gitDiff && (
          <span className="ml-1.5 text-[11px] text-foreground/40">
            <span className="text-success">+{output.gitDiff.additions}</span>{" "}
            <span className="text-danger">-{output.gitDiff.deletions}</span>
          </span>
        )}
      </>
    );
  }

  if (part.state === "approval-requested") {
    return (
      <>
        {isEdit ? "Edit" : "Write"}{" "}
        <span className="font-mono text-[12px]">{name}</span>
      </>
    );
  }

  return (
    <>
      {isEdit ? "Editing" : "Writing"}{" "}
      <span className="font-mono text-[12px]">{name}</span>
    </>
  );
}

function FileHeader({
  filePath,
  action,
}: {
  action: string;
  filePath: string;
}) {
  const lang = detectLanguageFromPath(filePath);
  const icon = languageToVSCodeIcon[lang] ?? "vscode-icons:default-file";
  const name = getFileName(filePath);
  const dir = filePath.includes("/")
    ? filePath.slice(0, filePath.length - name.length)
    : "";

  return (
    <div className="flex items-center gap-2 rounded px-1 py-0.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-foreground/50" icon={icon} />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
        {dir ? <span className="text-foreground/30">{dir}</span> : null}
        <span className="text-foreground/60">{name}</span>
      </span>
      <span
        className={`shrink-0 text-[10px] font-medium ${getActionColor(action)}`}
      >
        {action}
      </span>
    </div>
  );
}

export const ClaudeFileEditTool = memo(function ClaudeFileEditTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const rawInput = hasInput ? part.input : undefined;
  const unwrapped = unwrapClaudeInput<ClaudeEditInput>(rawInput);
  const editInput = unwrapped && isEditInput(unwrapped) ? unwrapped : null;
  const fileOutput =
    hasOutput && isFileOutput(part.output) ? part.output : null;
  const fallbackOutputText =
    hasOutput && !fileOutput ? extractTextFromContent(part.output) : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const approvalReason = getApprovalReason(approval);
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
    part.state === "output-denied" || part.state === "output-error";
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested" || isRunning,
  );

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested" || isRunning);
  }, [isRunning, part.state, part.toolCallId]);

  const diffText = useMemo(() => {
    if (fileOutput?.gitDiff?.patch) return fileOutput.gitDiff.patch;
    if (fileOutput?.structuredPatch?.length) {
      return buildDiffFromStructuredPatch(fileOutput.structuredPatch);
    }
    if (editInput) return buildDiffFromEdit(editInput);
    return null;
  }, [editInput, fileOutput]);

  if (!editInput) return null;

  const filePath = fileOutput?.filePath ?? editInput.file_path;
  const action = getFileAction(true, fileOutput);
  const summary = buildSummary(part, filePath, true, fileOutput);

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
      errorText={
        partErrorText && part.state !== "output-error"
          ? partErrorText
          : undefined
      }
      footer={
        fileOutput ? (
          <div className="flex items-center justify-between">
            <span className="truncate font-mono text-[10px]" title={filePath}>
              {filePath}
            </span>
            <span className={isError ? "text-danger" : "text-success"}>
              {isError ? "Failed" : "Applied"}
            </span>
          </div>
        ) : null
      }
      actions={
        showApprovalActions ? (
          <div className="flex flex-col gap-2">
            {approvalReason && (
              <p className="line-clamp-2 text-[11px] text-muted">
                {approvalReason}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => approvalId && onApprove?.(approvalId)}
                type="button"
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => approvalId && onDeny?.(approvalId)}
                type="button"
              >
                Deny
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <FileHeader action={action} filePath={filePath} />
        {diffText && (
          <ScrollShadow className="max-h-[500px]" orientation="vertical">
            <DiffView diff={diffText} path={filePath} />
          </ScrollShadow>
        )}
        {!diffText && fallbackOutputText?.trim() && (
          <ScrollShadow className="max-h-[300px] overflow-x-auto">
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
              {fallbackOutputText}
            </pre>
          </ScrollShadow>
        )}
      </div>
    </ToolLayout>
  );
});

export const ClaudeFileWriteTool = memo(function ClaudeFileWriteTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const rawInput = hasInput ? part.input : undefined;
  const unwrapped = unwrapClaudeInput<ClaudeWriteInput>(rawInput);
  const writeInput = unwrapped && isWriteInput(unwrapped) ? unwrapped : null;
  const fileOutput =
    hasOutput && isFileOutput(part.output) ? part.output : null;
  const fallbackOutputText =
    hasOutput && !fileOutput ? extractTextFromContent(part.output) : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const approvalReason = getApprovalReason(approval);
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
    part.state === "output-denied" || part.state === "output-error";
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested" || isRunning,
  );

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested" || isRunning);
  }, [isRunning, part.state, part.toolCallId]);

  const diffText = useMemo(() => {
    if (fileOutput?.gitDiff?.patch) return fileOutput.gitDiff.patch;
    if (fileOutput?.structuredPatch?.length) {
      return buildDiffFromStructuredPatch(fileOutput.structuredPatch);
    }
    return null;
  }, [fileOutput]);

  if (!writeInput) return null;

  const filePath = fileOutput?.filePath ?? writeInput.file_path;
  const action = getFileAction(false, fileOutput);
  const summary = buildSummary(part, filePath, false, fileOutput);
  const contentLineCount = writeInput.content.split("\n").length;

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
      errorText={
        partErrorText && part.state !== "output-error"
          ? partErrorText
          : undefined
      }
      footer={
        fileOutput ? (
          <div className="flex items-center justify-between">
            <span className="truncate font-mono text-[10px]" title={filePath}>
              {filePath}
            </span>
            <span className={isError ? "text-danger" : "text-success"}>
              {isError
                ? "Failed"
                : action === "Created"
                  ? "Created"
                  : "Written"}
            </span>
          </div>
        ) : null
      }
      actions={
        showApprovalActions ? (
          <div className="flex flex-col gap-2">
            {approvalReason && (
              <p className="line-clamp-2 text-[11px] text-muted">
                {approvalReason}
              </p>
            )}
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
                variant="ghost"
                onClick={() => approvalId && onDeny?.(approvalId)}
              >
                Deny
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <FileHeader action={action} filePath={filePath} />
        {diffText ? (
          <ScrollShadow className="max-h-[500px]" orientation="vertical">
            <DiffView diff={diffText} path={filePath} />
          </ScrollShadow>
        ) : fallbackOutputText?.trim() ? (
          <ScrollShadow className="max-h-[300px] overflow-x-auto">
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
              {fallbackOutputText}
            </pre>
          </ScrollShadow>
        ) : (
          <div className="text-[11px] text-foreground/50">
            {contentLineCount} line{contentLineCount !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </ToolLayout>
  );
});
