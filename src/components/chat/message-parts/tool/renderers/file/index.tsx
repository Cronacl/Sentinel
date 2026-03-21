"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import { Button } from "@heroui/react";

import type { RendererProps } from "../../renderer";
import { buildPreviewUnifiedDiff, DiffView } from "../shared/diff-view";
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

function buildDiffFromInput(
  part: RendererProps["part"],
  toolName: string,
): ReactNode {
  if (!("input" in part) || part.input === undefined) return null;

  if (toolName === "edit" && isEditInput(part.input)) {
    const diff = buildPreviewUnifiedDiff({
      after: part.input.newString,
      before: part.input.oldString,
      path: part.input.path,
    });
    return <DiffView diff={diff} path={part.input.path} />;
  }

  if (toolName === "multiedit" && isMultiEditInput(part.input)) {
    const input = part.input;
    return (
      <div className="flex flex-col gap-2">
        {input.edits.map((edit, index) => {
          const diff = buildPreviewUnifiedDiff({
            after: edit.newString,
            before: edit.oldString,
            path: input.path,
          });
          return (
            <DiffView
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
    const diff = buildPreviewUnifiedDiff({
      after: part.input.content,
      before: "",
      path: part.input.path,
    });
    return <DiffView diff={diff} path={part.input.path} />;
  }

  return null;
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
    const diffNode = buildDiffFromInput(part, toolName);

    if (toolName === "edit" && isEditOutput(part.output)) {
      return (
        diffNode ?? (
          <p className="whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
            {[
              `${part.output.replacements} replacement${part.output.replacements === 1 ? "" : "s"} applied`,
              `${part.output.bytesWritten} bytes written`,
            ].join("\n")}
          </p>
        )
      );
    }

    if (toolName === "multiedit" && isMultiEditOutput(part.output)) {
      return (
        diffNode ?? (
          <p className="whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
            {[
              `${part.output.editsApplied} edit${part.output.editsApplied === 1 ? "" : "s"} applied`,
              `${part.output.replacements} replacement${part.output.replacements === 1 ? "" : "s"}`,
              `${part.output.bytesWritten} bytes written`,
            ].join("\n")}
          </p>
        )
      );
    }

    if (toolName === "create_file" && isCreateFileOutput(part.output)) {
      return (
        diffNode ?? (
          <p className="whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
            {`${part.output.lineCount} lines · ${part.output.bytesWritten} bytes written`}
          </p>
        )
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
    const diffNode = buildDiffFromInput(part, toolName);
    if (diffNode) return diffNode;

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
