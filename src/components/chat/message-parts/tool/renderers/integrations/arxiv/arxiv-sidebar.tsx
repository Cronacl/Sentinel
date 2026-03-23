"use client";

import { memo, useCallback, useState } from "react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Chip,
  CloseButton,
  ScrollShadow,
  Separator,
} from "@heroui/react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { useRightSidebar } from "@/components/shell/shell-context";

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

function PaperRow({
  paper,
  onSelect,
}: {
  paper: ArxivPaper;
  onSelect: (paper: ArxivPaper) => void;
}) {
  const primaryCategory = paper.categories[0] ?? "";

  return (
    <button
      type="button"
      onClick={() => onSelect(paper)}
      className="group flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-foreground/4"
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-foreground line-clamp-2">
          {paper.title}
        </p>
        <span className="shrink-0 text-[10px] tabular-nums text-foreground/30 mt-0.5">
          {formatDate(paper.published)}
        </span>
      </div>

      <p className="text-[11px] text-foreground/45 line-clamp-1">
        {paper.authors.slice(0, 3).join(", ")}
        {paper.authors.length > 3 ? ` +${paper.authors.length - 3}` : ""}
      </p>

      <div className="flex items-center gap-1.5 mt-0.5">
        {primaryCategory ? (
          <Chip size="sm" variant="tertiary">
            {primaryCategory}
          </Chip>
        ) : null}
        <span className="text-[10px] text-foreground/25 tabular-nums">
          {paper.id}
        </span>
      </div>
    </button>
  );
}

function PaperDetailView({ paper }: { paper: ArxivPaper }) {
  return (
    <ScrollShadow className="h-full" orientation="vertical">
      <div className="space-y-4 px-4 py-3">
        <div>
          <h3 className="text-[14px] font-semibold leading-snug text-foreground">
            {paper.title}
          </h3>
          <p className="mt-1.5 text-[11.5px] text-foreground/50">
            {paper.authors.join(", ")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {paper.categories.map((cat) => (
            <Chip key={cat} size="sm" variant="tertiary">
              {cat}
            </Chip>
          ))}
        </div>

        <div className="space-y-1.5 text-[11.5px]">
          <div className="flex items-baseline justify-between">
            <span className="text-foreground/40">Published</span>
            <span className="text-foreground/70">
              {formatDate(paper.published)}
            </span>
          </div>
          {paper.updated !== paper.published ? (
            <div className="flex items-baseline justify-between">
              <span className="text-foreground/40">Updated</span>
              <span className="text-foreground/70">
                {formatDate(paper.updated)}
              </span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between">
            <span className="text-foreground/40">arXiv ID</span>
            <span className="text-foreground/70 tabular-nums">{paper.id}</span>
          </div>
          {paper.doi ? (
            <div className="flex items-baseline justify-between">
              <span className="text-foreground/40">DOI</span>
              <span className="text-foreground/70">{paper.doi}</span>
            </div>
          ) : null}
          {paper.journalRef ? (
            <div className="flex items-baseline justify-between">
              <span className="text-foreground/40">Journal</span>
              <span className="text-foreground/70">{paper.journalRef}</span>
            </div>
          ) : null}
        </div>

        {paper.comment ? (
          <>
            <Separator variant="tertiary" />
            <p className="text-[11px] text-foreground/45 italic">
              {paper.comment}
            </p>
          </>
        ) : null}

        <Separator variant="tertiary" />

        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-foreground/35">
            Abstract
          </p>
          <p className="text-[12.5px] leading-relaxed text-foreground/70">
            {paper.summary}
          </p>
        </div>

        <Separator variant="tertiary" />

        <div className="flex items-center gap-2">
          <a
            href={paper.absUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-border/30 px-3 py-1.5 text-[11.5px] font-medium text-foreground/60 transition-colors hover:bg-foreground/4 hover:text-foreground"
          >
            <Icon icon="solar:link-linear" className="h-3.5 w-3.5" />
            Abstract
          </a>
          {paper.pdfUrl ? (
            <a
              href={paper.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border/30 px-3 py-1.5 text-[11.5px] font-medium text-foreground/60 transition-colors hover:bg-foreground/4 hover:text-foreground"
            >
              <Icon icon="solar:file-text-linear" className="h-3.5 w-3.5" />
              PDF
            </a>
          ) : null}
        </div>
      </div>
    </ScrollShadow>
  );
}

export const ArxivSearchSidebar = memo(function ArxivSearchSidebar({
  query,
  papers,
  totalResults,
}: {
  query: string;
  papers: ArxivPaper[];
  totalResults: number;
}) {
  const { close } = useRightSidebar();
  const [selectedPaper, setSelectedPaper] = useState<ArxivPaper | null>(null);

  const handleBack = useCallback(() => setSelectedPaper(null), []);

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-2 px-2">
        {selectedPaper ? (
          <button
            type="button"
            onClick={handleBack}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-2xl cursor-pointer text-foreground/50 transition-colors bg-background/50 border border-border/20 hover:text-foreground"
            aria-label="Back to results"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={15} strokeWidth={1.8} />
          </button>
        ) : (
          <IntegrationProviderIcon
            provider="arxiv"
            className="h-4 w-4 shrink-0 ml-2"
          />
        )}

        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {selectedPaper ? "Paper Details" : "arXiv"}
        </span>

        {!selectedPaper ? (
          <span className="shrink-0 text-[11px] text-foreground/35">
            {totalResults.toLocaleString()} result
            {totalResults !== 1 ? "s" : ""}
          </span>
        ) : null}

        <CloseButton aria-label="Close sidebar" onPress={close} />
      </header>
      <Separator variant="tertiary" />

      <div className="min-h-0 flex-1">
        {selectedPaper ? (
          <PaperDetailView paper={selectedPaper} />
        ) : papers.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground/4">
              <Icon
                icon="solar:document-text-linear"
                className="h-5 w-5 text-foreground/30"
              />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-medium text-foreground/50">
                No papers found
              </p>
              <p className="mt-0.5 text-[11px] text-foreground/30">
                Try a different search query.
              </p>
            </div>
          </div>
        ) : (
          <ScrollShadow className="h-full px-1.5 py-1" orientation="vertical">
            <div className="flex flex-col">
              {papers.map((paper, index) => (
                <div key={paper.id}>
                  <PaperRow paper={paper} onSelect={setSelectedPaper} />
                  {index < papers.length - 1 ? (
                    <Separator className="my-0.5 ml-3" variant="tertiary" />
                  ) : null}
                </div>
              ))}
            </div>
          </ScrollShadow>
        )}
      </div>
    </div>
  );
});

export const ArxivPaperSidebar = memo(function ArxivPaperSidebar({
  paper,
}: {
  paper: ArxivPaper;
}) {
  const { close } = useRightSidebar();

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-2 px-2">
        <IntegrationProviderIcon
          provider="arxiv"
          className="h-4 w-4 shrink-0 ml-2"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          Paper Details
        </span>
        <CloseButton aria-label="Close sidebar" onPress={close} />
      </header>
      <Separator variant="tertiary" />

      <div className="min-h-0 flex-1">
        <PaperDetailView paper={paper} />
      </div>
    </div>
  );
});
