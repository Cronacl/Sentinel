"use client";

import { memo, useCallback, useState } from "react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Chip, CloseButton, ScrollShadow, Separator } from "@heroui/react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { useRightSidebar } from "@/components/shell/shell-context";

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

function ArticleRow({
  article,
  onSelect,
}: {
  article: PubMedArticle;
  onSelect: (article: PubMedArticle) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(article)}
      className="group flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-foreground/4"
    >
      <p className="text-[12.5px] font-medium leading-snug text-foreground line-clamp-2">
        {article.title}
      </p>

      <p className="text-[11px] text-foreground/45 line-clamp-1">
        {article.authors.slice(0, 3).join(", ")}
        {article.authors.length > 3 ? ` +${article.authors.length - 3}` : ""}
      </p>

      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-[10px] text-foreground/30 truncate">
          {article.journal}
        </span>
        <span className="text-[10px] text-foreground/20">&middot;</span>
        <span className="text-[10px] text-foreground/30 shrink-0">
          {article.pubDate}
        </span>
      </div>
    </button>
  );
}

function ArticleDetailView({ article }: { article: PubMedArticle }) {
  return (
    <ScrollShadow className="h-full" orientation="vertical">
      <div className="space-y-4 px-4 py-3">
        <div>
          <h3 className="text-[14px] font-medium leading-snug text-foreground">
            {article.title}
          </h3>
          <p className="mt-1.5 text-[11.5px] text-foreground/50">
            {article.authors.join(", ")}
          </p>
        </div>

        <div className="space-y-1.5 text-[11.5px]">
          <div className="flex items-baseline justify-between">
            <span className="text-foreground/40">Journal</span>
            <span className="text-foreground/70 text-right max-w-[60%] truncate">
              {article.journal}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-foreground/40">Published</span>
            <span className="text-foreground/70">{article.pubDate}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-foreground/40">PMID</span>
            <span className="text-foreground/70 tabular-nums">
              {article.pmid}
            </span>
          </div>
          {article.doi ? (
            <div className="flex items-baseline justify-between">
              <span className="text-foreground/40">DOI</span>
              <span className="text-foreground/70 text-right max-w-[60%] truncate">
                {article.doi}
              </span>
            </div>
          ) : null}
          {article.pmcId ? (
            <div className="flex items-baseline justify-between">
              <span className="text-foreground/40">PMC</span>
              <span className="text-foreground/70">{article.pmcId}</span>
            </div>
          ) : null}
        </div>

        {article.keywords.length > 0 ? (
          <>
            <Separator variant="tertiary" />
            <div className="flex flex-wrap items-center gap-1.5">
              {article.keywords.map((kw) => (
                <Chip key={kw} size="sm" variant="tertiary">
                  {kw}
                </Chip>
              ))}
            </div>
          </>
        ) : null}

        {article.abstract ? (
          <>
            <Separator variant="tertiary" />
            <div>
              <p className="mb-1 text-[10px] font-medium text-foreground/35">
                Abstract
              </p>
              <p className="text-[12.5px] leading-relaxed text-foreground/70">
                {article.abstract}
              </p>
            </div>
          </>
        ) : null}

        <Separator variant="tertiary" />

        <div className="flex items-center gap-2">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-border/30 px-3 py-1.5 text-[11.5px] font-medium text-foreground/60 transition-colors hover:bg-foreground/4 hover:text-foreground"
          >
            <Icon icon="solar:link-linear" className="h-3.5 w-3.5" />
            PubMed
          </a>
          {article.doi ? (
            <a
              href={`https://doi.org/${article.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border/30 px-3 py-1.5 text-[11.5px] font-medium text-foreground/60 transition-colors hover:bg-foreground/4 hover:text-foreground"
            >
              <Icon icon="solar:file-text-linear" className="h-3.5 w-3.5" />
              Full Text
            </a>
          ) : null}
          {article.pmcId ? (
            <a
              href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${article.pmcId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border/30 px-3 py-1.5 text-[11.5px] font-medium text-foreground/60 transition-colors hover:bg-foreground/4 hover:text-foreground"
            >
              <Icon icon="solar:book-2-linear" className="h-3.5 w-3.5" />
              PMC
            </a>
          ) : null}
        </div>
      </div>
    </ScrollShadow>
  );
}

export const PubMedSearchSidebar = memo(function PubMedSearchSidebar({
  query,
  articles,
  totalResults,
}: {
  query: string;
  articles: PubMedArticle[];
  totalResults: number;
}) {
  const { close } = useRightSidebar();
  const [selectedArticle, setSelectedArticle] = useState<PubMedArticle | null>(
    null,
  );

  const handleBack = useCallback(() => setSelectedArticle(null), []);

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-2 px-2">
        {selectedArticle ? (
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
            provider="pubmed"
            className="h-4 w-4 shrink-0 ml-2"
          />
        )}

        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {selectedArticle ? "Article Details" : "PubMed"}
        </span>

        {!selectedArticle ? (
          <span className="shrink-0 text-[11px] text-foreground/35">
            {totalResults.toLocaleString()} result
            {totalResults !== 1 ? "s" : ""}
          </span>
        ) : null}

        <CloseButton aria-label="Close sidebar" onPress={close} />
      </header>
      <Separator variant="tertiary" />

      <div className="min-h-0 flex-1">
        {selectedArticle ? (
          <ArticleDetailView article={selectedArticle} />
        ) : articles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground/4">
              <Icon
                icon="solar:document-medicine-linear"
                className="h-5 w-5 text-foreground/30"
              />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-medium text-foreground/50">
                No articles found
              </p>
              <p className="mt-0.5 text-[11px] text-foreground/30">
                Try a different search query.
              </p>
            </div>
          </div>
        ) : (
          <ScrollShadow className="h-full px-1.5 py-1" orientation="vertical">
            <div className="flex flex-col">
              {articles.map((article, index) => (
                <div key={article.pmid}>
                  <ArticleRow article={article} onSelect={setSelectedArticle} />
                  {index < articles.length - 1 ? (
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

export const PubMedArticleSidebar = memo(function PubMedArticleSidebar({
  article,
}: {
  article: PubMedArticle;
}) {
  const { close } = useRightSidebar();

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-2 px-2">
        <IntegrationProviderIcon
          provider="pubmed"
          className="h-4 w-4 shrink-0 ml-2"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          Article Details
        </span>
        <CloseButton aria-label="Close sidebar" onPress={close} />
      </header>
      <Separator variant="tertiary" />

      <div className="min-h-0 flex-1">
        <ArticleDetailView article={article} />
      </div>
    </div>
  );
});
