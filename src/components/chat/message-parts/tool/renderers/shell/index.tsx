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

type ShellToolInput = {
  backgroundTaskId?: string;
  command?: string;
  mode?: "run" | "start_background" | "check_background" | "stop_background";
  rationale: string;
  runInBackground?: boolean;
  waitForCompletion?: boolean;
};

type ShellToolOutput = {
  cwd: string;
  durationMs: number;
  phase: "background" | "completed" | "running";
  truncated: boolean;
} & (
  | {
      phase: "completed";
      exitCode: number;
      stderr: string;
      stdout: string;
    }
  | {
      backgroundTaskId: string;
      command: string;
      error: string | null;
      exitCode: number | null;
      phase: "background";
      status: "completed" | "failed" | "running" | "stopped";
      stderr: string;
      stdout: string;
      tail: string;
    }
  | {
      phase: "running";
      tail: string;
    }
);

function isShellToolInput(value: unknown): value is ShellToolInput {
  return (
    !!value &&
    typeof value === "object" &&
    "rationale" in value &&
    typeof value.rationale === "string" &&
    (!("command" in value) || typeof value.command === "string") &&
    (!("backgroundTaskId" in value) ||
      typeof value.backgroundTaskId === "string")
  );
}

function isShellToolOutput(value: unknown): value is ShellToolOutput {
  const candidate = value as {
    backgroundTaskId?: unknown;
    command?: unknown;
    cwd?: unknown;
    durationMs?: unknown;
    error?: unknown;
    exitCode?: unknown;
    phase?: unknown;
    stderr?: unknown;
    status?: unknown;
    stdout?: unknown;
    tail?: unknown;
    truncated?: unknown;
  };

  return (
    !!candidate &&
    typeof value === "object" &&
    typeof candidate.cwd === "string" &&
    typeof candidate.durationMs === "number" &&
    (candidate.phase === "running" ||
      candidate.phase === "completed" ||
      candidate.phase === "background") &&
    typeof candidate.truncated === "boolean" &&
    (candidate.phase === "running"
      ? typeof candidate.tail === "string"
      : candidate.phase === "background"
        ? typeof candidate.backgroundTaskId === "string" &&
          typeof candidate.command === "string" &&
          typeof candidate.status === "string" &&
          typeof candidate.tail === "string" &&
          typeof candidate.stdout === "string" &&
          typeof candidate.stderr === "string" &&
          (candidate.error === null || typeof candidate.error === "string") &&
          (candidate.exitCode === null ||
            typeof candidate.exitCode === "number")
        : typeof candidate.exitCode === "number" &&
          typeof candidate.stderr === "string" &&
          typeof candidate.stdout === "string")
  );
}

function isRunningShellOutput(
  output: ShellToolOutput | null,
): output is Extract<ShellToolOutput, { phase: "running" }> {
  return output?.phase === "running";
}

function isCompletedShellOutput(
  output: ShellToolOutput | null,
): output is Extract<ShellToolOutput, { phase: "completed" }> {
  return output?.phase === "completed";
}

function isBackgroundShellOutput(
  output: ShellToolOutput | null,
): output is Extract<ShellToolOutput, { phase: "background" }> {
  return output?.phase === "background";
}

function getDisplayCommand(
  input: ShellToolInput,
  output: ShellToolOutput | null,
) {
  if (input.command) return input.command;
  if (isBackgroundShellOutput(output)) return output.command;
  return input.backgroundTaskId
    ? `background task ${input.backgroundTaskId}`
    : "shell command";
}

function formatDuration(durationMs: number) {
  return `${(durationMs / 1000).toFixed(durationMs >= 1000 ? 1 : 2)}s`;
}

function truncateCommand(command: string, length = 60) {
  if (command.length <= length) return command;
  return `${command.slice(0, length)}...`;
}

function buildSummary(
  part: RendererProps["part"],
  input: ShellToolInput,
  output: ShellToolOutput | null,
): ReactNode {
  const cmd = truncateCommand(getDisplayCommand(input, output));

  if (part.state === "output-denied") {
    return <>Shell command denied</>;
  }

  if (part.state === "output-error") {
    return (
      <>
        Shell failed <span className="font-mono text-[12px]">$ {cmd}</span>
      </>
    );
  }

  if (isCompletedShellOutput(output)) {
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

  if (isBackgroundShellOutput(output)) {
    const label =
      output.status === "running"
        ? "Background"
        : output.status === "completed"
          ? "Completed"
          : output.status === "stopped"
            ? "Stopped"
            : "Failed";
    return (
      <>
        {label} <span className="font-mono text-[12px]">$ {cmd}</span>
        <span className="ml-1.5 text-[11px] text-foreground/40">
          {formatDuration(output.durationMs)}
          {output.exitCode != null && output.exitCode !== 0
            ? ` · exit ${output.exitCode}`
            : ""}
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
  input: ShellToolInput,
  output: ShellToolOutput | null,
  state: RendererProps["part"]["state"],
  errorText?: string,
) {
  const command = getDisplayCommand(input, output);
  const lines = [`$ ${command}`];

  if (state === "output-denied") {
    lines.push("Execution denied.");
    return lines.join("\n");
  }

  if (output) {
    if (output.phase === "running") {
      if (output.tail.trim()) lines.push(output.tail.trimEnd());
      return lines.join("\n");
    }
    if (output.phase === "background") {
      const stdout = output.stdout.trimEnd();
      const stderr = output.stderr.trimEnd();
      const tail = output.tail.trimEnd();
      if (stdout) lines.push(stdout);
      if (stderr) lines.push(stderr);
      if (!stdout && !stderr && tail) lines.push(tail);
      if (output.error) lines.push(output.error);
      if (!stdout && !stderr && !tail && !output.error) {
        lines.push(`Background task: ${output.backgroundTaskId}`);
      }
      return lines.join("\n");
    }
    const stdout = output.stdout.trimEnd();
    const stderr = output.stderr.trimEnd();
    if (stdout) lines.push(stdout);
    if (stderr) lines.push(stderr);
    if (!stdout && !stderr) lines.push("(no output)");
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

export const ShellTool = memo(function ShellTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const shellInput =
    hasInput && isShellToolInput(part.input) ? part.input : null;
  const shellOutput =
    hasOutput && isShellToolOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const approvalId = approval?.id;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;
  const isRunningShellState =
    part.state === "approval-responded" ||
    (part.state === "output-available" &&
      (isRunningShellOutput(shellOutput) ||
        (isBackgroundShellOutput(shellOutput) &&
          shellOutput.status === "running")));
  const isFinishedShellState =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    (part.state === "output-available" &&
      (isCompletedShellOutput(shellOutput) ||
        (isBackgroundShellOutput(shellOutput) &&
          shellOutput.status !== "running")));
  const isErrorState =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    (isCompletedShellOutput(shellOutput) && shellOutput.exitCode !== 0) ||
    (isBackgroundShellOutput(shellOutput) &&
      (shellOutput.status === "failed" ||
        (shellOutput.exitCode != null && shellOutput.exitCode !== 0)));
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: part.state === "approval-requested" || isRunningShellState,
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
    <div className="flex items-center justify-between">
      <span>
        {formatDuration(shellOutput.durationMs)}
        {shellOutput.truncated ? " · truncated" : ""}
      </span>
      {isCompletedShellOutput(shellOutput) ? (
        <span
          className={
            shellOutput.exitCode === 0 ? "text-success" : "text-danger"
          }
        >
          {shellOutput.exitCode === 0
            ? "Success"
            : `Exit ${shellOutput.exitCode}`}
        </span>
      ) : isBackgroundShellOutput(shellOutput) ? (
        <span
          className={
            shellOutput.status === "failed" ||
            (shellOutput.exitCode != null && shellOutput.exitCode !== 0)
              ? "text-danger"
              : shellOutput.status === "stopped"
                ? "text-warning"
                : "text-success"
          }
        >
          {shellOutput.status === "completed" && shellOutput.exitCode != null
            ? shellOutput.exitCode === 0
              ? "Completed"
              : `Exit ${shellOutput.exitCode}`
            : shellOutput.status}
        </span>
      ) : null}
    </div>
  ) : null;

  return (
    <ToolLayout
      summary={summary}
      isRunning={isRunningShellState}
      isError={isErrorState}
      isExpandable={isFinishedShellState || isRunningShellState}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={isErrorState ? partErrorText : undefined}
      footer={footer}
      actions={
        <>
          {part.state === "approval-requested" ? (
            <p className="mb-1.5 line-clamp-2 text-[11px] text-muted">
              {shellInput.rationale}
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
      <TerminalOutput text={terminalText} />
    </ToolLayout>
  );
});
