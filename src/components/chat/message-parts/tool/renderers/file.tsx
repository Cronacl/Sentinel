"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import { Button, Disclosure, ScrollShadow, Spinner } from "@heroui/react";

import { CodeBlock } from "../../text/code-block";
import type { RendererProps } from "../renderer";

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

function getStatusChipClass(tone: "danger" | "muted" | "success") {
  switch (tone) {
    case "success":
      return "border-success/5 bg-success/10 text-success";
    case "danger":
      return "border-danger/20 bg-danger-soft text-danger-soft-foreground";
    default:
      return "border-border/60 bg-background/70 text-muted";
  }
}

function getStatus(part: RendererProps["part"]) {
  if (part.state === "approval-responded") {
    return { label: "Running", tone: "muted" as const };
  }

  if (part.state === "approval-requested") {
    return { label: "Needs approval", tone: "muted" as const };
  }

  if (part.state === "output-denied") {
    return { label: "Denied", tone: "danger" as const };
  }

  if (part.state === "output-error") {
    return { label: "Failed", tone: "danger" as const };
  }

  if (part.state === "output-available") {
    return { label: "Success", tone: "success" as const };
  }

  return { label: "Running", tone: "muted" as const };
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

function truncatePreview(value: string, length = 220) {
  return value.length <= length ? value : `${value.slice(0, length)}...`;
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
  const beforeLines = toDiffLines(before);
  const afterLines = toDiffLines(after);
  const diffLines = [`--- a/${path}`, `+++ b/${path}`, "@@ @@"];
  const maxLineCount = Math.max(beforeLines.length, afterLines.length);

  for (let index = 0; index < maxLineCount; index += 1) {
    const previousLine = beforeLines[index];
    const nextLine = afterLines[index];

    if (previousLine === nextLine) {
      if (previousLine !== undefined) {
        diffLines.push(` ${previousLine}`);
      }
      continue;
    }

    if (previousLine !== undefined) {
      diffLines.push(`-${previousLine}`);
    }

    if (nextLine !== undefined) {
      diffLines.push(`+${nextLine}`);
    }
  }

  return diffLines.join("\n");
}

function getHeader(toolName: string) {
  switch (toolName) {
    case "multiedit":
      return "Multi edit";
    case "create_file":
      return "Create file";
    case "delete_file":
      return "Delete file";
    default:
      return "Edit";
  }
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

function buildBody(
  part: RendererProps["part"],
  toolName: string,
  errorText?: string,
): ReactNode {
  if (part.state === "output-denied") {
    return "Execution denied.";
  }

  if ("output" in part && part.output !== undefined) {
    if (toolName === "edit" && isEditOutput(part.output)) {
      return [
        `Edited ${part.output.path}`,
        `${part.output.replacements} replacement${part.output.replacements === 1 ? "" : "s"} applied`,
        `${part.output.bytesWritten} bytes written`,
      ].join("\n");
    }

    if (toolName === "multiedit" && isMultiEditOutput(part.output)) {
      return [
        `Edited ${part.output.path}`,
        `${part.output.editsApplied} edit${part.output.editsApplied === 1 ? "" : "s"} applied`,
        `${part.output.replacements} replacement${part.output.replacements === 1 ? "" : "s"} applied`,
        ...part.output.edits.map(
          (edit) =>
            `Edit ${edit.index}: ${edit.replacements} replacement${edit.replacements === 1 ? "" : "s"}${edit.replaceAll ? " (replace all)" : ""}`,
        ),
        `${part.output.bytesWritten} bytes written`,
      ].join("\n");
    }

    if (toolName === "create_file" && isCreateFileOutput(part.output)) {
      return [
        `Created ${part.output.path}`,
        `${part.output.lineCount} lines`,
        `${part.output.bytesWritten} bytes written`,
      ].join("\n");
    }

    if (toolName === "delete_file" && isDeleteFileOutput(part.output)) {
      return [
        `Deleted ${part.output.path}`,
        `${part.output.bytesDeleted} bytes removed`,
      ].join("\n");
    }
  }

  if ("input" in part && part.input !== undefined) {
    if (toolName === "edit" && isEditInput(part.input)) {
      return (
        <CodeBlock
          code={buildUnifiedDiff({
            after: part.input.newString,
            before: part.input.oldString,
            path: part.input.path,
          })}
          language="diff"
        />
      );
    }

    if (toolName === "multiedit" && isMultiEditInput(part.input)) {
      return (
        <CodeBlock
          code={part.input.edits
            .map((edit, index) =>
              [
                `# Edit ${index + 1}${edit.replaceAll ? " (replace all)" : ""}`,
                buildUnifiedDiff({
                  after: edit.newString,
                  before: edit.oldString,
                  path: part.input.path,
                }),
              ].join("\n"),
            )
            .join("\n\n")}
          language="diff"
        />
      );
    }

    if (toolName === "create_file" && isCreateFileInput(part.input)) {
      return (
        <CodeBlock
          code={buildUnifiedDiff({
            after: part.input.content,
            before: "",
            path: part.input.path,
          })}
          language="diff"
        />
      );
    }

    if (toolName === "delete_file" && isDeleteFileInput(part.input)) {
      return `Path: ${part.input.path}`;
    }
  }

  if (errorText) {
    return errorText;
  }

  return "";
}

export const FileTool = memo(function FileTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part);
  const header = getHeader(toolName);
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;
  const isRunningState = part.state === "approval-responded";
  const isFinishedState =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    part.state === "output-available";
  const status = getStatus(part);
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const { path, rationale } = getPathAndRationale(part, toolName);
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested" || isRunningState,
  );

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested" || isRunningState);
  }, [isRunningState, part.state, part.toolCallId]);

  const body = buildBody(part, toolName, partErrorText);

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
      <div className="rounded-2xl border border-border/60 bg-surface/20 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-medium text-foreground">
                {header}
              </p>
              <div
                className={`rounded-full flex items-center gap-1 border px-1.5 py-0.5 text-[10px] ${getStatusChipClass(status.tone)}`}
              >
                {status.label === "Running" ? (
                  <Spinner className="h-3 w-3" size="sm" />
                ) : null}
                <span className="truncate">{status.label}</span>
              </div>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-foreground/72">
              {path}
            </p>
          </div>

          {isFinishedState ? (
            <Disclosure.Heading>
              <Button
                slot="trigger"
                size="sm"
                variant="tertiary"
                className="h-auto min-w-0 px-2 py-0.5 bg-background text-[10px] text-foreground transition-colors hover:text-foreground"
              >
                {isExpanded ? "Hide" : "Show"}
              </Button>
            </Disclosure.Heading>
          ) : null}
        </div>

        {part.state === "approval-requested" ? (
          <p className="mt-1.5 line-clamp-2 text-[11px] text-muted">
            {rationale}
          </p>
        ) : null}

        <Disclosure.Content>
          <Disclosure.Body>
            <div className="mt-2 overflow-hidden rounded-2xl border border-border/20 bg-surface">
              <div className="border-b border-border/50 px-3.5 py-2 text-[9px] text-foreground">
                {header}
              </div>

              <div className="px-3.5 py-3">
                {typeof body === "string" ? (
                  <ScrollShadow className="max-h-[180px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground">
                    {body}
                  </ScrollShadow>
                ) : (
                  body
                )}

                {part.state === "output-available" ? (
                  <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-foreground">
                    <span className="truncate">{path}</span>
                    <span className="shrink-0 text-white/72">
                      {status.label}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </Disclosure.Body>
        </Disclosure.Content>

        {showApprovalActions ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              onPress={() => {
                if (approvalId) {
                  onApprove?.(approvalId);
                }
              }}
              type="button"
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                if (approvalId) {
                  onDeny?.(approvalId);
                }
              }}
              type="button"
            >
              Deny
            </Button>
          </div>
        ) : null}

        {partErrorText && part.state !== "output-error" ? (
          <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
            {partErrorText}
          </div>
        ) : null}
      </div>
    </Disclosure>
  );
});
