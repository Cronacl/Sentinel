"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";

import type { RendererProps } from "../renderer";
import { ToolLayout } from "./tool-layout";

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

function formatDuration(durationMs: number) {
  return `${(durationMs / 1000).toFixed(durationMs >= 1000 ? 1 : 2)}s`;
}

function buildSummary(
  part: RendererProps["part"],
  input: RunTaskToolInput,
  output: RunTaskToolOutput | null,
): ReactNode {
  if (part.state === "output-denied") {
    return <>Task denied</>;
  }

  if (part.state === "output-error") {
    return (
      <>
        Task <span className="font-medium">{input.task}</span> failed
        {input.path ? <span className="text-foreground/40"> in {input.path}</span> : null}
      </>
    );
  }

  if (isCompletedOutput(output)) {
    const succeeded = output.exitCode === 0;
    return (
      <>
        Ran <span className="font-medium">{output.task}</span>
        {input.path ? <span className="text-foreground/40"> in {input.path}</span> : null}
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
        Run <span className="font-medium">{input.task}</span>
        {input.path ? <span className="text-foreground/40"> in {input.path}</span> : null}
      </>
    );
  }

  return (
    <>
      Running <span className="font-medium">{input.task}</span>
      {input.path ? <span className="text-foreground/40"> in {input.path}</span> : null}
    </>
  );
}

function buildBody(
  input: RunTaskToolInput,
  output: RunTaskToolOutput | null,
  state: RendererProps["part"]["state"],
  errorText?: string,
) {
  const command = output?.command ?? input.task;
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
  const isErrorState =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    (isCompletedOutput(runTaskOutput) && runTaskOutput.exitCode !== 0);
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested" || isRunningState,
  );

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested" || isRunningState);
  }, [isRunningState, part.state, part.toolCallId]);

  if (!runTaskInput) return null;

  const summary = buildSummary(part, runTaskInput, runTaskOutput);
  const terminalText = buildBody(runTaskInput, runTaskOutput, part.state, partErrorText);

  const footer = runTaskOutput ? (
    <div className="flex items-center justify-between">
      <span>
        {runTaskOutput.script} · {formatDuration(runTaskOutput.durationMs)}
        {runTaskOutput.truncated ? " · truncated" : ""}
      </span>
      {isCompletedOutput(runTaskOutput) ? (
        <span className={runTaskOutput.exitCode === 0 ? "text-success" : "text-danger"}>
          {runTaskOutput.exitCode === 0 ? "Success" : `Exit ${runTaskOutput.exitCode}`}
        </span>
      ) : null}
    </div>
  ) : null;

  return (
    <ToolLayout
      summary={summary}
      isRunning={isRunningState}
      isError={isErrorState}
      isExpandable={isFinishedState}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={partErrorText && part.state !== "output-error" ? partErrorText : undefined}
      footer={footer}
      actions={
        <>
          {part.state === "approval-requested" ? (
            <p className="mb-1.5 line-clamp-2 text-[11px] text-muted">{runTaskInput.rationale}</p>
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
      <ScrollShadow className="max-h-[160px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
        {terminalText}
      </ScrollShadow>
    </ToolLayout>
  );
});
