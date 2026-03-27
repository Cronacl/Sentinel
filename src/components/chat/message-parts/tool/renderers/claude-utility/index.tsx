"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { renderClaudeApprovalActions } from "../claude-approval-actions";
import {
  extractTextFromContent,
  isClaudeToolErrorState,
  isClaudeToolRunningState,
  useClaudeExpansionState,
  unwrapClaudeInput,
} from "../claude-helpers";

type ToolSearchInput = {
  max_results?: number;
  query: string;
};

type ToolReference = {
  tool_name: string;
  type: "tool_reference";
};

function isToolSearchInput(value: unknown): value is ToolSearchInput {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).query === "string";
}

function parseToolSearchOutput(output: unknown): ToolReference[] | null {
  if (Array.isArray(output)) {
    const refs = output.filter(
      (item): item is ToolReference =>
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).type === "tool_reference" &&
        typeof (item as Record<string, unknown>).tool_name === "string",
    );
    if (refs.length > 0) return refs;
  }

  if (output && typeof output === "object") {
    const v = output as Record<string, unknown>;
    if (Array.isArray(v.content)) return parseToolSearchOutput(v.content);
    if (Array.isArray(v.tools)) return parseToolSearchOutput(v.tools);
    if (Array.isArray(v.results)) return parseToolSearchOutput(v.results);
  }

  return null;
}

function ToolSearchSummary(
  part: RendererProps["part"],
  input: ToolSearchInput,
  refs: ToolReference[] | null,
): ReactNode {
  const q = <span className="font-mono text-[12px]">{input.query}</span>;

  if (part.state === "output-denied") return <>Tool lookup denied for {q}</>;
  if (part.state === "output-error") return <>Tool lookup failed for {q}</>;

  if (refs) {
    return (
      <>
        Found{" "}
        <span className="font-mono text-[12px]">
          {refs.length} tool{refs.length !== 1 ? "s" : ""}
        </span>{" "}
        for {q}
      </>
    );
  }

  if (part.state === "output-available") return <>Looked up tools for {q}</>;

  if (part.state === "approval-requested") return <>Look up tools for {q}</>;

  return <>Looking up tools for {q}</>;
}

export const ClaudeToolSearchTool = memo(function ClaudeToolSearchTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const unwrapped = unwrapClaudeInput<ToolSearchInput>(
    hasInput ? part.input : undefined,
  );
  const tsInput = unwrapped && isToolSearchInput(unwrapped) ? unwrapped : null;
  const refs = hasOutput ? parseToolSearchOutput(part.output) : null;
  const fallbackText =
    hasOutput && !refs ? extractTextFromContent(part.output) : null;

  const isRunning = isClaudeToolRunningState(part.state);
  const isError = isClaudeToolErrorState(part.state);

  if (!tsInput) return null;
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested",
  );

  return (
    <ToolLayout
      actions={actions}
      isError={isError}
      isExpandable={Boolean(refs?.length) || Boolean(fallbackText?.trim())}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      summary={
        <>
          <Icon
            className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            icon="solar:widget-5-linear"
          />
          {ToolSearchSummary(part, tsInput, refs)}
        </>
      }
    >
      {refs && refs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {refs.map((ref) => (
            <span
              key={ref.tool_name}
              className="inline-flex items-center rounded-md border border-border/50 bg-background/50 px-2 py-0.5 font-mono text-[11px] text-foreground/60"
            >
              {ref.tool_name}
            </span>
          ))}
        </div>
      )}
      {!refs && fallbackText?.trim() && (
        <ScrollShadow className="max-h-[200px] overflow-x-auto">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
            {fallbackText}
          </pre>
        </ScrollShadow>
      )}
    </ToolLayout>
  );
});

type ListDirInput = {
  path?: string;
};

type ListDirOutput = {
  content?: string;
  directories?: string[];
  files?: string[];
};

function isListDirInput(value: unknown): value is ListDirInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.path === "string" || Object.keys(v).length === 0;
}

function isListDirOutput(value: unknown): value is ListDirOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.files) ||
    Array.isArray(v.directories) ||
    typeof v.content === "string"
  );
}

function ListDirSummary(
  part: RendererProps["part"],
  input: ListDirInput,
  output: ListDirOutput | null,
): ReactNode {
  const dirLabel = input.path ? (
    <span className="font-mono text-[12px]">{input.path}</span>
  ) : (
    <span className="font-mono text-[12px]">.</span>
  );

  if (part.state === "output-denied") return <>List denied for {dirLabel}</>;
  if (part.state === "output-error") return <>Failed to list {dirLabel}</>;

  if (output) {
    const total =
      (output.files?.length ?? 0) + (output.directories?.length ?? 0);
    if (total > 0) {
      return (
        <>
          Listed{" "}
          <span className="font-mono text-[12px]">
            {total} item{total !== 1 ? "s" : ""}
          </span>{" "}
          in {dirLabel}
        </>
      );
    }
    return <>Listed {dirLabel}</>;
  }

  if (part.state === "output-available") return <>Listed {dirLabel}</>;
  if (part.state === "approval-requested") return <>List {dirLabel}</>;
  return <>Listing {dirLabel}</>;
}

export const ClaudeListDirTool = memo(function ClaudeListDirTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const unwrapped = unwrapClaudeInput<ListDirInput>(
    hasInput ? part.input : undefined,
  );
  const lsInput = unwrapped && isListDirInput(unwrapped) ? unwrapped : null;
  const lsOutput =
    hasOutput && isListDirOutput(part.output)
      ? (part.output as ListDirOutput)
      : null;
  const fallbackText =
    hasOutput && !lsOutput ? extractTextFromContent(part.output) : null;

  const isRunning = isClaudeToolRunningState(part.state);
  const isError = isClaudeToolErrorState(part.state);

  const contentText = lsOutput?.content ?? fallbackText;
  const hasEntries =
    (lsOutput?.files && lsOutput.files.length > 0) ||
    (lsOutput?.directories && lsOutput.directories.length > 0);
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested",
  );

  return (
    <ToolLayout
      actions={actions}
      isError={isError}
      isExpandable={Boolean(hasEntries) || Boolean(contentText?.trim())}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      summary={
        <>
          <Icon
            className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            icon="solar:folder-open-linear"
          />
          {ListDirSummary(part, lsInput ?? { path: undefined }, lsOutput)}
        </>
      }
    >
      {hasEntries && (
        <ScrollShadow className="max-h-[250px]" orientation="vertical">
          <div className="flex flex-col gap-0.5">
            {lsOutput?.directories?.map((dir, i) => (
              <div
                key={`d-${i}`}
                className="flex items-center gap-2 rounded px-1 py-0.5"
              >
                <Icon
                  className="h-3.5 w-3.5 shrink-0 text-foreground/50"
                  icon="vscode-icons:default-folder"
                />
                <span className="truncate font-mono text-[11px] text-foreground/60">
                  {dir}
                </span>
              </div>
            ))}
            {lsOutput?.files?.map((file, i) => (
              <div
                key={`f-${i}`}
                className="flex items-center gap-2 rounded px-1 py-0.5"
              >
                <Icon
                  className="h-3.5 w-3.5 shrink-0 text-foreground/50"
                  icon="vscode-icons:default-file"
                />
                <span className="truncate font-mono text-[11px] text-foreground/60">
                  {file}
                </span>
              </div>
            ))}
          </div>
        </ScrollShadow>
      )}
      {!hasEntries && contentText?.trim() && (
        <ScrollShadow className="max-h-[300px] overflow-x-auto">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
            {contentText}
          </pre>
        </ScrollShadow>
      )}
    </ToolLayout>
  );
});
