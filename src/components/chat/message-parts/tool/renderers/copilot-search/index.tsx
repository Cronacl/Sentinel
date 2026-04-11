"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { getToolName } from "../../../types";
import { ToolLayout } from "../shared/tool-layout";
import { renderCopilotApprovalActions } from "../copilot-approval-actions";
import {
  extractCopilotTextFromContent,
  getFileName,
  isCopilotToolErrorState,
  isCopilotToolRunningState,
  tryParseCopilotOutput,
  unwrapCopilotInput,
  useCopilotExpansionState,
} from "../copilot-helpers";
import {
  detectLanguageFromPath,
  languageToVSCodeIcon,
} from "@/lib/syntax/highlighter";

type CopilotGlobInput = {
  path?: string;
  pattern?: string;
};

type CopilotGrepInput = {
  glob?: string;
  path?: string;
  pattern?: string;
  query?: string;
};

type CopilotSearchInput = CopilotGlobInput | CopilotGrepInput;

type CopilotGlobOutput = {
  durationMs?: number;
  filenames: string[];
  numFiles: number;
  truncated?: boolean;
};

type CopilotGrepOutput = {
  content?: string;
  fileCounts?: Map<string, number>;
  filenames: string[];
  numFiles: number;
  numMatches?: number;
};

function isGlobOutput(value: unknown): value is CopilotGlobOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.filenames) && typeof v.numFiles === "number";
}

function isGrepOutput(value: unknown): value is CopilotGrepOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.numFiles === "number" && Array.isArray(v.filenames);
}

function parseGlobFromText(text: string | null): CopilotGlobOutput | null {
  if (!text) return null;

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const filenames = lines.filter(
    (l) =>
      (l.includes(".") || l.includes("/")) &&
      !l.startsWith("Found ") &&
      !l.startsWith("No "),
  );

  const foundMatch = text.match(/Found\s+(\d+)\s+files?/i);
  const reportedCount = foundMatch ? parseInt(foundMatch[1]!, 10) : 0;

  if (filenames.length === 0 && reportedCount === 0) return null;
  return {
    durationMs: 0,
    filenames,
    numFiles: reportedCount || filenames.length,
    truncated: false,
  };
}

function parseGrepFromText(text: string | null): CopilotGrepOutput | null {
  if (!text) return null;

  const lines = text.split("\n");
  const colonFileSet = new Set<string>();
  const bareFileSet = new Set<string>();
  const fileCounts = new Map<string, number>();
  let matchCount = 0;
  let isCountMode = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const candidate = trimmed.slice(0, colonIdx);
      if (candidate.includes(".") || candidate.includes("/")) {
        colonFileSet.add(candidate);

        const afterColon = trimmed.slice(colonIdx + 1).trim();
        const countVal = parseInt(afterColon, 10);
        if (!isNaN(countVal) && String(countVal) === afterColon) {
          matchCount += countVal;
          fileCounts.set(
            candidate,
            (fileCounts.get(candidate) ?? 0) + countVal,
          );
        } else {
          isCountMode = false;
          matchCount++;
        }
        continue;
      }
    }

    if (trimmed.includes("/") || trimmed.includes(".")) {
      const looksLikePath =
        /^[\w./@-]/.test(trimmed) &&
        !trimmed.startsWith("Found ") &&
        !trimmed.startsWith("No ") &&
        trimmed.length < 500 &&
        (trimmed.includes("/") || /\.\w{1,10}$/.test(trimmed));
      if (looksLikePath) {
        bareFileSet.add(trimmed);
      }
    }
  }

  const fileSet = colonFileSet.size > 0 ? colonFileSet : bareFileSet;

  const foundMatch = text.match(/Found\s+(\d+)\s+files?/i);
  const reportedCount = foundMatch ? parseInt(foundMatch[1]!, 10) : 0;

  return {
    content: text,
    fileCounts: isCountMode && fileCounts.size > 0 ? fileCounts : undefined,
    filenames: [...fileSet],
    numFiles: reportedCount || fileSet.size,
    numMatches: matchCount > 0 ? matchCount : undefined,
  };
}

function FileList({
  counts,
  filenames,
}: {
  counts?: Map<string, number>;
  filenames: string[];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {filenames.map((file, idx) => {
        const lang = detectLanguageFromPath(file);
        const icon = languageToVSCodeIcon[lang] ?? "vscode-icons:default-file";
        const name = getFileName(file);
        const dir = file.includes("/")
          ? file.slice(0, file.length - name.length)
          : "";
        const count = counts?.get(file);

        return (
          <div
            key={`${file}-${idx}`}
            className="flex items-center gap-2 rounded px-1 py-0.5"
          >
            <Icon
              className="h-3.5 w-3.5 shrink-0 text-foreground/50"
              icon={icon}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
              {dir ? <span className="text-foreground/30">{dir}</span> : null}
              <span className="text-foreground/60">{name}</span>
            </span>
            {count != null && (
              <span className="shrink-0 font-mono text-[10px] text-foreground/30">
                {count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GlobSummary(
  part: RendererProps["part"],
  input: CopilotSearchInput,
  output: CopilotGlobOutput | null,
): ReactNode {
  const pattern = input.pattern ?? input.path ?? null;
  const patternLabel = pattern ? (
    <span className="font-mono text-[12px]">{pattern}</span>
  ) : null;

  if (part.state === "output-denied") {
    return <>Glob search denied {patternLabel}</>;
  }

  if (part.state === "output-error") {
    return <>Glob search failed {patternLabel}</>;
  }

  if (output) {
    return (
      <>
        Found{" "}
        <span className="font-mono text-[12px]">
          {output.numFiles} file{output.numFiles !== 1 ? "s" : ""}
        </span>{" "}
        matching {patternLabel}
        {output.truncated && (
          <span className="ml-1 text-[11px] text-warning">(truncated)</span>
        )}
      </>
    );
  }

  if (part.state === "output-available") {
    return <>Found results matching {patternLabel}</>;
  }

  if (part.state === "approval-requested") {
    return <>Search for {patternLabel}</>;
  }

  return <>Searching for {patternLabel}</>;
}

function GrepSummary(
  part: RendererProps["part"],
  input: CopilotSearchInput,
  output: CopilotGrepOutput | null,
): ReactNode {
  const pattern = input.pattern ?? (input as CopilotGrepInput).query ?? null;
  const patternLabel = pattern ? (
    <span className="font-mono text-[12px]">{pattern}</span>
  ) : null;

  if (part.state === "output-denied") {
    return <>Search denied {patternLabel}</>;
  }

  if (part.state === "output-error") {
    return <>Search failed {patternLabel}</>;
  }

  if (output) {
    const matchInfo =
      output.numMatches != null
        ? `${output.numMatches} match${output.numMatches !== 1 ? "es" : ""}`
        : `${output.numFiles} file${output.numFiles !== 1 ? "s" : ""}`;
    return (
      <>
        Found <span className="font-mono text-[12px]">{matchInfo}</span> for{" "}
        {patternLabel}
      </>
    );
  }

  if (part.state === "output-available") {
    return <>Found results for {patternLabel}</>;
  }

  if (part.state === "approval-requested") {
    return <>Search for {patternLabel}</>;
  }

  return <>Searching for {patternLabel}</>;
}

export const CopilotGlobTool = memo(function CopilotGlobTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const input = unwrapCopilotInput<CopilotSearchInput>(
    hasInput ? part.input : undefined,
  );
  const globOutputDirect = hasOutput
    ? tryParseCopilotOutput(part.output, isGlobOutput)
    : null;
  const fallbackOutputText =
    hasOutput && !globOutputDirect
      ? extractCopilotTextFromContent(part.output)
      : null;
  const globOutput = globOutputDirect ?? parseGlobFromText(fallbackOutputText);

  const isRunning = isCopilotToolRunningState(part.state);
  const isError = isCopilotToolErrorState(part.state);
  const [isExpanded, setIsExpanded] = useCopilotExpansionState(
    part,
    part.state === "approval-requested",
  );
  const actions = renderCopilotApprovalActions({ onApprove, onDeny, part });

  const hasFiles = globOutput && globOutput.filenames.length > 0;

  return (
    <ToolLayout
      actions={actions}
      isError={isError}
      isExpandable={
        Boolean(hasFiles) || Boolean(!hasFiles && fallbackOutputText?.trim())
      }
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      footer={
        input?.path ? (
          <span className="truncate font-mono text-[10px]" title={input.path}>
            in {input.path}
          </span>
        ) : null
      }
      summary={
        <>
          <Icon
            className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            icon="solar:folder-search-linear"
          />
          {GlobSummary(part, input ?? {}, globOutput)}
        </>
      }
    >
      {hasFiles && (
        <ScrollShadow className="max-h-[250px]" orientation="vertical">
          <FileList filenames={globOutput.filenames} />
        </ScrollShadow>
      )}
      {!hasFiles && fallbackOutputText?.trim() && (
        <ScrollShadow className="max-h-[300px] overflow-x-auto">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
            {fallbackOutputText}
          </pre>
        </ScrollShadow>
      )}
    </ToolLayout>
  );
});

export const CopilotGrepTool = memo(function CopilotGrepTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const input = unwrapCopilotInput<CopilotSearchInput>(
    hasInput ? part.input : undefined,
  );
  const grepOutputDirect = hasOutput
    ? tryParseCopilotOutput(part.output, isGrepOutput)
    : null;
  const fallbackOutputText =
    hasOutput && !grepOutputDirect
      ? extractCopilotTextFromContent(part.output)
      : null;
  const grepOutput = grepOutputDirect ?? parseGrepFromText(fallbackOutputText);

  const isRunning = isCopilotToolRunningState(part.state);
  const isError = isCopilotToolErrorState(part.state);
  const [isExpanded, setIsExpanded] = useCopilotExpansionState(
    part,
    part.state === "approval-requested",
  );
  const actions = renderCopilotApprovalActions({ onApprove, onDeny, part });

  const hasContent = grepOutput?.content?.trim() ?? fallbackOutputText?.trim();
  const hasFiles = grepOutput && grepOutput.filenames.length > 0;

  return (
    <ToolLayout
      actions={actions}
      isError={isError}
      isExpandable={Boolean(hasContent) || Boolean(hasFiles)}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      footer={
        input?.path ? (
          <span className="truncate font-mono text-[10px]" title={input.path}>
            in {input.path}
          </span>
        ) : null
      }
      summary={
        <>
          <Icon
            className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            icon="solar:magnifer-linear"
          />
          {GrepSummary(part, input ?? {}, grepOutput)}
        </>
      }
    >
      {hasFiles && grepOutput.fileCounts ? (
        <ScrollShadow className="max-h-[250px]" orientation="vertical">
          <FileList
            counts={grepOutput.fileCounts}
            filenames={grepOutput.filenames}
          />
        </ScrollShadow>
      ) : hasContent ? (
        <ScrollShadow className="max-h-[300px] overflow-x-auto">
          <pre className="whitespace-pre font-mono text-[11px] leading-[18px] text-foreground/70">
            {grepOutput?.content ?? fallbackOutputText}
          </pre>
        </ScrollShadow>
      ) : hasFiles ? (
        <ScrollShadow className="max-h-[250px]" orientation="vertical">
          <FileList filenames={grepOutput.filenames} />
        </ScrollShadow>
      ) : null}
    </ToolLayout>
  );
});
