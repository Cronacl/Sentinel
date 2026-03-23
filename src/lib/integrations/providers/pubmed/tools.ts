import { tool } from "ai";
import { z } from "zod";

import type { IntegrationContext } from "../../types";
import { PubMedService } from "./service";

export function buildPubMedTools(
  _context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  const service = new PubMedService();

  return {
    pubmed_search: tool({
      description:
        "Search PubMed for biomedical and life science articles. Supports standard PubMed query syntax including MeSH terms, field tags ([ti], [au], [dp]), and boolean operators.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "PubMed search query. Use field tags like [ti] for title, [au] for author, [dp] for date, or MeSH terms.",
          ),
        maxResults: z
          .number()
          .min(1)
          .max(30)
          .default(10)
          .describe("Maximum number of articles to return."),
        sort: z
          .enum(["relevance", "pub_date"])
          .default("relevance")
          .describe("Sort order: relevance or publication date."),
      }),
      outputSchema: z.object({
        articles: z.array(
          z.object({
            pmid: z.string(),
            title: z.string(),
            abstract: z.string(),
            authors: z.array(z.string()),
            journal: z.string(),
            pubDate: z.string(),
            doi: z.string().nullable(),
            pmcId: z.string().nullable(),
            url: z.string(),
            keywords: z.array(z.string()),
          }),
        ),
        totalResults: z.number(),
      }),
      needsApproval: () => approvalFn("pubmed_search"),
      execute: async (input) => {
        return service.search(input.query, input.maxResults, input.sort);
      },
    }),

    pubmed_get_article: tool({
      description:
        "Get full details of a specific PubMed article by its PMID (PubMed ID).",
      inputSchema: z.object({
        pmid: z.string().describe("PubMed article ID (e.g. '38243602')."),
      }),
      outputSchema: z.object({
        pmid: z.string(),
        title: z.string(),
        abstract: z.string(),
        authors: z.array(z.string()),
        journal: z.string(),
        pubDate: z.string(),
        doi: z.string().nullable(),
        pmcId: z.string().nullable(),
        url: z.string(),
        keywords: z.array(z.string()),
      }),
      needsApproval: () => approvalFn("pubmed_get_article"),
      execute: async (input) => {
        return service.getArticle(input.pmid);
      },
    }),
  };
}
