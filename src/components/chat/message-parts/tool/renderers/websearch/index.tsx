"use client";

import { memo, useCallback, useState } from "react";
import { Button } from "@heroui/react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { resolveSearchProviderOptions } from "@/lib/search";
import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";

import { WebSearchSidebar } from "./websearch-sidebar";

type WebSearchInput = {
  livecrawl?: "always" | "never" | "preferred";
  provider?: string;
  query: string;
  resultCount?: number;
  searchType?: "auto" | "deep" | "fast";
};

type WebSearchResult = {
  author: string | null;
  publishedDate: string | null;
  score: number | null;
  summary: string | null;
  title: string | null;
  url: string;
};

type WebSearchOutput = {
  digest: string;
  livecrawl: "always" | "never" | "preferred";
  provider: string;
  query: string;
  requestedResultCount: number;
  resolvedSearchType: "auto" | "deep" | "fast";
  resultCount: number;
  results: WebSearchResult[];
  searchType: "auto" | "deep" | "fast";
};

function isWebSearchInput(value: unknown): value is WebSearchInput {
  const candidate = value as {
    livecrawl?: unknown;
    provider?: unknown;
    query?: unknown;
    resultCount?: unknown;
    searchType?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.query === "string" &&
    (candidate.provider === undefined ||
      typeof candidate.provider === "string") &&
    (candidate.resultCount === undefined ||
      typeof candidate.resultCount === "number") &&
    (candidate.searchType === undefined ||
      candidate.searchType === "auto" ||
      candidate.searchType === "fast" ||
      candidate.searchType === "deep") &&
    (candidate.livecrawl === undefined ||
      candidate.livecrawl === "never" ||
      candidate.livecrawl === "preferred" ||
      candidate.livecrawl === "always")
  );
}

function isWebSearchResult(value: unknown): value is WebSearchResult {
  const candidate = value as {
    author?: unknown;
    publishedDate?: unknown;
    score?: unknown;
    summary?: unknown;
    title?: unknown;
    url?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.url === "string" &&
    (candidate.title === null || typeof candidate.title === "string") &&
    (candidate.summary === null || typeof candidate.summary === "string") &&
    (candidate.author === null || typeof candidate.author === "string") &&
    (candidate.publishedDate === null ||
      typeof candidate.publishedDate === "string") &&
    (candidate.score === null || typeof candidate.score === "number")
  );
}

function isWebSearchOutput(value: unknown): value is WebSearchOutput {
  const candidate = value as {
    digest?: unknown;
    livecrawl?: unknown;
    provider?: unknown;
    query?: unknown;
    requestedResultCount?: unknown;
    resolvedSearchType?: unknown;
    resultCount?: unknown;
    results?: unknown;
    searchType?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.digest === "string" &&
    typeof candidate.provider === "string" &&
    typeof candidate.query === "string" &&
    typeof candidate.requestedResultCount === "number" &&
    typeof candidate.resultCount === "number" &&
    Array.isArray(candidate.results) &&
    candidate.results.every(isWebSearchResult)
  );
}

function resolveProvider(
  input: WebSearchInput | null,
  output: WebSearchOutput | null,
) {
  const id = output?.provider ?? input?.provider ?? "exa";
  const options = resolveSearchProviderOptions({
    defaultLivecrawl: "preferred",
    defaultSearchType: "auto",
    provider: id === "searxng" ? "searxng" : "exa",
    requestedLivecrawl: input?.livecrawl,
    requestedSearchType: input?.searchType,
  });
  return { id, ...options };
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const WebSearchTool = memo(function WebSearchTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const { open } = useRightSidebar();
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const input =
    "input" in part && isWebSearchInput(part.input) ? part.input : null;
  const output =
    "output" in part && isWebSearchOutput(part.output) ? part.output : null;
  const errorText = "errorText" in part ? part.errorText : undefined;
  const provider = resolveProvider(input, output);

  const isRunning =
    part.state === "approval-responded" ||
    part.state === "input-streaming" ||
    part.state === "input-available";
  const isDenied = part.state === "output-denied";
  const isError = part.state === "output-error";
  const isFinished = part.state === "output-available";
  const needsApproval =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;

  const [isExpanded, setIsExpanded] = useState(false);

  const handleOpenSidebar = useCallback(() => {
    if (!output || output.results.length === 0) return;
    open(
      <WebSearchSidebar
        provider={provider.id}
        query={output.query}
        results={output.results}
      />,
    );
  }, [open, output, provider.id]);

  if (!input) return null;

  const summary = (() => {
    if (isDenied) return "Search denied";
    if (isError) return "Search failed";
    if (isRunning) return <>Searching for &ldquo;{input.query}&rdquo;</>;
    if (needsApproval) return <>Search web for &ldquo;{input.query}&rdquo;</>;
    if (output) {
      const count = output.resultCount;
      return (
        <>
          Searched {count} source{count !== 1 ? "s" : ""}
          <span className="ml-1.5 text-[11px] text-foreground/40">
            for &ldquo;{output.query}&rdquo;
          </span>
        </>
      );
    }
    return <>Searching for &ldquo;{input.query}&rdquo;</>;
  })();

  const resultsList =
    output && output.results.length > 0 ? (
      <div className="space-y-1">
        {output.results.map((result, i) => (
          <a
            key={i}
            className="flex items-baseline gap-2 rounded px-1 py-0.5 transition-colors hover:bg-foreground/5"
            href={result.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="shrink-0 text-[10px] text-foreground/25">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/70">
              {result.title ?? getDomain(result.url)}
            </span>
            <span className="shrink-0 truncate text-[10px] text-foreground/30">
              {getDomain(result.url)}
            </span>
          </a>
        ))}
      </div>
    ) : null;

  const footer = output ? (
    <div className="flex items-center justify-between">
      <span>{output.resultCount} results via {provider.id}</span>
      {output.results.length > 0 ? (
        <button
          className="text-foreground/70 transition-colors hover:text-foreground"
          onClick={handleOpenSidebar}
          type="button"
        >
          Open in sidebar
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <ToolLayout
      summary={summary}
      isRunning={isRunning}
      isError={isError || isDenied}
      isExpandable={isFinished && !!resultsList}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={isError ? errorText : undefined}
      actions={
        needsApproval ? (
          <div className="flex items-center gap-2">
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => onApprove?.(approvalId)}
              size="sm"
            >
              Allow
            </Button>
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => onDeny?.(approvalId)}
              size="sm"
              variant="ghost"
            >
              Deny
            </Button>
          </div>
        ) : undefined
      }
      footer={footer}
    >
      {resultsList}
    </ToolLayout>
  );
});
