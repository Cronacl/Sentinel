"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";

import type { RendererProps } from "../../renderer";
import { getToolName, stringifyJson } from "../../../types";
import { ToolLayout } from "../shared/tool-layout";

type ExternalEngine = "Cursor" | "OpenCode";
type ExternalToolKind =
  | "file"
  | "permission"
  | "plan"
  | "runtime"
  | "search"
  | "shell"
  | "user-input";

function formatToolName(toolName: string) {
  return toolName
    .replace(/^(cursor|opencode)_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getStringField(value: unknown, keys: string[]) {
  const record = getRecord(value);
  if (!record) return null;

  for (const key of keys) {
    const field = record[key];
    if (typeof field === "string" && field.trim()) {
      return field.trim();
    }
  }

  return null;
}

function getApprovalId(part: RendererProps["part"]) {
  if (
    !("approval" in part) ||
    !part.approval ||
    typeof part.approval !== "object" ||
    !("id" in part.approval) ||
    typeof part.approval.id !== "string"
  ) {
    return null;
  }

  return part.approval.id;
}

function isRunningState(state: RendererProps["part"]["state"]) {
  return (
    state === "approval-responded" ||
    state === "input-available" ||
    state === "input-streaming"
  );
}

function isErrorState(state: RendererProps["part"]["state"]) {
  return state === "output-denied" || state === "output-error";
}

function truncate(value: string, length = 72) {
  return value.length <= length ? value : `${value.slice(0, length)}...`;
}

function getSummary(input: {
  engine: ExternalEngine;
  kind: ExternalToolKind;
  part: RendererProps["part"];
  toolName: string;
}) {
  const { engine, kind, part, toolName } = input;
  const rawInput = "input" in part ? part.input : undefined;
  const label = formatToolName(toolName);

  if (kind === "shell") {
    const command = getStringField(rawInput, [
      "command",
      "cmd",
      "fullCommandText",
      "description",
      "intention",
    ]);
    const commandLabel = command ? (
      <span className="font-mono text-[12px]">$ {truncate(command)}</span>
    ) : (
      "command"
    );

    if (part.state === "output-denied") return <>Command denied</>;
    if (part.state === "output-error")
      return <>Command failed {commandLabel}</>;
    if (part.state === "output-available") return <>Ran {commandLabel}</>;
    if (part.state === "approval-requested") return <>Run {commandLabel}</>;
    return <>Running {commandLabel}</>;
  }

  if (kind === "file") {
    const path = getStringField(rawInput, [
      "path",
      "filePath",
      "file_path",
      "target",
    ]);
    const fileLabel = path ? (
      <span className="font-mono text-[12px]">{truncate(path)}</span>
    ) : (
      "file"
    );
    const action = /read|view|open/.test(toolName)
      ? "Read"
      : /create|write|edit|patch|update|delete/.test(toolName)
        ? "Modified"
        : "Used";

    if (part.state === "output-denied") return <>File action denied</>;
    if (part.state === "output-error") return <>File action failed</>;
    if (part.state === "approval-requested")
      return (
        <>
          {action} {fileLabel}
        </>
      );
    return (
      <>
        {action} {fileLabel}
      </>
    );
  }

  if (kind === "search") {
    const query = getStringField(rawInput, [
      "pattern",
      "query",
      "glob",
      "path",
      "term",
    ]);
    const queryLabel = query ? (
      <span className="font-mono text-[12px]">{truncate(query)}</span>
    ) : (
      "workspace"
    );

    if (part.state === "output-error") return <>Search failed</>;
    return <>Searched {queryLabel}</>;
  }

  if (kind === "plan") {
    if (part.state === "output-error") return <>Plan update failed</>;
    return <>Updated plan</>;
  }

  if (kind === "user-input") {
    const prompt = getStringField(rawInput, ["prompt", "question", "message"]);
    return (
      <>
        {engine} needs input
        {prompt ? (
          <span className="text-foreground/40">: {truncate(prompt, 90)}</span>
        ) : null}
      </>
    );
  }

  if (kind === "permission") {
    return <>{engine} permission request</>;
  }

  if (part.state === "output-denied") return <>{label} denied</>;
  if (part.state === "output-error") return <>{label} failed</>;
  return (
    <>
      {engine} {label}
    </>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-2 text-[11px] text-muted">{label}</p>
      <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[12px] text-muted whitespace-pre-wrap break-words">
        {stringifyJson(value)}
      </pre>
    </div>
  );
}

function getTextOutput(value: unknown) {
  if (typeof value === "string") return value;
  const record = getRecord(value);
  if (!record) return null;

  return getStringField(record, [
    "stdout",
    "stderr",
    "output",
    "content",
    "text",
    "message",
    "result",
  ]);
}

function ExternalRuntimeTool({
  engine,
  kind,
  onApprove,
  onDeny,
  part,
}: RendererProps & { engine: ExternalEngine; kind: ExternalToolKind }) {
  const toolName = getToolName(part);
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const approvalId = getApprovalId(part);
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;
  const outputText = hasOutput ? getTextOutput(part.output) : null;
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested");
  }, [part.state, part.toolCallId]);

  const actions = showApprovalActions ? (
    <div className="flex items-center gap-2">
      <Button
        className="h-7 min-w-0 px-3 text-[11px]"
        onPress={() => approvalId && onApprove?.(approvalId)}
        size="sm"
        variant="primary"
      >
        Approve
      </Button>
      <Button
        className="h-7 min-w-0 px-3 text-[11px]"
        onPress={() => approvalId && onDeny?.(approvalId)}
        size="sm"
        variant="ghost"
      >
        Deny
      </Button>
    </div>
  ) : undefined;

  return (
    <ToolLayout
      actions={actions}
      errorText={partErrorText}
      isError={isErrorState(part.state)}
      isExpandable={hasInput || hasOutput || !!partErrorText}
      isExpanded={isExpanded}
      isRunning={isRunningState(part.state)}
      onExpandedChange={setIsExpanded}
      summary={
        <>
          {getSummary({ engine, kind, part, toolName })}
          {actions ? (
            <span className="text-foreground/40"> requires approval</span>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        {hasInput ? <JsonBlock label="Input" value={part.input} /> : null}
        {hasOutput ? (
          outputText ? (
            <JsonBlock label="Output" value={outputText} />
          ) : (
            <JsonBlock label="Output" value={part.output} />
          )
        ) : null}
      </div>
    </ToolLayout>
  );
}

function makeExternalTool(engine: ExternalEngine, kind: ExternalToolKind) {
  return memo(function ExternalTool(props: RendererProps) {
    return <ExternalRuntimeTool {...props} engine={engine} kind={kind} />;
  });
}

export const CursorFileTool = makeExternalTool("Cursor", "file");
export const CursorPermissionTool = makeExternalTool("Cursor", "permission");
export const CursorPlanTool = makeExternalTool("Cursor", "plan");
export const CursorRuntimeTool = makeExternalTool("Cursor", "runtime");
export const CursorSearchTool = makeExternalTool("Cursor", "search");
export const CursorShellTool = makeExternalTool("Cursor", "shell");
export const CursorUserInputTool = makeExternalTool("Cursor", "user-input");

export const OpenCodeFileTool = makeExternalTool("OpenCode", "file");
export const OpenCodePermissionTool = makeExternalTool(
  "OpenCode",
  "permission",
);
export const OpenCodePlanTool = makeExternalTool("OpenCode", "plan");
export const OpenCodeRuntimeTool = makeExternalTool("OpenCode", "runtime");
export const OpenCodeSearchTool = makeExternalTool("OpenCode", "search");
export const OpenCodeShellTool = makeExternalTool("OpenCode", "shell");
export const OpenCodeUserInputTool = makeExternalTool("OpenCode", "user-input");
