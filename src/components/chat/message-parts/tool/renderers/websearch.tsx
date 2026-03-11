"use client";

import { memo, useCallback } from "react";
import { Button } from "@heroui/react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { resolveSearchProviderOptions } from "@/lib/search";
import type { RendererProps } from "../renderer";

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
  const needsApproval =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;

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

  if (!input) {
    return null;
  }

  if (needsApproval) {
    return (
      <div className="rounded-xl border border-border/60 bg-surface/20 px-3 py-2.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-foreground/70">
            Web search:
          </span>
          <span className="truncate text-muted">{input.query}</span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
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
            variant="tertiary"
          >
            Deny
          </Button>
        </div>
      </div>
    );
  }

  if (isRunning) {
    return (
      <div className="w-full overflow-hidden rounded-lg">
        <div className="flex w-full items-center justify-between gap-3 pr-1">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <p className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground/70">
              <span className="truncate sentinel-thinking-shimmer">
                Searching the web...
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="w-full overflow-hidden rounded-lg">
        <div className="flex w-full items-center gap-2 pr-1">
          <p className="text-xs font-medium text-danger/80">
            Search failed
          </p>
          {errorText ? (
            <span className="truncate text-[11px] text-danger/60">
              {errorText}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  if (part.state === "output-denied") {
    return (
      <div className="w-full overflow-hidden rounded-lg">
        <p className="text-xs font-medium text-muted">Search denied</p>
      </div>
    );
  }

  if (output) {
    const count = output.resultCount;
    const label =
      count > 0
        ? `Searched ${count} source${count !== 1 ? "s" : ""}`
        : "No search results";

    return (
      <div className="w-full overflow-hidden rounded-lg">
        <div className="flex w-full items-center justify-between gap-3 pr-1">
          <button
            className="group flex min-w-0 flex-1 items-center gap-2 text-left text-default-600 transition-colors hover:text-foreground dark:text-default-400"
            onClick={handleOpenSidebar}
            type="button"
          >
            <p className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground/70">
              <span className="truncate">{label}</span>
            </p>
          </button>
        </div>
      </div>
    );
  }

  return null;
});
