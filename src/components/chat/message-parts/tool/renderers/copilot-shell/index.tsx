"use client";

import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollShadow } from "@heroui/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@iconify/react";

import { writeTextToClipboard } from "@/lib/desktop/permissions";
import type { RendererProps } from "../../renderer";
import { getToolName } from "../../../types";
import { ToolLayout } from "../shared/tool-layout";
import { renderCopilotApprovalActions } from "../copilot-approval-actions";
import {
  extractCopilotTextFromContent,
  formatDuration,
  isCopilotToolErrorState,
  isCopilotToolRunningState,
  parseShellFromContentText,
  tryParseCopilotOutput,
  unwrapCopilotInput,
  useCopilotExpansionState,
} from "../copilot-helpers";
import { highlightToTokens, type ThemedToken } from "@/lib/syntax/highlighter";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";

type CopilotShellExecInput = {
  command?: string;
  description?: string;
  fullCommandText?: string;
  intention?: string;
};

type CopilotShellOutput = {
  elapsedTimeSeconds?: number;
  exitCode?: number;
  interrupted?: boolean;
  stderr?: string;
  stdout?: string;
};

function isShellOutput(value: unknown): value is CopilotShellOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.stdout === "string" ||
    typeof v.stderr === "string" ||
    typeof v.exitCode === "number" ||
    typeof v.elapsedTimeSeconds === "number"
  );
}

function getShellAction(toolName: string) {
  if (toolName === "copilot_bash" || toolName === "copilot_powershell") {
    return {
      label: "command",
      present: "Run",
      past: "Ran",
      progressive: "Running",
    };
  }

  if (
    toolName === "copilot_read_bash" ||
    toolName === "copilot_read_powershell"
  ) {
    return {
      label: "shell output",
      present: "Read",
      past: "Read",
      progressive: "Reading",
    };
  }

  if (
    toolName === "copilot_write_bash" ||
    toolName === "copilot_write_powershell"
  ) {
    return {
      label: "shell input",
      present: "Write",
      past: "Wrote",
      progressive: "Writing",
    };
  }

  if (
    toolName === "copilot_stop_bash" ||
    toolName === "copilot_stop_powershell"
  ) {
    return {
      label: "shell session",
      present: "Stop",
      past: "Stopped",
      progressive: "Stopping",
    };
  }

  if (
    toolName === "copilot_list_bash" ||
    toolName === "copilot_list_powershell"
  ) {
    return {
      label: "shell sessions",
      present: "List",
      past: "Listed",
      progressive: "Listing",
    };
  }

  return {
    label: "command",
    present: "Run",
    past: "Ran",
    progressive: "Running",
  };
}

function truncateCommand(command: string, length = 60) {
  if (command.length <= length) return command;
  return `${command.slice(0, length)}...`;
}

function getCommandText(input: CopilotShellExecInput) {
  return input.command ?? input.fullCommandText ?? input.intention ?? null;
}

function buildSummary(
  part: RendererProps["part"],
  toolName: string,
  input: CopilotShellExecInput | null,
  output: CopilotShellOutput | null,
  hasRawOutput: boolean,
): ReactNode {
  const action = getShellAction(toolName);
  const command = input ? getCommandText(input) : null;
  const cmd = command ? truncateCommand(command) : null;

  if (part.state === "output-denied") {
    return <>{action.label} denied</>;
  }

  if (part.state === "output-error") {
    return cmd ? (
      <>
        {action.label} failed{" "}
        <span className="font-mono text-[12px]">$ {cmd}</span>
      </>
    ) : (
      <>{action.label} failed</>
    );
  }

  if (
    part.state === "output-available" &&
    (hasRawOutput ||
      (output && (output.stdout !== undefined || output.stderr !== undefined)))
  ) {
    return (
      <>
        {action.past}{" "}
        {cmd ? (
          <span className="font-mono text-[12px]">$ {cmd}</span>
        ) : (
          action.label
        )}
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
    return cmd ? (
      <>
        {action.present} <span className="font-mono text-[12px]">$ {cmd}</span>
      </>
    ) : (
      <>
        {action.present} {action.label}
      </>
    );
  }

  return (
    <>
      {action.progressive}{" "}
      {cmd ? (
        <span className="font-mono text-[12px]">$ {cmd}</span>
      ) : (
        action.label
      )}
      {output?.elapsedTimeSeconds != null && (
        <span className="ml-1.5 text-[11px] text-foreground/40">
          {formatDuration(output.elapsedTimeSeconds * 1000)}
        </span>
      )}
    </>
  );
}

function getTerminalText(
  input: CopilotShellExecInput,
  output: CopilotShellOutput | null,
  state: RendererProps["part"]["state"],
  errorText?: string,
  fallbackText?: string | null,
) {
  const command = getCommandText(input);
  const lines = command ? [`$ ${command}`] : [];

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

  if (state === "output-available") {
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

export const CopilotShellTool = memo(function CopilotShellTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const rawInput = hasInput ? part.input : undefined;
  const shellInput = unwrapCopilotInput<CopilotShellExecInput>(rawInput);
  const rawOutput = hasOutput ? part.output : undefined;
  const shellOutput = hasOutput
    ? tryParseCopilotOutput(rawOutput, isShellOutput)
    : null;
  const fallbackOutputText =
    !shellOutput && rawOutput !== undefined
      ? extractCopilotTextFromContent(rawOutput)
      : null;

  const parsedContent = !shellOutput
    ? parseShellFromContentText(fallbackOutputText)
    : null;

  const effectiveExitCode =
    shellOutput?.exitCode ?? parsedContent?.exitCode ?? null;
  const effectiveInterrupted =
    shellOutput?.interrupted ?? parsedContent?.interrupted ?? false;
  const cleanFallbackText = parsedContent?.text ?? fallbackOutputText;

  const partErrorText = "errorText" in part ? part.errorText : undefined;

  const toolName = getToolName(part);
  const isRunning = isCopilotToolRunningState(part.state);
  const isFinished =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    part.state === "output-available";
  const isError =
    isCopilotToolErrorState(part.state) ||
    effectiveInterrupted ||
    (effectiveExitCode != null && effectiveExitCode !== 0);
  const [isExpanded, setIsExpanded] = useCopilotExpansionState(
    part,
    part.state === "approval-requested",
  );
  const actions = renderCopilotApprovalActions({ onApprove, onDeny, part });

  const elapsedTime =
    shellOutput?.elapsedTimeSeconds ??
    (rawOutput &&
    typeof rawOutput === "object" &&
    "elapsedTimeSeconds" in rawOutput &&
    typeof (rawOutput as Record<string, unknown>).elapsedTimeSeconds ===
      "number"
      ? ((rawOutput as Record<string, unknown>).elapsedTimeSeconds as number)
      : null);

  const terminalText = shellInput
    ? getTerminalText(
        shellInput,
        shellOutput,
        part.state,
        partErrorText,
        cleanFallbackText,
      )
    : (cleanFallbackText ?? "");

  const hasAnyOutput =
    (shellOutput &&
      (shellOutput.stdout !== undefined || shellOutput.stderr !== undefined)) ||
    (isFinished && cleanFallbackText);
  const footer = hasAnyOutput ? (
    <div className="flex items-center justify-between">
      {elapsedTime != null ? (
        <span>{formatDuration(elapsedTime * 1000)}</span>
      ) : (
        <span />
      )}
      <span
        className={
          effectiveInterrupted
            ? "text-warning"
            : isError
              ? "text-danger"
              : "text-success"
        }
      >
        {effectiveInterrupted
          ? "Interrupted"
          : effectiveExitCode != null && effectiveExitCode !== 0
            ? `Exit ${effectiveExitCode}`
            : isError
              ? "Error"
              : "Completed"}
      </span>
    </div>
  ) : null;

  return (
    <ToolLayout
      actions={actions}
      errorText={
        partErrorText && part.state !== "output-error"
          ? partErrorText
          : undefined
      }
      footer={footer}
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
            icon="solar:terminal-linear"
          />
          {buildSummary(
            part,
            toolName,
            shellInput,
            shellOutput,
            rawOutput !== undefined,
          )}
        </>
      }
    >
      <TerminalOutput text={terminalText} />
    </ToolLayout>
  );
});
