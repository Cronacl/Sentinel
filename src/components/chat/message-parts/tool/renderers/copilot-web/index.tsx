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
  formatDuration,
  isCopilotToolErrorState,
  isCopilotToolRunningState,
  tryParseCopilotOutput,
  unwrapCopilotInput,
  useCopilotExpansionState,
} from "../copilot-helpers";

type CopilotWebSearchInput = {
  allowed_domains?: string[];
  blocked_domains?: string[];
  query?: string;
};

type CopilotWebFetchInput = {
  prompt?: string;
  url?: string;
};

type CopilotWebInput = CopilotWebSearchInput & CopilotWebFetchInput;

type WebSearchResultItem = {
  content?: Array<{ title: string; url: string }>;
};

type CopilotWebSearchOutput = {
  durationSeconds?: number;
  query?: string;
  results: Array<WebSearchResultItem | string>;
};

type CopilotWebFetchOutput = {
  bytes?: number;
  code?: number;
  codeText?: string;
  durationMs?: number;
  result?: string;
  url?: string;
};

function isWebSearchOutput(value: unknown): value is CopilotWebSearchOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.results);
}

function isWebFetchOutput(value: unknown): value is CopilotWebFetchOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.url === "string" &&
    (typeof v.code === "number" || typeof v.result === "string")
  );
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

function isSearchTool(toolName: string) {
  return toolName === "copilot_web_search" || toolName.includes("search");
}

function WebSearchSummary(
  part: RendererProps["part"],
  input: CopilotWebInput | null,
  output: CopilotWebSearchOutput | null,
): ReactNode {
  if (part.state === "output-denied") return "Search denied";
  if (part.state === "output-error") return "Search failed";

  const query = input?.query ?? output?.query ?? null;
  const queryLabel = query ? `\u201c${query}\u201d` : "the web";

  if (output) {
    const links = extractSearchLinks(output.results);
    const sourceCount = links.length || output.results.length;
    return (
      <>
        Searched{" "}
        <span className="text-[12px]">
          {sourceCount} source{sourceCount === 1 ? "" : "s"}
        </span>{" "}
        for {queryLabel}
        {output.durationSeconds != null && (
          <span className="ml-1.5 text-[11px] text-foreground/40">
            {formatDuration(output.durationSeconds * 1000)}
          </span>
        )}
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

function WebFetchSummary(
  part: RendererProps["part"],
  input: CopilotWebInput | null,
  output: CopilotWebFetchOutput | null,
): ReactNode {
  const url = input?.url ?? output?.url;
  const hostname = url ? getHostname(url) : null;

  if (part.state === "output-denied") {
    return hostname ? <>Fetch denied {hostname}</> : <>Web fetch denied</>;
  }

  if (part.state === "output-error") {
    return hostname ? <>Failed to fetch {hostname}</> : <>Web fetch failed</>;
  }

  if (output) {
    const isSuccess =
      output.code == null || (output.code >= 200 && output.code < 400);
    return (
      <>
        Fetched{" "}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/30 hover:decoration-primary"
          >
            {hostname}
          </a>
        ) : (
          "web content"
        )}
        {output.codeText && (
          <span className="ml-1.5 text-[11px] text-foreground/40">
            {output.codeText}
            {output.durationMs != null
              ? ` · ${formatDuration(output.durationMs)}`
              : ""}
          </span>
        )}
        {!isSuccess && output.code != null && (
          <span className="ml-1 text-[11px] text-warning">{output.code}</span>
        )}
      </>
    );
  }

  if (part.state === "output-available") {
    return hostname ? <>Fetched {hostname}</> : <>Fetched web content</>;
  }

  if (part.state === "approval-requested") {
    return hostname ? <>Fetch {hostname}</> : <>Fetch web content</>;
  }

  return hostname ? <>Fetching {hostname}</> : <>Fetching web content</>;
}

export const CopilotWebFetchTool = memo(function CopilotWebFetchTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const input = unwrapCopilotInput<CopilotWebInput>(
    hasInput ? part.input : undefined,
  );
  const toolName = getToolName(part);
  const isSearch = isSearchTool(toolName);

  const searchOutput =
    hasOutput && isSearch
      ? tryParseCopilotOutput(part.output, isWebSearchOutput)
      : null;
  const fetchOutput =
    hasOutput && !isSearch
      ? tryParseCopilotOutput(part.output, isWebFetchOutput)
      : null;
  const fallbackOutputText =
    hasOutput && !searchOutput && !fetchOutput
      ? extractCopilotTextFromContent(part.output)
      : null;

  const isRunning = isCopilotToolRunningState(part.state);
  const isError = isCopilotToolErrorState(part.state);
  const [isExpanded, setIsExpanded] = useCopilotExpansionState(
    part,
    part.state === "approval-requested",
  );
  const actions = renderCopilotApprovalActions({ onApprove, onDeny, part });

  if (isSearch || searchOutput) {
    const links = searchOutput
      ? extractSearchLinks(searchOutput.results)
      : parseLinksFromText(fallbackOutputText);

    return (
      <ToolLayout
        actions={actions}
        isError={isError}
        isExpandable={
          links.length > 0 ||
          Boolean(fallbackOutputText?.trim() && links.length === 0)
        }
        isExpanded={isExpanded}
        isRunning={isRunning}
        onExpandedChange={setIsExpanded}
        summary={
          <>
            <Icon
              className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
              icon="solar:magnifer-linear"
            />
            {WebSearchSummary(part, input, searchOutput)}
          </>
        }
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
  }

  const hasResult = fetchOutput?.result?.trim() ?? fallbackOutputText?.trim();

  return (
    <ToolLayout
      actions={actions}
      isError={isError}
      isExpandable={Boolean(hasResult)}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      footer={
        fetchOutput ? (
          <div className="flex items-center justify-between">
            <span className="truncate text-[10px]" title={input?.url}>
              {input?.url ?? fetchOutput.url ?? ""}
            </span>
            {fetchOutput.bytes != null && (
              <span>{Math.round(fetchOutput.bytes / 1024)} KB</span>
            )}
          </div>
        ) : null
      }
      summary={
        <>
          <Icon
            className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            icon="solar:global-linear"
          />
          {WebFetchSummary(part, input, fetchOutput)}
        </>
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
