"use client";

import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import {
  unwrapClaudeInput,
  getApprovalReason,
  extractTextFromContent,
  formatDuration,
} from "../claude-helpers";
import { highlightToTokens, type ThemedToken } from "@/lib/syntax/highlighter";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";

type ClaudeBashInput = {
  command: string;
  description?: string;
  run_in_background?: boolean;
  timeout?: number;
};

type ClaudeBashOutput = {
  backgroundTaskId?: string;
  interrupted?: boolean;
  stderr?: string;
  stdout?: string;
  elapsedTimeSeconds?: number;
};

function isBashInput(value: unknown): value is ClaudeBashInput {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).command === "string";
}

function isBashOutput(value: unknown): value is ClaudeBashOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.stdout === "string" ||
    typeof v.stderr === "string" ||
    typeof v.elapsedTimeSeconds === "number"
  );
}

function truncateCommand(command: string, length = 60) {
  if (command.length <= length) return command;
  return `${command.slice(0, length)}...`;
}

function buildSummary(
  part: RendererProps["part"],
  input: ClaudeBashInput,
  output: ClaudeBashOutput | null,
  hasRawOutput: boolean,
): ReactNode {
  const cmd = truncateCommand(input.command);

  if (part.state === "output-denied") {
    return <>Command denied</>;
  }

  if (part.state === "output-error") {
    return (
      <>
        Command failed <span className="font-mono text-[12px]">$ {cmd}</span>
      </>
    );
  }

  if (
    part.state === "output-available" &&
    (hasRawOutput ||
      (output && (output.stdout !== undefined || output.stderr !== undefined)))
  ) {
    return (
      <>
        Ran <span className="font-mono text-[12px]">$ {cmd}</span>
        {output?.elapsedTimeSeconds != null && (
          <span className="ml-1.5 text-[11px] text-foreground/40">
            {formatDuration(output.elapsedTimeSeconds * 1000)}
          </span>
        )}
        {output?.interrupted && (
          <span className="ml-1.5 text-[11px] text-warning"> interrupted</span>
        )}
      </>
    );
  }

  if (part.state === "approval-requested") {
    return (
      <>
        Run <span className="font-mono text-[12px]">$ {cmd}</span>
      </>
    );
  }

  return (
    <>
      Running <span className="font-mono text-[12px]">$ {cmd}</span>
      {output?.elapsedTimeSeconds != null && (
        <span className="ml-1.5 text-[11px] text-foreground/40">
          {formatDuration(output.elapsedTimeSeconds * 1000)}
        </span>
      )}
    </>
  );
}

function getTerminalText(
  input: ClaudeBashInput,
  output: ClaudeBashOutput | null,
  state: RendererProps["part"]["state"],
  errorText?: string,
  hasRawOutput = false,
  fallbackText?: string | null,
) {
  const lines = [`$ ${input.command}`];

  if (state === "output-denied") {
    lines.push("Execution denied.");
    return lines.join("\n");
  }

  if (output) {
    const parts: string[] = [];
    if (output.stdout?.trimEnd()) parts.push(output.stdout.trimEnd());
    if (output.stderr?.trimEnd()) parts.push(output.stderr.trimEnd());
    if (parts.length > 0) lines.push(parts.join("\n"));
    else if (output.stdout !== undefined) lines.push("(no output)");
    return lines.join("\n");
  }

  if (fallbackText?.trimEnd()) {
    lines.push(fallbackText.trimEnd());
    return lines.join("\n");
  }

  if (state === "output-available" && hasRawOutput) {
    lines.push("(no output)");
    return lines.join("\n");
  }

  if (errorText) lines.push(errorText);
  return lines.join("\n");
}

function tokenLinesToSegments(
  tokenLines: ThemedToken[][] | null,
): Array<Array<{ color?: string; text: string }>> {
  if (!tokenLines) return [];
  return tokenLines.map((tokens) =>
    tokens.map((t) => ({ color: t.color, text: t.content })),
  );
}

function TerminalOutput({ text }: { text: string }) {
  const theme = useResolvedTheme();
  const [copied, setCopied] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [syntaxLines, setSyntaxLines] = useState<
    Array<Array<{ color?: string; text: string }>>
  >([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const codeLines = useMemo(() => text.split("\n"), [text]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || hasBeenVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHasBeenVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [hasBeenVisible]);

  useEffect(() => {
    if (!hasBeenVisible || codeLines.length === 0) return;

    let cancelled = false;

    const run = async () => {
      try {
        const tokens = await highlightToTokens(text, "shellscript", theme);
        if (!cancelled) {
          setSyntaxLines(tokenLinesToSegments(tokens));
        }
      } catch {
        // best-effort
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [hasBeenVisible, theme, text, codeLines.length]);

  const handleCopy = useCallback(async () => {
    const outputOnly = codeLines.slice(1).join("\n");
    await navigator.clipboard.writeText(outputOnly || text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [text, codeLines]);

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-label="Copy output"
        className="absolute right-1.5 top-1 z-10 flex cursor-pointer items-center justify-center rounded p-0.5 text-foreground/20 transition-colors hover:text-foreground/50"
        onClick={() => void handleCopy()}
        type="button"
      >
        <HugeiconsIcon
          color="currentColor"
          icon={copied ? Tick01Icon : Copy01Icon}
          size={11}
          strokeWidth={1.5}
        />
      </button>
      <ScrollShadow className="max-h-[200px] overflow-x-auto">
        <div className="font-mono text-[11px] leading-[18px]">
          {codeLines.map((line, idx) => (
            <div key={idx} className="whitespace-pre pr-6">
              {syntaxLines[idx] ? (
                syntaxLines[idx].map((seg, si) => (
                  <span
                    key={si}
                    style={seg.color ? { color: seg.color } : undefined}
                  >
                    {seg.text}
                  </span>
                ))
              ) : (
                <span
                  className={
                    idx === 0 ? "text-foreground/50" : "text-foreground/70"
                  }
                >
                  {line}
                </span>
              )}
            </div>
          ))}
        </div>
      </ScrollShadow>
    </div>
  );
}

export const ClaudeShellTool = memo(function ClaudeShellTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const rawInput = hasInput ? part.input : undefined;
  const unwrapped = unwrapClaudeInput<ClaudeBashInput>(rawInput);
  const bashInput = unwrapped && isBashInput(unwrapped) ? unwrapped : null;
  const rawOutput = hasOutput ? part.output : undefined;
  const bashOutput = isBashOutput(rawOutput)
    ? (rawOutput as ClaudeBashOutput)
    : null;
  const fallbackOutputText =
    !bashOutput && rawOutput !== undefined
      ? extractTextFromContent(rawOutput)
      : null;
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
    (bashOutput != null && bashOutput.interrupted === true);
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested" || isRunning,
  );

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested" || isRunning);
  }, [isRunning, part.state, part.toolCallId]);

  if (!bashInput) return null;

  const summary = buildSummary(
    part,
    bashInput,
    bashOutput,
    rawOutput !== undefined,
  );
  const terminalText = getTerminalText(
    bashInput,
    bashOutput,
    part.state,
    partErrorText,
    rawOutput !== undefined,
    fallbackOutputText,
  );
  const reason = bashInput.description ?? getApprovalReason(approval);

  const hasStructuredOutput =
    bashOutput &&
    (bashOutput.stdout !== undefined || bashOutput.stderr !== undefined);
  const footer =
    hasStructuredOutput || (isFinished && fallbackOutputText) ? (
      <div className="flex items-center justify-between">
        {bashOutput?.elapsedTimeSeconds != null ? (
          <span>{formatDuration(bashOutput.elapsedTimeSeconds * 1000)}</span>
        ) : (
          <span />
        )}
        <span
          className={bashOutput?.interrupted ? "text-warning" : "text-success"}
        >
          {bashOutput?.interrupted ? "Interrupted" : "Completed"}
        </span>
      </div>
    ) : null;

  const isApproval = part.state === "approval-requested";

  return (
    <ToolLayout
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={isFinished || isRunning || isApproval}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={
        partErrorText && part.state !== "output-error"
          ? partErrorText
          : undefined
      }
      footer={footer}
      actions={
        showApprovalActions ? (
          <div className="flex flex-col gap-2">
            {reason && (
              <p className="text-[11px] text-muted line-clamp-2">{reason}</p>
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
      <TerminalOutput text={terminalText} />
    </ToolLayout>
  );
});
