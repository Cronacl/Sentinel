"use client";

import { memo, useCallback, useState } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useRightSidebar } from "@/components/shell/shell-context";

type WebSearchResult = {
  author: string | null;
  publishedDate: string | null;
  score: number | null;
  summary: string | null;
  title: string | null;
  url: string;
};

function getHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function getFaviconUrl(url: string) {
  const hostname = getHostname(url);
  return `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
}

function truncate(value: string, length = 200) {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, length).trimEnd()}...`;
}

function formatDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

function FaviconImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-foreground/8 text-[8px] font-bold text-foreground/40">
        {getHostname(url).charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      alt=""
      className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
      src={getFaviconUrl(url)}
    />
  );
}

const ResultCard = memo(function ResultCard({
  result,
}: {
  result: WebSearchResult;
}) {
  const hostname = getHostname(result.url);

  return (
    <a
      className="group block rounded-3xl border border-border/60 bg-background/50 px-3.5 py-3 hover:bg-background/20 transition-all duration-200"
      href={result.url}
      rel="noreferrer"
      target="_blank"
    >
      <div className="flex items-start gap-3">
        <FaviconImage url={result.url} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-[13px] font-medium text-primary">
            {result.title ?? hostname}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
            <span className="truncate">{hostname}</span>
            {result.publishedDate ? (
              <>
                <span className="text-border">·</span>
                <span className="shrink-0">
                  {formatDate(result.publishedDate)}
                </span>
              </>
            ) : null}
          </div>
          {result.summary ? (
            <p className="mt-1.5 line-clamp-2 text-[12px] text-foreground/70">
              {truncate(result.summary, 240)}
            </p>
          ) : null}
        </div>
      </div>
    </a>
  );
});

export const WebSearchSidebar = memo(function WebSearchSidebar({
  provider,
  query,
  results,
}: {
  provider: string;
  query: string;
  results: WebSearchResult[];
}) {
  const { close } = useRightSidebar();

  const handleClose = useCallback(() => {
    close();
  }, [close]);

  return (
    <div className="flex h-full w-full flex-col bg-transparent px-7 pb-6 pt-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[22px] font-medium text-foreground/78">
            Sources
          </h2>
          <p className="mt-1.5 text-[13px] text-muted/90">
            {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;
            {query}&rdquo;
          </p>
          <p className="mt-0.5 text-[11px] text-muted/60">via {provider}</p>
        </div>
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted/80 transition-colors hover:text-foreground/80"
          onClick={handleClose}
          type="button"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={Cancel01Icon}
            size={16}
            strokeWidth={1.5}
          />
        </button>
      </div>

      <div className="sentinel-scroll-shell min-h-0 flex-1">
        <div className="sentinel-scroll-area flex h-full flex-col">
          {results.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-default-400">
              No results found
            </div>
          ) : (
            <div className="flex flex-col gap-2 pb-6">
              {results.map((result, index) => (
                <ResultCard key={`${result.url}-${index}`} result={result} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
