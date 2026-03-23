"use client";

import { memo, useCallback } from "react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { ArxivSearchSidebar, ArxivPaperSidebar } from "./arxiv-sidebar";

type ArxivPaper = {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated: string;
  categories: string[];
  pdfUrl: string;
  absUrl: string;
  comment: string | null;
  journalRef: string | null;
  doi: string | null;
};

type SearchOutput = {
  papers: ArxivPaper[];
  totalResults: number;
};

export const ArxivSearchTool = memo(function ArxivSearchTool({
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

  const canOpen = Boolean(output && output.papers.length > 0);

  const handleOpenSidebar = useCallback(() => {
    if (!output || output.papers.length === 0) return;
    open(
      <ArxivSearchSidebar
        query={input?.query ?? ""}
        papers={output.papers}
        totalResults={output.totalResults}
      />,
    );
  }, [open, output, input?.query]);

  const label = (() => {
    if (isError) return "arXiv search failed";
    if (isRunning) {
      return input?.query
        ? `Searching arXiv for \u201c${input.query}\u201d`
        : "Searching arXiv\u2026";
    }
    if (output) {
      const count = output.papers.length;
      return `Found ${count} paper${count !== 1 ? "s" : ""} for \u201c${input?.query ?? ""}\u201d`;
    }
    return "Searching arXiv\u2026";
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
      <IntegrationProviderIcon
        provider="arxiv"
        className="h-4 w-4 shrink-0"
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

export const ArxivPaperTool = memo(function ArxivPaperTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as ArxivPaper) : null;
  const input =
    "input" in part ? (part.input as { arxivId?: string }) : null;

  const canOpen = Boolean(output);

  const handleOpenSidebar = useCallback(() => {
    if (!output) return;
    open(<ArxivPaperSidebar paper={output} />);
  }, [open, output]);

  const label = (() => {
    if (isError) return "Failed to get paper";
    if (isRunning) {
      return input?.arxivId
        ? `Fetching paper ${input.arxivId}`
        : "Fetching paper\u2026";
    }
    if (output) {
      const shortTitle =
        output.title.length > 60
          ? output.title.slice(0, 57) + "\u2026"
          : output.title;
      return shortTitle;
    }
    return "Fetching paper\u2026";
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
      <IntegrationProviderIcon
        provider="arxiv"
        className="h-4 w-4 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {canOpen ? (
        <span className="shrink-0 text-[11px] text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
          View &rsaquo;
        </span>
      ) : null}
    </button>
  );
});
