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
  formatDuration,
  isClaudeToolErrorState,
  isClaudeToolRunningState,
  tryParseClaudeOutput,
  useClaudeExpansionState,
  unwrapClaudeInput,
} from "../claude-helpers";

type ClaudeWebSearchInput = {
  allowed_domains?: string[];
  blocked_domains?: string[];
  query: string;
};

type WebSearchResultItem = {
  content?: Array<{ title: string; url: string }>;
  tool_use_id?: string;
};

type ClaudeWebSearchOutput = {
  durationSeconds: number;
  query: string;
  results: Array<WebSearchResultItem | string>;
};

type ClaudeWebFetchInput = {
  prompt: string;
  url: string;
};

type ClaudeWebFetchOutput = {
  bytes: number;
  code: number;
  codeText: string;
  durationMs: number;
  result: string;
  url: string;
};

function isWebSearchInput(value: unknown): value is ClaudeWebSearchInput {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).query === "string";
}

function isWebSearchOutput(value: unknown): value is ClaudeWebSearchOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.query === "string" && Array.isArray(v.results);
}

function isWebFetchInput(value: unknown): value is ClaudeWebFetchInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.url === "string";
}

function isWebFetchOutput(value: unknown): value is ClaudeWebFetchOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.url === "string" && typeof v.code === "number";
}

function extractSearchLinks(
  results: Array<WebSearchResultItem | string>,
): Array<{ title: string; url: string }> {
  const links: Array<{ title: string; url: string }> = [];
  for (const r of results) {
    if (typeof r === "string") continue;
    if (Array.isArray(r.content)) {
      for (const item of r.content) {
        if (item.title && item.url) {
          links.push({ title: item.title, url: item.url });
        }
      }
    }
  }
  return links;
}

function isLinkItem(v: unknown): v is { title: string; url: string } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.title === "string" && typeof o.url === "string";
}

function parseLinksFromText(
  text: string | null,
): Array<{ title: string; url: string }> {
  if (!text) return [];

  // Try extracting a JSON array after "Links:" or "Results:"
  const jsonMatch = /(?:Links|Results|Sources)\s*:\s*(\[[\s\S]*\])/i.exec(text);
  if (jsonMatch?.[1]) {
    try {
      const parsed: unknown = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        return parsed.filter(isLinkItem);
      }
    } catch {
      /* not valid JSON */
    }
  }

  // Try parsing the entire text as a JSON array of links
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(isLinkItem);
      }
    } catch {
      /* not valid JSON */
    }
  }

  // Extract URLs with surrounding context as title fallback
  const urlRegex = /https?:\/\/[^\s"',)\]]+/g;
  const links: Array<{ title: string; url: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    try {
      const hostname = new URL(url).hostname;
      links.push({ title: hostname, url });
    } catch {
      links.push({ title: url, url });
    }
  }
  return links;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function WebSearchSummary(
  part: RendererProps["part"],
  input: ClaudeWebSearchInput,
  output: ClaudeWebSearchOutput | null,
): ReactNode {
  if (part.state === "output-denied") return "Search denied";
  if (part.state === "output-error") return "Search failed";

  const queryLabel = `\u201c${input.query}\u201d`;
  if (output) {
    const sourceCount = extractSearchLinks(output.results).length;
    return (
      <>
        Searched{" "}
        <span className="text-[12px]">
          {sourceCount || output.results.length} source
          {sourceCount === 1 || output.results.length === 1 ? "" : "s"}
        </span>{" "}
        for {queryLabel}
        <span className="ml-1.5 text-[11px] text-foreground/40">
          {formatDuration(output.durationSeconds * 1000)}
        </span>
      </>
    );
  }

  if (part.state === "output-available") {
    return <>Searched for {queryLabel}</>;
  }

  const isRunning =
    part.state === "input-available" ||
    part.state === "input-streaming" ||
    part.state === "approval-responded";
  return isRunning ? `Searching for ${queryLabel}` : `Search for ${queryLabel}`;
}

export const ClaudeWebSearchTool = memo(function ClaudeWebSearchTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const unwrapped = unwrapClaudeInput<ClaudeWebSearchInput>(
    hasInput ? part.input : undefined,
  );
  const searchInput =
    unwrapped && isWebSearchInput(unwrapped) ? unwrapped : null;
  const searchOutput = hasOutput
    ? tryParseClaudeOutput(part.output, isWebSearchOutput)
    : null;
  const fallbackOutputText =
    hasOutput && !searchOutput ? extractTextFromContent(part.output) : null;

  const isRunning = isClaudeToolRunningState(part.state);
  const isError = isClaudeToolErrorState(part.state);

  if (!searchInput) return null;

  const links = searchOutput
    ? extractSearchLinks(searchOutput.results)
    : parseLinksFromText(fallbackOutputText);
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
      {WebSearchSummary(part, searchInput, searchOutput)}
    </>
  );
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });

  return (
    <ToolLayout
      actions={actions}
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={
        links.length > 0 ||
        Boolean(fallbackOutputText?.trim() && links.length === 0)
      }
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {links.length > 0 && (
        <div className="flex flex-col gap-1">
          {links.slice(0, 10).map((link, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px]">
              <Icon
                icon="solar:link-minimalistic-2-linear"
                className="mt-0.5 h-3 w-3 shrink-0 text-foreground/30"
              />
              <div className="min-w-0 flex-1">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline decoration-primary/30 hover:decoration-primary"
                >
                  {link.title}
                </a>
                <p className="text-[10px] text-foreground/40">
                  {getHostname(link.url)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {links.length === 0 && fallbackOutputText?.trim() && (
        <ScrollShadow className="max-h-[300px] overflow-x-auto">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
            {fallbackOutputText}
          </pre>
        </ScrollShadow>
      )}
    </ToolLayout>
  );
});

function WebFetchSummary(
  part: RendererProps["part"],
  input: ClaudeWebFetchInput,
  output: ClaudeWebFetchOutput | null,
): ReactNode {
  const hostname = getHostname(input.url);

  if (part.state === "output-denied") {
    return <>Fetch denied {hostname}</>;
  }

  if (part.state === "output-error") {
    return <>Failed to fetch {hostname}</>;
  }

  if (output) {
    const isSuccess = output.code >= 200 && output.code < 400;
    return (
      <>
        Fetched{" "}
        <a
          href={input.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline decoration-primary/30 hover:decoration-primary"
        >
          {hostname}
        </a>
        <span className="ml-1.5 text-[11px] text-foreground/40">
          {output.codeText} · {formatDuration(output.durationMs)}
        </span>
        {!isSuccess && (
          <span className="ml-1 text-[11px] text-warning">{output.code}</span>
        )}
      </>
    );
  }

  if (part.state === "output-available") {
    return <>Fetched {hostname}</>;
  }

  if (part.state === "approval-requested") {
    return <>Fetch {hostname}</>;
  }

  return <>Fetching {hostname}</>;
}

export const ClaudeWebFetchTool = memo(function ClaudeWebFetchTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const unwrapped = unwrapClaudeInput<ClaudeWebFetchInput>(
    hasInput ? part.input : undefined,
  );
  const fetchInput = unwrapped && isWebFetchInput(unwrapped) ? unwrapped : null;
  const fetchOutput = hasOutput
    ? tryParseClaudeOutput(part.output, isWebFetchOutput)
    : null;
  const fallbackOutputText =
    hasOutput && !fetchOutput ? extractTextFromContent(part.output) : null;

  const isRunning = isClaudeToolRunningState(part.state);
  const isError = isClaudeToolErrorState(part.state);

  if (!fetchInput) return null;

  const hasResult = fetchOutput?.result?.trim() ?? fallbackOutputText?.trim();
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested",
  );
  const summary = (
    <>
      <Icon
        icon="solar:global-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {WebFetchSummary(part, fetchInput, fetchOutput)}
    </>
  );
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });

  return (
    <ToolLayout
      actions={actions}
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={Boolean(hasResult)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        fetchOutput ? (
          <div className="flex items-center justify-between">
            <span className="truncate text-[10px]" title={fetchInput.url}>
              {fetchInput.url}
            </span>
            <span>{Math.round(fetchOutput.bytes / 1024)} KB</span>
          </div>
        ) : null
      }
    >
      {hasResult && (
        <ScrollShadow className="max-h-[300px] overflow-x-auto">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
            {(fetchOutput?.result ?? fallbackOutputText ?? "").slice(0, 5000)}
            {(fetchOutput?.result ?? fallbackOutputText ?? "").length > 5000 &&
              "\n…(truncated)"}
          </pre>
        </ScrollShadow>
      )}
    </ToolLayout>
  );
});
