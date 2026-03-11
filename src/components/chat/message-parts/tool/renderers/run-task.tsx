"use client";

import { memo, useEffect, useState } from "react";
import { Button, Disclosure, ScrollShadow, Spinner } from "@heroui/react";

import type { RendererProps } from "../renderer";

type RunTaskToolInput = {
  path?: string;
  rationale: string;
  task: "build" | "format" | "lint" | "test" | "typecheck";
};

type RunTaskToolOutput = {
  command: string;
  cwd: string;
  durationMs: number;
  packageManager: "bun" | "npm" | "pnpm" | "yarn";
  phase: "completed" | "running";
  script: string;
  task: "build" | "format" | "lint" | "test" | "typecheck";
  truncated: boolean;
} & (
  | {
      phase: "completed";
      exitCode: number;
      stderr: string;
      stdout: string;
    }
  | {
      phase: "running";
      tail: string;
    }
);

function isRunTaskInput(value: unknown): value is RunTaskToolInput {
  const candidate = value as { path?: unknown; rationale?: unknown; task?: unknown };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.rationale === "string" &&
    typeof candidate.task === "string" &&
    (candidate.path === undefined || typeof candidate.path === "string")
  );
}

function isRunTaskOutput(value: unknown): value is RunTaskToolOutput {
  const candidate = value as {
    command?: unknown;
    cwd?: unknown;
    durationMs?: unknown;
    exitCode?: unknown;
    packageManager?: unknown;
    phase?: unknown;
    script?: unknown;
    stderr?: unknown;
    stdout?: unknown;
    tail?: unknown;
    task?: unknown;
    truncated?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.command === "string" &&
    typeof candidate.cwd === "string" &&
    typeof candidate.durationMs === "number" &&
    typeof candidate.packageManager === "string" &&
    (candidate.phase === "running" || candidate.phase === "completed") &&
    typeof candidate.script === "string" &&
    typeof candidate.task === "string" &&
    typeof candidate.truncated === "boolean" &&
    (candidate.phase === "running"
      ? typeof candidate.tail === "string"
      : typeof candidate.exitCode === "number" &&
        typeof candidate.stderr === "string" &&
        typeof candidate.stdout === "string")
  );
}

function isRunningOutput(
  output: RunTaskToolOutput | null,
): output is Extract<RunTaskToolOutput, { phase: "running" }> {
  return output?.phase === "running";
}

function isCompletedOutput(
  output: RunTaskToolOutput | null,
): output is Extract<RunTaskToolOutput, { phase: "completed" }> {
  return output?.phase === "completed";
}

function getStatusChipClass(tone: "danger" | "muted" | "success") {
  switch (tone) {
    case "success":
      return "border-success/5 bg-success/10 text-success";
    case "danger":
      return "border-danger/20 bg-danger-soft text-danger-soft-foreground";
    default:
      return "border-border/60 bg-background/70 text-muted";
  }
}

function getStatus(part: RendererProps["part"], output: RunTaskToolOutput | null) {
  if (part.state === "approval-responded" || isRunningOutput(output)) {
    return { label: "Running", tone: "muted" as const };
  }

  if (part.state === "approval-requested") {
    return { label: "Needs approval", tone: "muted" as const };
  }

  if (part.state === "output-denied") {
    return { label: "Denied", tone: "danger" as const };
  }

  if (part.state === "output-error") {
    return { label: "Failed", tone: "danger" as const };
  }

  if (part.state === "output-available" && isCompletedOutput(output)) {
    return output.exitCode === 0
      ? { label: "Success", tone: "success" as const }
      : { label: "Failed", tone: "danger" as const };
  }

  return { label: "Running", tone: "muted" as const };
}

function buildBody({
  errorText,
  input,
  output,
  state,
}: {
  errorText?: string;
  input: RunTaskToolInput;
  output: RunTaskToolOutput | null;
  state: RendererProps["part"]["state"];
}) {
  const command = output?.command ?? input.task;
  const lines = [`$ ${command}`];

  if (state === "output-denied") {
    lines.push("Execution denied.");
    return lines.join("\n");
  }

  if (output) {
    if (output.phase === "running") {
      if (output.tail.trim()) {
        lines.push(output.tail.trimEnd());
      }
      return lines.join("\n");
    }

    const stdout = output.stdout.trimEnd();
    const stderr = output.stderr.trimEnd();
    if (stdout) {
      lines.push(stdout);
    }
    if (stderr) {
      lines.push(stderr);
    }
    if (!stdout && !stderr) {
      lines.push("(no output)");
    }
    return lines.join("\n");
  }

  if (errorText) {
    lines.push(errorText);
  }

  return lines.join("\n");
}

function formatDuration(durationMs: number) {
  return `${(durationMs / 1000).toFixed(durationMs >= 1000 ? 1 : 2)}s`;
}

export const RunTaskTool = memo(function RunTaskTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const runTaskInput = hasInput && isRunTaskInput(part.input) ? part.input : null;
  const runTaskOutput = hasOutput && isRunTaskOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;
  const isRunningState =
    part.state === "approval-responded" ||
    (part.state === "output-available" && isRunningOutput(runTaskOutput));
  const isFinishedState =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    (part.state === "output-available" && isCompletedOutput(runTaskOutput));
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested" || isRunningState,
  );

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested" || isRunningState);
  }, [isRunningState, part.state, part.toolCallId]);

  if (!runTaskInput) {
    return null;
  }

  const status = getStatus(part, runTaskOutput);
  const terminalText = buildBody({
    errorText: partErrorText,
    input: runTaskInput,
    output: runTaskOutput,
    state: part.state,
  });

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
      <div className="rounded-2xl border border-border/60 bg-surface/20 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-medium text-foreground">Run task</p>
              <div
                className={`rounded-full flex items-center gap-1 border px-1.5 py-0.5 text-[10px] ${getStatusChipClass(status.tone)}`}
              >
                {status.label === "Running" ? (
                  <Spinner className="h-3 w-3" size="sm" />
                ) : null}
                <span className="truncate">{status.label}</span>
              </div>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-foreground/72">
              {runTaskInput.task}
              {runTaskInput.path ? ` in ${runTaskInput.path}` : ""}
            </p>
          </div>

          {isFinishedState ? (
            <Disclosure.Heading>
              <Button
                slot="trigger"
                size="sm"
                variant="tertiary"
                className="h-auto min-w-0 px-2 py-0.5 bg-background text-[10px] text-foreground transition-colors hover:text-foreground"
              >
                {isExpanded ? "Hide" : "Show"}
              </Button>
            </Disclosure.Heading>
          ) : null}
        </div>

        {part.state === "approval-requested" ? (
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted">
            {runTaskInput.rationale}
          </p>
        ) : null}

        <Disclosure.Content>
          <Disclosure.Body>
            <div className="mt-2 overflow-hidden rounded-2xl border border-border/20 bg-surface">
              <div className="border-b border-border/50 px-3.5 py-2 text-[9px] text-foreground">
                Run task
              </div>

              <div className="px-3.5 py-3">
                <ScrollShadow className="max-h-[180px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-6 text-foreground">
                  {terminalText}
                </ScrollShadow>

                {runTaskOutput ? (
                  <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-foreground">
                    <span className="truncate">
                      {runTaskOutput.script}
                      {runTaskOutput.phase === "completed"
                        ? ` · ${formatDuration(runTaskOutput.durationMs)}`
                        : ""}
                      {runTaskOutput.truncated ? " · truncated" : ""}
                    </span>
                    <span className="shrink-0 text-white/72">{status.label}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </Disclosure.Body>
        </Disclosure.Content>

        {showApprovalActions ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              onPress={() => {
                if (approvalId) {
                  onApprove?.(approvalId);
                }
              }}
              type="button"
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                if (approvalId) {
                  onDeny?.(approvalId);
                }
              }}
              type="button"
            >
              Deny
            </Button>
          </div>
        ) : null}

        {partErrorText && part.state !== "output-error" ? (
          <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
            {partErrorText}
          </div>
        ) : null}
      </div>
    </Disclosure>
  );
});
