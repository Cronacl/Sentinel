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

function getApprovalId(part: RendererProps["part"]) {
  const approval = "approval" in part ? getRecord(part.approval) : null;
  return typeof approval?.id === "string" ? approval.id : null;
}

function getSummary(part: RendererProps["part"]) {
  const toolName = getToolName(part);
  const output = "output" in part ? getRecord(part.output) : null;

  if (part.state === "output-denied") return "Computer action denied";
  if (part.state === "output-error") return "Computer action failed";

  if (
    part.state === "approval-requested" ||
    part.state === "approval-responded" ||
    part.state === "input-streaming" ||
    part.state === "input-available"
  ) {
    if (toolName === "computer_screenshot") return "Capture desktop";
    if (toolName === "computer_action") return "Control desktop";
    if (toolName === "computer_apps") return "List Mac apps";
    if (toolName === "computer_app") return "Focus Mac app";
    if (toolName === "computer_clipboard") return "Set desktop clipboard";
    if (toolName === "computer_ax_tree") return "Inspect Mac UI tree";
    if (toolName === "computer_ax_find") return "Find Mac UI element";
    if (toolName === "computer_ax_action") return "Use Mac UI element";
    return "Check desktop computer use";
  }

  if (output?.supported === false) return "Desktop computer use unsupported";

  switch (toolName) {
    case "computer_status": {
      const displays = Array.isArray(output?.displays)
        ? output.displays.length
        : 0;
      return `Checked desktop status (${displays} display${displays === 1 ? "" : "s"})`;
    }
    case "computer_screenshot":
      return output?.dataUrl
        ? "Captured desktop screenshot"
        : "Desktop screenshot unavailable";
    case "computer_action": {
      const actions = Array.isArray(output?.actions)
        ? output.actions.length
        : 0;
      return `Ran ${actions} desktop action${actions === 1 ? "" : "s"}`;
    }
    case "computer_apps": {
      const apps = Array.isArray(output?.apps) ? output.apps.length : 0;
      return `Found ${apps} Mac app${apps === 1 ? "" : "s"}`;
    }
    case "computer_app": {
      const app = getRecord(output?.app);
      return typeof app?.name === "string"
        ? `Focused ${app.name}`
        : "Focused Mac app";
    }
    case "computer_clipboard": {
      const length =
        typeof output?.textLength === "number" ? output.textLength : 0;
      return `Set clipboard (${length} character${length === 1 ? "" : "s"})`;
    }
    case "computer_ax_tree": {
      const count =
        typeof output?.nodeCount === "number" ? output.nodeCount : 0;
      return `Read Mac UI tree (${count} node${count === 1 ? "" : "s"})`;
    }
    case "computer_ax_find": {
      const matches = Array.isArray(output?.matches)
        ? output.matches.length
        : 0;
      return `Found ${matches} Mac UI element${matches === 1 ? "" : "s"}`;
    }
    case "computer_ax_action":
      return output?.ok === true
        ? "Used Mac UI element"
        : "Mac UI action failed";
    default:
      return toolName.replace(/_/g, " ");
  }
}

function getPreview(value: unknown) {
  const record = getRecord(value);
  if (!record) return null;
  if (record.type === "screenshot" && typeof record.dataUrl === "string") {
    return null;
  }
  if (record.type === "action" && Array.isArray(record.actions)) {
    return stringifyJson({
      ...record,
      actions: record.actions.map((action) => {
        const actionRecord = getRecord(action);
        const screenshot = getRecord(actionRecord?.screenshot);
        if (!actionRecord || typeof screenshot?.dataUrl !== "string") {
          return action;
        }
        return {
          ...actionRecord,
          screenshot: {
            ...screenshot,
            dataUrl: "[preview shown above]",
          },
        };
      }),
    });
  }
  return stringifyJson(value);
}

function getScreenshotDataUrl(value: unknown) {
  const record = getRecord(value);
  if (!record) return null;
  if (record.type === "screenshot" && typeof record.dataUrl === "string") {
    return record.dataUrl;
  }
  if (record.type !== "action" || !Array.isArray(record.actions)) {
    return null;
  }

  for (const action of record.actions) {
    const actionRecord = getRecord(action);
    const screenshot = getRecord(actionRecord?.screenshot);
    if (typeof screenshot?.dataUrl === "string") {
      return screenshot.dataUrl;
    }
  }

  return null;
}

export const ComputerTool = memo(function ComputerTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    defaultExpanded: false,
    toolCallId: "toolCallId" in part ? part.toolCallId : getToolName(part),
  });
  const output = "output" in part ? part.output : null;
  const outputRecord = getRecord(output);
  const screenshotDataUrl = getScreenshotDataUrl(output);
  const preview = getPreview(output);
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const isRunning =
    part.state === "approval-responded" ||
    part.state === "input-available" ||
    part.state === "input-streaming";
  const isError =
    part.state === "output-error" ||
    part.state === "output-denied" ||
    outputRecord?.supported === false;
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
      errorText={
        isError
          ? partErrorText ||
            (typeof outputRecord?.message === "string"
              ? outputRecord.message
              : undefined)
          : undefined
      }
      isError={isError}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      summary={getSummary(part)}
    >
      {screenshotDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="Desktop screenshot"
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
