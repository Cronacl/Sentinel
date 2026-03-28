"use client";

import type { ReactNode } from "react";
import { memo, useMemo } from "react";
import { ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { renderClaudeApprovalActions } from "../claude-approval-actions";
import {
  extractTextFromContent,
  formatDuration,
  getFileName,
  isClaudeToolErrorState,
  isClaudeToolRunningState,
  tryParseClaudeOutput,
  useClaudeExpansionState,
  unwrapClaudeInput,
} from "../claude-helpers";
import {
  detectLanguageFromPath,
  languageToVSCodeIcon,
} from "@/lib/syntax/highlighter";

type ClaudeGlobInput = {
  path?: string;
  pattern: string;
};

type ClaudeGlobOutput = {
  durationMs: number;
  filenames: string[];
  numFiles: number;
  truncated: boolean;
};

type ClaudeGrepInput = {
  "-A"?: number;
  "-B"?: number;
  "-C"?: number;
  "-i"?: boolean;
  glob?: string;
  head_limit?: number;
  multiline?: boolean;
  output_mode?: "content" | "count" | "files_with_matches";
  path?: string;
  pattern: string;
  type?: string;
};

type ClaudeGrepOutput = {
  content?: string;
  filenames: string[];
  mode?: string;
  numFiles: number;
  numLines?: number;
  numMatches?: number;
};

function isGlobInput(value: unknown): value is ClaudeGlobInput {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).pattern === "string";
}

function isGlobOutput(value: unknown): value is ClaudeGlobOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.filenames) && typeof v.numFiles === "number";
}

function isGrepInput(value: unknown): value is ClaudeGrepInput {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).pattern === "string";
}

function isGrepOutput(value: unknown): value is ClaudeGrepOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.numFiles === "number" && Array.isArray(v.filenames);
}

function parseGlobFromText(text: string | null): ClaudeGlobOutput | null {
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

function parseGrepFromText(text: string | null): ClaudeGrepOutput | null {
  if (!text) return null;

  const lines = text.split("\n");
  const colonFileSet = new Set<string>();
  const bareFileSet = new Set<string>();
  let matchCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const candidate = trimmed.slice(0, colonIdx);
      if (candidate.includes(".") || candidate.includes("/")) {
        colonFileSet.add(candidate);
        matchCount++;
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
    filenames: [...fileSet],
    numFiles: reportedCount || fileSet.size,
    numMatches: matchCount > 0 ? matchCount : undefined,
  };
}

function FileList({ filenames }: { filenames: string[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {filenames.map((file, idx) => {
        const lang = detectLanguageFromPath(file);
        const icon = languageToVSCodeIcon[lang] ?? "vscode-icons:default-file";
        const name = getFileName(file);
        const dir = file.includes("/")
          ? file.slice(0, file.length - name.length)
          : "";

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
          </div>
        );
      })}
    </div>
  );
}

function GlobSummary(
  part: RendererProps["part"],
  input: ClaudeGlobInput,
  output: ClaudeGlobOutput | null,
): ReactNode {
  const patternLabel = (
    <span className="font-mono text-[12px]">{input.pattern}</span>
  );

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
        <span className="ml-1.5 text-[11px] text-foreground/40">
          {formatDuration(output.durationMs)}
        </span>
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

export const ClaudeGlobTool = memo(function ClaudeGlobTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const unwrapped = unwrapClaudeInput<ClaudeGlobInput>(
    hasInput ? part.input : undefined,
  );
  const globInput = unwrapped && isGlobInput(unwrapped) ? unwrapped : null;
  const globOutputDirect = hasOutput
    ? tryParseClaudeOutput(part.output, isGlobOutput)
    : null;
  const fallbackOutputText =
    hasOutput && !globOutputDirect ? extractTextFromContent(part.output) : null;
  const globOutput = globOutputDirect ?? parseGlobFromText(fallbackOutputText);

  const isRunning = isClaudeToolRunningState(part.state);
  const isError = isClaudeToolErrorState(part.state);

  if (!globInput) return null;
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested",
  );

  const summary = (
    <>
      <Icon
        icon="solar:folder-search-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {GlobSummary(part, globInput, globOutput)}
    </>
  );
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });

  const hasFiles = globOutput && globOutput.filenames.length > 0;

  return (
    <ToolLayout
      actions={actions}
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={
        Boolean(hasFiles) || Boolean(!hasFiles && fallbackOutputText?.trim())
      }
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        globInput.path ? (
          <span
            className="truncate font-mono text-[10px]"
            title={globInput.path}
          >
            in {globInput.path}
          </span>
        ) : null
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

function GrepSummary(
  part: RendererProps["part"],
  input: ClaudeGrepInput,
  output: ClaudeGrepOutput | null,
): ReactNode {
  const patternLabel = (
    <span className="font-mono text-[12px]">{input.pattern}</span>
  );

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

export const ClaudeGrepTool = memo(function ClaudeGrepTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const unwrapped = unwrapClaudeInput<ClaudeGrepInput>(
    hasInput ? part.input : undefined,
  );
  const grepInput = unwrapped && isGrepInput(unwrapped) ? unwrapped : null;
  const grepOutputDirect = hasOutput
    ? tryParseClaudeOutput(part.output, isGrepOutput)
    : null;
  const fallbackOutputText =
    hasOutput && !grepOutputDirect ? extractTextFromContent(part.output) : null;
  const grepOutput = grepOutputDirect ?? parseGrepFromText(fallbackOutputText);

  const isRunning = isClaudeToolRunningState(part.state);
  const isError = isClaudeToolErrorState(part.state);

  if (!grepInput) return null;
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested",
  );

  const summary = (
    <>
      <Icon
        icon="solar:magnifer-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {GrepSummary(part, grepInput, grepOutput)}
    </>
  );
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });

  const hasContent = grepOutput?.content?.trim() ?? fallbackOutputText?.trim();
  const hasFiles =
    grepOutput &&
    grepOutput.filenames.length > 0 &&
    grepOutput.mode !== "content";

  return (
    <ToolLayout
      actions={actions}
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={Boolean(hasContent) || Boolean(hasFiles)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        grepInput.path ? (
          <span
            className="truncate font-mono text-[10px]"
            title={grepInput.path}
          >
            in {grepInput.path}
          </span>
        ) : null
      }
    >
      {hasContent && (
        <ScrollShadow className="max-h-[300px] overflow-x-auto">
          <pre className="whitespace-pre font-mono text-[11px] leading-[18px] text-foreground/70">
            {grepOutput?.content ?? fallbackOutputText}
          </pre>
        </ScrollShadow>
      )}
      {hasFiles && !hasContent && (
        <ScrollShadow className="max-h-[250px]" orientation="vertical">
          <FileList filenames={grepOutput.filenames} />
        </ScrollShadow>
      )}
    </ToolLayout>
  );
});
