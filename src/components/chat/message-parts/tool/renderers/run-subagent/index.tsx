"use client";

import type { ReactNode } from "react";
import { memo, useCallback, useMemo } from "react";
import { Button } from "@heroui/react";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";

import { SubagentThreadPanel } from "@/components/chat/subagent-thread-panel";
import { useRightSidebar } from "@/components/shell/shell-context";
import { api } from "@/trpc/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout, useToolExpansionState } from "../shared/tool-layout";
import { MarkdownContent } from "../../../text/markdown-content";

type RunSubagentInput = {
  allowMutations?: boolean;
  prompt: string;
  toolHints?: {
    categories?: string[];
    integrationNamespaces?: string[];
    mcpNamespaces?: string[];
    note?: string;
  };
  virtualKey?: string;
};

type RunSubagentOutput = {
  childThreadId: string | null;
  status: "approval_required" | "completed" | "failed" | "question_required";
  summaryText: string | null;
  virtualThreadId: string;
};

function isRunSubagentInput(value: unknown): value is RunSubagentInput {
  const candidate = value as {
    allowMutations?: unknown;
    prompt?: unknown;
    toolHints?: unknown;
    virtualKey?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.prompt === "string" &&
    (candidate.allowMutations === undefined ||
      typeof candidate.allowMutations === "boolean") &&
    (candidate.virtualKey === undefined ||
      typeof candidate.virtualKey === "string") &&
    (candidate.toolHints === undefined ||
      (candidate.toolHints !== null && typeof candidate.toolHints === "object"))
  );
}

function isRunSubagentOutput(value: unknown): value is RunSubagentOutput {
  const candidate = value as {
    childThreadId?: unknown;
    status?: unknown;
    summaryText?: unknown;
    virtualThreadId?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    (candidate.childThreadId === null ||
      candidate.childThreadId === undefined ||
      typeof candidate.childThreadId === "string") &&
    (candidate.status === "approval_required" ||
      candidate.status === "completed" ||
      candidate.status === "failed" ||
      candidate.status === "question_required") &&
    (candidate.summaryText === null ||
      candidate.summaryText === undefined ||
      typeof candidate.summaryText === "string") &&
    typeof candidate.virtualThreadId === "string"
  );
}

function truncatePrompt(prompt: string, max = 50) {
  const firstLine = prompt.split("\n")[0] ?? prompt;
  if (firstLine.length <= max) return firstLine;
  return `${firstLine.slice(0, max)}...`;
}

function buildSummary(
  input: RunSubagentInput,
  output: RunSubagentOutput | null,
  partState: RendererProps["part"]["state"],
): ReactNode {
  const tag = input.virtualKey ?? truncatePrompt(input.prompt);

  if (partState === "output-error" || output?.status === "failed") {
    return (
      <>
        Sub-agent failed <span className="font-mono text-[12px]">{tag}</span>
      </>
    );
  }

  if (output?.status === "approval_required") {
    return (
      <>
        Sub-agent needs approval{" "}
        <span className="font-mono text-[12px]">{tag}</span>
      </>
    );
  }

  if (output?.status === "question_required") {
    return (
      <>
        Sub-agent needs input{" "}
        <span className="font-mono text-[12px]">{tag}</span>
      </>
    );
  }

  if (output?.status === "completed") {
    return (
      <>
        Ran sub-agent <span className="font-mono text-[12px]">{tag}</span>
      </>
    );
  }

  if (
    partState === "approval-responded" ||
    partState === "input-streaming" ||
    partState === "input-available"
  ) {
    return (
      <>
        Running sub-agent <span className="font-mono text-[12px]">{tag}</span>
      </>
    );
  }

  return (
    <>
      Delegating to sub-agent{" "}
      <span className="font-mono text-[12px]">{tag}</span>
    </>
  );
}

export const RunSubagentTool = memo(function RunSubagentTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();
  const pathname = usePathname();
  const input =
    "input" in part && isRunSubagentInput(part.input) ? part.input : null;
  const output =
    "output" in part && isRunSubagentOutput(part.output) ? part.output : null;
  const isRunning =
    part.state === "approval-responded" ||
    part.state === "input-streaming" ||
    part.state === "input-available";
  const isError = part.state === "output-error" || output?.status === "failed";
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    autoExpand: Boolean(output?.status && output.status !== "completed"),
    defaultExpanded: Boolean(output?.status && output.status !== "completed"),
    toolCallId: part.toolCallId,
  });
  const parentThreadId = useMemo(() => {
    const match = pathname?.match(/\/thread\/([^/?#]+)/);
    return match?.[1] ?? null;
  }, [pathname]);
  const resolvedSubagentThreadQuery = api.threads.resolveSubagent.useQuery(
    parentThreadId && input
      ? {
          threadId: parentThreadId,
          ...(input.virtualKey
            ? { virtualKey: input.virtualKey }
            : part.toolCallId
              ? { delegationId: part.toolCallId }
              : {}),
        }
      : {
          threadId: "",
        },
    {
      enabled: Boolean(parentThreadId && input),
      refetchInterval: isRunning && !output ? 1_000 : false,
      staleTime: 500,
    },
  );
  const targetThreadId =
    output?.childThreadId ??
    output?.virtualThreadId ??
    resolvedSubagentThreadQuery.data?.threadId ??
    null;

  const handleOpenThread = useCallback(() => {
    if (!targetThreadId) return;

    open(<SubagentThreadPanel threadId={targetThreadId} />, {
      size: "wide",
    });
  }, [open, targetThreadId]);

  if (!input) return null;

  const partErrorText = "errorText" in part ? part.errorText : undefined;

  const summary = (
    <>
      <Icon
        icon="solar:users-group-rounded-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {buildSummary(input, output, part.state)}
    </>
  );

  const statusLabel = output?.status.replace(/_/g, " ") ?? null;
  const statusColor =
    output?.status === "completed"
      ? "text-success"
      : output?.status === "failed"
        ? "text-danger"
        : "text-warning";

  const footer = output ? (
    <div className="flex items-center justify-between">
      <span className={`capitalize ${statusColor}`}>{statusLabel}</span>
      {targetThreadId ? (
        <button
          className="text-foreground/40 transition-colors hover:text-foreground/70"
          onClick={handleOpenThread}
          type="button"
        >
          View thread
        </button>
      ) : null}
    </div>
  ) : undefined;

  return (
    <ToolLayout
      actions={
        targetThreadId ? (
          <Button
            className="h-7 min-w-0 gap-1.5 px-2.5 text-[11px]"
            onPress={handleOpenThread}
            size="sm"
            variant="tertiary"
          >
            <Icon icon="solar:arrow-right-up-linear" className="h-3 w-3" />
            {isRunning ? "View live" : "Open thread"}
          </Button>
        ) : undefined
      }
      errorText={
        isError
          ? (partErrorText ?? output?.summaryText ?? undefined)
          : undefined
      }
      footer={footer}
      isError={isError}
      isExpandable={Boolean(input)}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      summary={summary}
    >
      <div className="space-y-2 text-[12px] text-foreground/70">
        <div className="text-foreground/75 [&_*]:!text-[12px] [&_*]:!leading-relaxed">
          <MarkdownContent text={input.prompt} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-foreground/55">
            {input.allowMutations === false ? "Read-only" : "Mutable"}
          </span>
          {input.virtualKey ? (
            <span className="inline-flex rounded-full bg-foreground/5 px-2 py-0.5 text-foreground/55">
              {input.virtualKey}
            </span>
          ) : null}
          {input.toolHints?.categories?.map((c) => (
            <span
              key={c}
              className="inline-flex rounded-full bg-foreground/5 px-2 py-0.5 text-foreground/55"
            >
              {c}
            </span>
          ))}
        </div>

        {output?.summaryText ? (
          <div className="border-t border-border/30 pt-2 text-foreground/75 [&_*]:!text-[12px] [&_*]:!leading-relaxed">
            <MarkdownContent text={output.summaryText} />
          </div>
        ) : null}
      </div>
    </ToolLayout>
  );
});
