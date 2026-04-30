"use client";

import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { writeTextToClipboard } from "@/lib/desktop/permissions";
import type { RendererProps } from "../../renderer";
import { ToolLayout, useToolExpansionState } from "../shared/tool-layout";
import { highlightToTokens, type ThemedToken } from "@/lib/syntax/highlighter";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";

type CommandAction = {
  type: string;
  command: string;
  path?: string;
};

type CodexShellInput = {
  command: string;
  commandActions?: CommandAction[];
  cwd: string;
  reason?: string | null;
};

type CodexShellOutput = {
  durationMs: number;
  exitCode: number;
  output: string;
  processId?: string;
  status: string;
};

function isCodexShellInput(value: unknown): value is CodexShellInput {
  return (
    !!value &&
    typeof value === "object" &&
    "command" in value &&
    typeof (value as CodexShellInput).command === "string" &&
    "cwd" in value &&
    typeof (value as CodexShellInput).cwd === "string"
  );
}

function isCodexShellOutput(value: unknown): value is CodexShellOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.exitCode === "number" && typeof v.output === "string";
}

function extractDisplayCommand(input: CodexShellInput): string {
  if (input.commandActions?.length) {
    return input.commandActions.map((a) => a.command).join(" && ");
  }

  const shellExec = input.command.match(/^\/bin\/(?:ba)?sh\s+-\w*c\s+'(.+)'$/s);
  if (shellExec?.[1]) return shellExec[1];

  const zshExec = input.command.match(/^\/bin\/zsh\s+-\w*c\s+'(.+)'$/s);
  if (zshExec?.[1]) return zshExec[1];

  return input.command;
}

function truncateCommand(command: string, length = 60) {
  if (command.length <= length) return command;
  return `${command.slice(0, length)}...`;
}

function formatDuration(durationMs: number) {
  return `${(durationMs / 1000).toFixed(durationMs >= 1000 ? 1 : 2)}s`;
}

function buildSummary(
  part: RendererProps["part"],
  input: CodexShellInput,
  output: CodexShellOutput | null,
): ReactNode {
  const cmd = truncateCommand(extractDisplayCommand(input));

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

  if (output) {
    const succeeded = output.exitCode === 0;
    return (
      <>
        Ran <span className="font-mono text-[12px]">$ {cmd}</span>
        <span className="ml-1.5 text-[11px] text-foreground/40">
          {formatDuration(output.durationMs)}
          {!succeeded ? ` · exit ${output.exitCode}` : ""}
        </span>
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
    </>
  );
}

function getTerminalText(
  input: CodexShellInput,
  output: CodexShellOutput | null,
  state: RendererProps["part"]["state"],
  errorText?: string,
) {
  const displayCmd = extractDisplayCommand(input);
  const lines = [`$ ${displayCmd}`];

  if (state === "output-denied") {
    lines.push("Execution denied.");
    return lines.join("\n");
  }

  if (output) {
    const text = output.output.trimEnd();
    if (text) lines.push(text);
    else lines.push("(no output)");
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
    const didCopy = await writeTextToClipboard(outputOnly || text, {
      errorMessage: "Unable to copy this command output.",
    });
    if (!didCopy) {
      return;
    }

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
        <div className="min-w-0 font-mono text-[11px] leading-[18px]">
          {codeLines.map((line, idx) => (
            <div
              key={idx}
              className="whitespace-pre-wrap pr-6"
              style={{ overflowWrap: "anywhere" }}
            >
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

export const CodexShellTool = memo(function CodexShellTool({
  onApprove,
  onApproveWithDecision,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const shellInput =
    hasInput && isCodexShellInput(part.input) ? part.input : null;
  const shellOutput =
    hasOutput && isCodexShellOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const approvalId = approval?.id;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;

  const isRunning =
    part.state === "approval-responded" ||
    part.state === "input-available" ||
    part.state === "input-streaming" ||
    (part.state === "output-available" && shellOutput?.status !== "completed");
  const isFinished =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    part.state === "output-available";
  const isError =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    (shellOutput != null && shellOutput.exitCode !== 0);
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: part.state === "approval-requested" || isRunning,
    autoExpand: part.state === "approval-requested",
  });

  if (!shellInput) return null;

  const summary = buildSummary(part, shellInput, shellOutput);
  const terminalText = getTerminalText(
    shellInput,
    shellOutput,
    part.state,
    partErrorText,
  );

  const footer = shellOutput ? (
    <div className="flex flex-col gap-0.5">
      {shellInput.cwd && (
        <span className="truncate text-foreground/40" title={shellInput.cwd}>
          cwd: {shellInput.cwd}
        </span>
      )}
      <div className="flex items-center justify-between">
        <span>{formatDuration(shellOutput.durationMs)}</span>
        <span
          className={
            shellOutput.exitCode === 0 ? "text-success" : "text-danger"
          }
        >
          {shellOutput.exitCode === 0
            ? "Success"
            : `Exit ${shellOutput.exitCode}`}
        </span>
      </div>
    </div>
  ) : null;

  return (
    <ToolLayout
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={isFinished || isRunning}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={isError ? partErrorText : undefined}
      footer={footer}
      actions={
        showApprovalActions ? (
          <div className="flex flex-col gap-2">
            {shellInput.reason && (
              <p className="text-[11px] text-muted line-clamp-2">
                {shellInput.reason}
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
      <TerminalOutput text={terminalText} />
    </ToolLayout>
  );
});
