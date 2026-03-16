"use client";

import { memo, useCallback } from "react";
import { Icon } from "@iconify/react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { resolveSearchProviderOptions } from "@/lib/search";
import type { RendererProps } from "../../renderer";
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

function isWebSearchOutput(value: unknown): value is WebSearchOutput {
  const candidate = value as {
    digest?: unknown;
    provider?: unknown;
    query?: unknown;
    resultCount?: unknown;
    results?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.digest === "string" &&
    typeof candidate.provider === "string" &&
    typeof candidate.query === "string" &&
    typeof candidate.resultCount === "number" &&
    Array.isArray(candidate.results)
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
  part,
}: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "approval-responded" ||
    part.state === "input-streaming" ||
    part.state === "input-available";
  const isDenied = part.state === "output-denied";
  const isError = part.state === "output-error" || isDenied;
  const hasOutput = part.state === "output-available";

  const input =
    "input" in part && isWebSearchInput(part.input) ? part.input : null;
  const output =
    hasOutput && "output" in part && isWebSearchOutput(part.output)
      ? part.output
      : null;
  const provider = resolveProvider(input, output);

  const canOpen = Boolean(output && output.results.length > 0);

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

  const label = (() => {
    if (isDenied) return "Search denied";
    if (isError) return "Search failed";
    if (isRunning) {
      return `Searching for \u201c${input.query}\u201d`;
    }
    if (output) {
      const count = output.resultCount;
      return `Searched ${count} source${count !== 1 ? "s" : ""} for \u201c${output.query}\u201d`;
    }
    return `Searching for \u201c${input.query}\u201d`;
  })();

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={handleOpenSidebar}
      className={`group flex w-full items-center gap-2 text-left text-[13px] ${
        isError
          ? "text-danger"
          : isRunning
            ? "sentinel-thinking-shimmer"
            : "text-foreground/70"
      } ${canOpen ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
    >
      <Icon
        icon="solar:magnifer-linear"
        className="h-4 w-4 shrink-0 text-foreground/50"
      />
      <span className="min-w-0 flex-1">{label}</span>
      {canOpen ? (
        <span className="shrink-0 text-[11px] text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
          View &rsaquo;
        </span>
      ) : null}
    </button>
  );
});
