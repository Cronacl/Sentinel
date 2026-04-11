"use client";

import type { ReactNode } from "react";
import { memo, useMemo } from "react";
import { ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { getToolName } from "../../../types";
import { DiffView } from "../shared/diff-view";
import { ToolLayout } from "../shared/tool-layout";
import { renderCopilotApprovalActions } from "../copilot-approval-actions";
import { CopilotTextBlock } from "../copilot-content";
import {
  extractCopilotTextFromContent,
  getCopilotContentField,
  getFileName,
  isCopilotToolErrorState,
  isCopilotToolRunningState,
  tryParseCopilotOutput,
  unwrapCopilotInput,
  useCopilotExpansionState,
} from "../copilot-helpers";
import {
  detectLanguageFromPath,
  languageToVSCodeIcon,
} from "@/lib/syntax/highlighter";

type CopilotFileInput = {
  command?: string;
  file_path?: string;
  file_text?: string;
  new_str?: string;
  old_str?: string;
  patch?: string;
  path?: string;
  view_range?: [number, number];
};

type StructuredPatchHunk = {
  lines: string[];
  newLines: number;
  newStart: number;
  oldLines: number;
  oldStart: number;
};

type CopilotFileOutput = {
  additions?: number;
  content?: string;
  deletions?: number;
  filePath?: string;
  gitDiff?: {
    additions: number;
    deletions: number;
    patch: string;
    status: string;
  };
  originalFile?: string | null;
  structuredPatch?: StructuredPatchHunk[];
  type?: "create" | "update";
};

function isFileOutput(value: unknown): value is CopilotFileOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.filePath === "string" ||
    v.structuredPatch !== undefined ||
    v.gitDiff !== undefined ||
    typeof v.type === "string"
  );
}

function getFilePath(input: CopilotFileInput | null) {
  return input?.path ?? input?.file_path ?? null;
}

function getFileAction(toolName: string, output: CopilotFileOutput | null) {
  if (toolName === "copilot_create") return "Created";
  if (output?.type === "create" || output?.gitDiff?.status === "added")
    return "Created";
  if (output?.originalFile === null) return "Created";

  switch (toolName) {
    case "copilot_edit":
    case "copilot_apply_patch":
      return "Modified";
    case "copilot_show_file":
      return "Viewed";
    default:
      return "Read";
  }
}

function getActionColor(action: string): string {
  switch (action) {
    case "Created":
      return "text-success";
    case "Deleted":
      return "text-danger";
    case "Modified":
      return "text-warning";
    default:
      return "text-foreground/50";
  }
}

function getActionVerbs(toolName: string) {
  switch (toolName) {
    case "copilot_create":
      return { pending: "Create", progressive: "Creating" };
    case "copilot_edit":
    case "copilot_apply_patch":
      return { pending: "Edit", progressive: "Editing" };
    case "copilot_show_file":
      return { pending: "Show", progressive: "Showing" };
    default:
      return { pending: "Read", progressive: "Reading" };
  }
}

function buildDiffFromStructuredPatch(hunks: StructuredPatchHunk[]): string {
  return hunks
    .map((h) => {
      const header = `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
      return [header, ...h.lines].join("\n");
    })
    .join("\n");
}

function buildDiffFromEdit(input: CopilotFileInput): string | null {
  if (!input.old_str || !input.new_str) return null;
  const filePath = getFilePath(input) ?? "file";
  const oldLines = input.old_str.split("\n");
  const newLines = input.new_str.split("\n");
  const header = `--- a/${filePath}\n+++ b/${filePath}`;
  const removed = oldLines.map((l) => `-${l}`).join("\n");
  const added = newLines.map((l) => `+${l}`).join("\n");
  return `${header}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n${removed}\n${added}`;
}

function buildSummary(
  part: RendererProps["part"],
  toolName: string,
  input: CopilotFileInput | null,
  output: CopilotFileOutput | null,
): ReactNode {
  const filePath = output?.filePath ?? getFilePath(input);
  const name = filePath ? getFileName(filePath) : null;
  const action = getFileAction(toolName, output);
  const verbs = getActionVerbs(toolName);

  if (part.state === "output-denied") {
    return name ? (
      <>
        File action denied <span className="font-mono text-[12px]">{name}</span>
      </>
    ) : (
      <>File action denied</>
    );
  }

  if (part.state === "output-error") {
    return name ? (
      <>
        Failed to modify <span className="font-mono text-[12px]">{name}</span>
      </>
    ) : (
      <>Failed to modify file</>
    );
  }

  if (part.state === "output-available") {
    return (
      <>
        {action}{" "}
        {name ? <span className="font-mono text-[12px]">{name}</span> : "file"}
        {(output?.gitDiff || output?.additions != null) && (
          <span className="ml-1.5 text-[11px] text-foreground/40">
            <span className="text-success">
              +{output.gitDiff?.additions ?? output.additions ?? 0}
            </span>{" "}
            <span className="text-danger">
              -{output.gitDiff?.deletions ?? output.deletions ?? 0}
            </span>
          </span>
        )}
      </>
    );
  }

  if (part.state === "approval-requested") {
    return name ? (
      <>
        {verbs.pending} <span className="font-mono text-[12px]">{name}</span>
      </>
    ) : (
      <>{verbs.pending} file</>
    );
  }

  return name ? (
    <>
      {verbs.progressive} <span className="font-mono text-[12px]">{name}</span>
    </>
  ) : (
    <>{verbs.progressive} file</>
  );
}

function FileHeader({
  action,
  filePath,
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

function BaseCopilotFileTool({ onApprove, onDeny, part }: RendererProps) {
  const toolName = getToolName(part);
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const fileInput = unwrapCopilotInput<CopilotFileInput>(
    hasInput ? part.input : undefined,
  );
  const fileOutput = hasOutput
    ? tryParseCopilotOutput(part.output, isFileOutput)
    : null;

  const isViewOrRead =
    toolName === "copilot_view" ||
    toolName === "copilot_read" ||
    toolName === "copilot_show_file";

  const fallbackOutputText =
    hasOutput && !fileOutput
      ? isViewOrRead
        ? (getCopilotContentField(part.output, "content") ??
          extractCopilotTextFromContent(part.output))
        : extractCopilotTextFromContent(part.output)
      : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const isRunning = isCopilotToolRunningState(part.state);
  const isFinished =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    part.state === "output-available";
  const isError = isCopilotToolErrorState(part.state);
  const [isExpanded, setIsExpanded] = useCopilotExpansionState(
    part,
    part.state === "approval-requested",
  );
  const actions = renderCopilotApprovalActions({ onApprove, onDeny, part });

  const filePath = fileOutput?.filePath ?? getFilePath(fileInput);
  const action = getFileAction(toolName, fileOutput);
  const isEditTool =
    toolName === "copilot_edit" || toolName === "copilot_apply_patch";

  const detailedContent = hasOutput
    ? getCopilotContentField(part.output, "detailedContent")
    : null;

  const diffText = useMemo(() => {
    if (fileOutput?.gitDiff?.patch) return fileOutput.gitDiff.patch;
    if (fileOutput?.structuredPatch?.length) {
      return buildDiffFromStructuredPatch(fileOutput.structuredPatch);
    }
    if (isEditTool && fileInput) return buildDiffFromEdit(fileInput);
    if (isEditTool && detailedContent?.includes("@@")) return detailedContent;
    return null;
  }, [fileInput, fileOutput, isEditTool, detailedContent]);

  return (
    <ToolLayout
      actions={actions}
      errorText={
        partErrorText && part.state !== "output-error"
          ? partErrorText
          : undefined
      }
      footer={
        isFinished && filePath ? (
          <div className="flex items-center justify-between">
            <span className="truncate font-mono text-[10px]" title={filePath}>
              {filePath}
            </span>
            <span className={isError ? "text-danger" : "text-success"}>
              {isError
                ? "Failed"
                : action === "Created"
                  ? "Created"
                  : "Applied"}
            </span>
          </div>
        ) : null
      }
      isError={isError}
      isExpandable={
        isFinished || isRunning || part.state === "approval-requested"
      }
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      summary={
        <>
          <Icon
            className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            icon="solar:document-text-linear"
          />
          {buildSummary(part, toolName, fileInput, fileOutput)}
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {filePath ? <FileHeader action={action} filePath={filePath} /> : null}
        {diffText && (
          <ScrollShadow className="max-h-[500px]" orientation="vertical">
            <DiffView diff={diffText} path={filePath ?? "file"} />
          </ScrollShadow>
        )}
        {!diffText && fallbackOutputText?.trim() && (
          <CopilotTextBlock
            label="Output"
            maxHeight={320}
            text={fallbackOutputText}
          />
        )}
      </div>
    </ToolLayout>
  );
}

export const CopilotViewTool = memo(BaseCopilotFileTool);
export const CopilotCreateTool = memo(BaseCopilotFileTool);
export const CopilotEditTool = memo(BaseCopilotFileTool);
export const CopilotApplyPatchTool = memo(BaseCopilotFileTool);
export const CopilotShowFileTool = memo(BaseCopilotFileTool);
