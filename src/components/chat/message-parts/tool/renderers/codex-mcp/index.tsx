"use client";

import type { ReactNode } from "react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { writeTextToClipboard } from "@/lib/desktop/permissions";
import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";

type CodexMcpInput = {
  arguments: unknown;
  server: string;
  tool: string;
};

type CodexMcpOutput = {
  durationMs: number | null;
  error: unknown;
  result: unknown;
  status: string;
};

function isMcpInput(value: unknown): value is CodexMcpInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.server === "string" && typeof v.tool === "string";
}

function isMcpOutput(value: unknown): value is CodexMcpOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "string";
}

function formatDuration(ms: number) {
  return `${(ms / 1000).toFixed(ms >= 1000 ? 1 : 2)}s`;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractMcpResultText(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;

  const r = result as Record<string, unknown>;
  if (Array.isArray(r.content)) {
    const textParts = (r.content as Array<Record<string, unknown>>)
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string);
    if (textParts.length > 0) return textParts.join("\n");
  }

  return null;
}

type McpImageContent = {
  data: string;
  mimeType: string;
};

function extractMcpResultImages(result: unknown): McpImageContent[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  if (!Array.isArray(r.content)) return [];

  return (r.content as Array<Record<string, unknown>>)
    .filter(
      (c) =>
        c.type === "image" &&
        typeof c.data === "string" &&
        typeof c.mimeType === "string",
    )
    .map((c) => ({
      data: c.data as string,
      mimeType: c.mimeType as string,
    }));
}

function extractMcpErrorText(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;
  if (typeof e.message === "string") return e.message;
  return null;
}

function buildSummary(
  part: RendererProps["part"],
  input: CodexMcpInput,
  output: CodexMcpOutput | null,
): ReactNode {
  const toolLabel = (
    <span className="font-mono text-[12px]">
      {input.server}:{input.tool}
    </span>
  );

  if (part.state === "output-denied") {
    return <>MCP call denied</>;
  }

  if (part.state === "output-error" || output?.status === "failed") {
    return <>MCP call failed {toolLabel}</>;
  }

  if (output?.status === "completed" || part.state === "output-available") {
    return (
      <>
        Called {toolLabel}
        {output?.durationMs != null ? (
          <span className="ml-1.5 text-[11px] text-foreground/40">
            {formatDuration(output.durationMs)}
          </span>
        ) : null}
      </>
    );
  }

  if (part.state === "approval-requested") {
    return <>Call {toolLabel}</>;
  }

  return <>Calling {toolLabel}</>;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => formatJson(value), [value]);

  const handleCopy = useCallback(async () => {
    const didCopy = await writeTextToClipboard(text, {
      errorMessage: "Unable to copy this MCP result.",
    });
    if (!didCopy) {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium text-foreground/30">
          {label}
        </span>
        <button
          aria-label={`Copy ${label}`}
          className="flex cursor-pointer items-center justify-center rounded p-0.5 text-foreground/20 transition-colors hover:text-foreground/50"
          onClick={() => void handleCopy()}
          type="button"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={copied ? Tick01Icon : Copy01Icon}
            size={10}
            strokeWidth={1.5}
          />
        </button>
      </div>
      <ScrollShadow className="max-h-[200px] overflow-x-auto">
        <pre className="whitespace-pre font-mono text-[11px] leading-[18px] text-foreground/70">
          {text}
        </pre>
      </ScrollShadow>
    </div>
  );
}

export const CodexMcpTool = memo(function CodexMcpTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const mcpInput = hasInput && isMcpInput(part.input) ? part.input : null;
  const mcpOutput = hasOutput && isMcpOutput(part.output) ? part.output : null;
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
    mcpOutput?.status === "failed";
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested",
  );

  if (!mcpInput) return null;

  const summary = buildSummary(part, mcpInput, mcpOutput);
  const errorText = mcpOutput ? extractMcpErrorText(mcpOutput.error) : null;
  const displayErrorText =
    errorText ?? (partErrorText && isError ? partErrorText : undefined);
  const resultText = mcpOutput ? extractMcpResultText(mcpOutput.result) : null;
  const resultImages = mcpOutput
    ? extractMcpResultImages(mcpOutput.result)
    : [];
  const hasArgs =
    mcpInput.arguments !== undefined && mcpInput.arguments !== null;
  const hasResult =
    mcpOutput?.result !== undefined && mcpOutput?.result !== null;

  return (
    <ToolLayout
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={isFinished || isRunning || hasArgs}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={displayErrorText}
      footer={
        mcpOutput ? (
          <div className="flex items-center justify-between">
            <span>
              {mcpInput.server} / {mcpInput.tool}
            </span>
            {mcpOutput.durationMs != null ? (
              <span className="text-foreground/40">
                {formatDuration(mcpOutput.durationMs)}
              </span>
            ) : (
              <span
                className={
                  mcpOutput.status === "completed"
                    ? "text-success"
                    : "text-danger"
                }
              >
                {mcpOutput.status === "completed" ? "Success" : "Failed"}
              </span>
            )}
          </div>
        ) : null
      }
      actions={
        showApprovalActions ? (
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
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {hasArgs ? (
          <JsonBlock label="Arguments" value={mcpInput.arguments} />
        ) : null}

        {hasResult && !displayErrorText ? (
          resultText ? (
            <div>
              <span className="mb-1 block text-[10px] font-medium text-foreground/30">
                Result
              </span>
              <ScrollShadow className="max-h-[200px] overflow-x-auto">
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
                  {resultText}
                </pre>
              </ScrollShadow>
            </div>
          ) : (
            <JsonBlock label="Result" value={mcpOutput!.result} />
          )
        ) : null}

        {resultImages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {resultImages.map((img, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={i}
                alt={`MCP result ${i + 1}`}
                className="max-h-[300px] max-w-full rounded border border-border/30 object-contain"
                src={`data:${img.mimeType};base64,${img.data}`}
              />
            ))}
          </div>
        )}
      </div>
    </ToolLayout>
  );
});
