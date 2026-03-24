"use client";

import { memo, useCallback } from "react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { PubMedSearchSidebar, PubMedArticleSidebar } from "./pubmed-sidebar";

type PubMedArticle = {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  pubDate: string;
  doi: string | null;
  pmcId: string | null;
  url: string;
  keywords: string[];
};

type SearchOutput = {
  articles: PubMedArticle[];
  totalResults: number;
};

export const PubMedSearchTool = memo(function PubMedSearchTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as SearchOutput) : null;
  const input = "input" in part ? (part.input as { query?: string }) : null;

  const canOpen = Boolean(output && output.articles.length > 0);

  const handleOpenSidebar = useCallback(() => {
    if (!output || output.articles.length === 0) return;
    open(
      <PubMedSearchSidebar
        query={input?.query ?? ""}
        articles={output.articles}
        totalResults={output.totalResults}
      />,
    );
  }, [open, output, input?.query]);

  const label = (() => {
    if (isError) return "PubMed search failed";
    if (isRunning) {
      return input?.query
        ? `Searching PubMed for \u201c${input.query}\u201d`
        : "Searching PubMed\u2026";
    }
    if (output) {
      const count = output.articles.length;
      return `Found ${count} article${count !== 1 ? "s" : ""} for \u201c${input?.query ?? ""}\u201d`;
    }
    return "Searching PubMed\u2026";
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
      <IntegrationProviderIcon provider="pubmed" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{label}</span>
      {canOpen ? (
        <span className="shrink-0 text-[11px] text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
          View &rsaquo;
        </span>
      ) : null}
    </button>
  );
});

export const PubMedArticleTool = memo(function PubMedArticleTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as PubMedArticle) : null;
  const input = "input" in part ? (part.input as { pmid?: string }) : null;

  const canOpen = Boolean(output);

  const handleOpenSidebar = useCallback(() => {
    if (!output) return;
    open(<PubMedArticleSidebar article={output} />);
  }, [open, output]);

  const label = (() => {
    if (isError) return "Failed to get article";
    if (isRunning) {
      return input?.pmid
        ? `Fetching article PMID ${input.pmid}`
        : "Fetching article\u2026";
    }
    if (output) {
      const shortTitle =
        output.title.length > 60
          ? output.title.slice(0, 57) + "\u2026"
          : output.title;
      return shortTitle;
    }
    return "Fetching article\u2026";
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
      <IntegrationProviderIcon provider="pubmed" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {canOpen ? (
        <span className="shrink-0 text-[11px] text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
          View &rsaquo;
        </span>
      ) : null}
    </button>
  );
});
