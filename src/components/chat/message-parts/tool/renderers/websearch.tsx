"use client";

import { memo, useEffect, useState } from "react";
import { Button, Disclosure, ScrollShadow, Spinner } from "@heroui/react";

import { resolveSearchProviderOptions } from "@/lib/search";
import type { RendererProps } from "../renderer";

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

function getStatusChipClass(tone: "danger" | "muted" | "success") {
  switch (tone) {
    case "success":
      return "border-success/5 bg-success/10 text-success";
    case "danger":
      return "border-danger/20 bg-danger-soft text-danger-soft-foreground";
    default:
      return "border-border/60 bg-background/70 text-muted";
  }
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function truncate(value: string, length = 220) {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, length)}...`;
}

function getStatus(
  part: RendererProps["part"],
  output: WebSearchOutput | null,
) {
  if (part.state === "approval-responded") {
    return { label: "Running", tone: "muted" as const };
  }

  if (part.state === "approval-requested") {
    return { label: "Needs approval", tone: "muted" as const };
  }

  if (part.state === "output-denied") {
    return { label: "Denied", tone: "danger" as const };
  }

  if (part.state === "output-error") {
    return { label: "Failed", tone: "danger" as const };
  }

  if (part.state === "output-available" && output) {
    return output.resultCount > 0
      ? { label: "Success", tone: "success" as const }
      : { label: "No results", tone: "muted" as const };
  }

  return { label: "Running", tone: "muted" as const };
}

export const WebSearchTool = memo(function WebSearchTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const webSearchInput =
    "input" in part && isWebSearchInput(part.input) ? part.input : null;
  const webSearchOutput =
    "output" in part && isWebSearchOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;
  const isRunningState = part.state === "approval-responded";
  const isFinishedState =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    part.state === "output-available";
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested" || isRunningState,
  );

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested" || isRunningState);
  }, [isRunningState, part.state, part.toolCallId]);

  if (!webSearchInput) {
    return null;
  }

  const status = getStatus(part, webSearchOutput);
  const provider =
    webSearchOutput?.provider ?? webSearchInput.provider ?? "exa";
  const normalizedOptions = resolveSearchProviderOptions({
    defaultLivecrawl: "preferred",
    defaultSearchType: "auto",
    provider: provider === "searxng" ? "searxng" : "exa",
    requestedLivecrawl: webSearchInput.livecrawl,
    requestedSearchType: webSearchInput.searchType,
  });

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
      <div className="rounded-2xl border border-border/60 bg-surface/20 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-medium text-foreground">
                Web search
              </p>
              <div
                className={`rounded-full flex items-center gap-1 border px-1.5 py-0.5 text-[10px] ${getStatusChipClass(status.tone)}`}
              >
                {status.label === "Running" ? (
                  <Spinner className="h-3 w-3" size="sm" />
                ) : null}
                <span className="truncate">{status.label}</span>
              </div>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-foreground/72">
              {webSearchInput.query}
            </p>
            <p className="mt-1 text-[10px] text-muted">
              {provider} •{" "}
              {webSearchOutput?.resolvedSearchType ??
                normalizedOptions.searchType}{" "}
              •{" "}
              {webSearchOutput?.resultCount ??
                webSearchInput.resultCount ??
                "?"}{" "}
              results
            </p>
          </div>

          {isFinishedState ? (
            <Disclosure.Heading>
              <Button
                className="min-w-0 px-2 text-[11px]"
                size="sm"
                slot="trigger"
                variant="ghost"
              >
                {isExpanded ? "Hide" : "Show"}
              </Button>
            </Disclosure.Heading>
          ) : null}
        </div>

        {showApprovalActions ? (
          <div className="mt-3 flex items-center gap-2">
            <Button
              className="h-8 px-3 text-[11px]"
              onPress={() => onApprove?.(approvalId)}
              size="sm"
            >
              Allow
            </Button>
            <Button
              className="h-8 px-3 text-[11px]"
              onPress={() => onDeny?.(approvalId)}
              size="sm"
              variant="tertiary"
            >
              Deny
            </Button>
          </div>
        ) : null}

        <Disclosure.Content>
          <div className="mt-3 space-y-3">
            {part.state === "output-error" && partErrorText ? (
              <div className="rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
                {partErrorText}
              </div>
            ) : null}

            {part.state === "output-denied" ? (
              <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted">
                Execution denied.
              </div>
            ) : null}

            {webSearchOutput ? (
              <>
                <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted">
                  {webSearchOutput.digest}
                </div>

                <div className="space-y-2">
                  {webSearchOutput.results.map((result, index) => (
                    <div
                      className="rounded-xl border border-border/60 bg-background/70 px-3 py-3"
                      key={`${result.url}-${index}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {result.title ?? getHostname(result.url)}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-muted">
                            {getHostname(result.url)}
                          </p>
                        </div>
                        <a
                          className="text-[11px] text-primary transition-opacity hover:opacity-80"
                          href={result.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open
                        </a>
                      </div>

                      {result.summary ? (
                        <p className="mt-2 text-xs text-foreground/80">
                          {truncate(result.summary, 320)}
                        </p>
                      ) : null}

                      {result.author || result.publishedDate ? (
                        <p className="mt-2 text-[11px] text-muted">
                          {[result.author, result.publishedDate]
                            .filter(Boolean)
                            .join(" • ")}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : isRunningState ? (
              <ScrollShadow className="max-h-36 rounded-xl border border-border/60 bg-background/70 px-3 py-2 font-mono text-[11px] text-foreground/80">
                Searching the web...
              </ScrollShadow>
            ) : null}
          </div>
        </Disclosure.Content>
      </div>
    </Disclosure>
  );
});
