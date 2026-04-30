"use client";

import { memo } from "react";
import { Button } from "@heroui/react";

import type { RendererProps } from "../../renderer";
import { getToolName, stringifyJson } from "../../../types";
import { ToolLayout, useToolExpansionState } from "../shared/tool-layout";

function getRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getTab(value: unknown) {
  const record = getRecord(value);
  const tab = getRecord(record?.tab);
  if (!tab || typeof tab.id !== "string") return null;
  return {
    id: tab.id,
    title: typeof tab.title === "string" ? tab.title : "Browser tab",
    url: typeof tab.url === "string" ? tab.url : "",
  };
}

function getSummary(part: RendererProps["part"]) {
  const toolName = getToolName(part);
  const input = "input" in part ? getRecord(part.input) : null;
  const output = "output" in part ? getRecord(part.output) : null;
  const tab = getTab(output);
  const url =
    typeof input?.url === "string" ? input.url : tab?.url ? tab.url : "browser";

  if (part.state === "output-denied") return "Browser action denied";
  if (part.state === "output-error") return "Browser action failed";

  if (
    part.state === "approval-requested" ||
    part.state === "approval-responded" ||
    part.state === "input-streaming" ||
    part.state === "input-available"
  ) {
    if (toolName === "browser_open") return `Open ${url}`;
    if (toolName === "browser_navigate") return `Navigate to ${url}`;
    return toolName.replace(/_/g, " ");
  }

  switch (toolName) {
    case "browser_tabs": {
      const tabs = Array.isArray(output?.tabs) ? output.tabs.length : 0;
      return `Listed ${tabs} browser tab${tabs === 1 ? "" : "s"}`;
    }
    case "browser_open":
      return `Opened ${tab?.title ?? url}`;
    case "browser_navigate":
      return `Navigated to ${tab?.title ?? url}`;
    case "browser_snapshot":
      return `Inspected ${tab?.title ?? "browser page"}`;
    case "browser_screenshot":
      return `Captured ${tab?.title ?? "browser screenshot"}`;
    case "browser_console_logs": {
      const logs = Array.isArray(output?.logs) ? output.logs.length : 0;
      return `Read ${logs} console log${logs === 1 ? "" : "s"}`;
    }
    default:
      return tab?.title ? `Updated ${tab.title}` : toolName.replace(/_/g, " ");
  }
}

function getPreview(value: unknown) {
  const record = getRecord(value);
  if (!record) return null;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.logs)) {
    return record.logs
      .map((log) => {
        const entry = getRecord(log);
        return `[${entry?.level ?? "log"}] ${entry?.message ?? ""}`;
      })
      .join("\n");
  }
  return stringifyJson(value);
}

function getApprovalId(part: RendererProps["part"]) {
  const approval = "approval" in part ? getRecord(part.approval) : null;
  return typeof approval?.id === "string" ? approval.id : null;
}

export const BrowserTool = memo(function BrowserTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    defaultExpanded: false,
    toolCallId: "toolCallId" in part ? part.toolCallId : getToolName(part),
  });
  const output = "output" in part ? part.output : null;
  const screenshotDataUrl =
    getRecord(output)?.type === "screenshot" &&
    typeof getRecord(output)?.dataUrl === "string"
      ? (getRecord(output)?.dataUrl as string)
      : null;
  const preview = getPreview(output);
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const isRunning =
    part.state === "approval-responded" ||
    part.state === "input-available" ||
    part.state === "input-streaming";
  const isError =
    part.state === "output-error" || part.state === "output-denied";
  const approvalId = getApprovalId(part);
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;

  return (
    <ToolLayout
      actions={
        showApprovalActions ? (
          <div className="flex items-center gap-2">
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => approvalId && onApprove?.(approvalId)}
              size="sm"
            >
              Allow
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
        ) : null
      }
      isError={isError}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      errorText={isError ? partErrorText : undefined}
      summary={getSummary(part)}
    >
      {screenshotDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="Browser screenshot"
          className="max-h-96 w-full rounded-lg object-contain"
          src={screenshotDataUrl}
        />
      ) : preview ? (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/70">
          {preview}
        </pre>
      ) : null}
    </ToolLayout>
  );
});
