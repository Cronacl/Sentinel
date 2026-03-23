import { tool } from "ai";
import { z } from "zod";

import type { IntegrationContext } from "../../types";
import { ArxivService } from "./service";

export function buildArxivTools(
  _context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  const service = new ArxivService();

  return {
    arxiv_search: tool({
      description:
        "Search arXiv for academic papers by keyword, author, title, or category. Supports arXiv query syntax (e.g. 'au:Einstein', 'ti:quantum', 'cat:cs.AI').",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Search query. Use arXiv syntax: 'all:' for any field, 'ti:' for title, 'au:' for author, 'abs:' for abstract, 'cat:' for category.",
          ),
        maxResults: z
          .number()
          .min(1)
          .max(30)
          .default(10)
          .describe("Maximum number of papers to return."),
        sortBy: z
          .enum(["relevance", "lastUpdatedDate", "submittedDate"])
          .default("relevance")
          .describe("Sort order for results."),
      }),
      outputSchema: z.object({
        papers: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            summary: z.string(),
            authors: z.array(z.string()),
            published: z.string(),
            updated: z.string(),
            categories: z.array(z.string()),
            pdfUrl: z.string(),
            absUrl: z.string(),
            comment: z.string().nullable(),
            journalRef: z.string().nullable(),
            doi: z.string().nullable(),
          }),
        ),
        totalResults: z.number(),
      }),
      needsApproval: () => approvalFn("arxiv_search"),
      execute: async (input) => {
        return service.search(input.query, input.maxResults, input.sortBy);
      },
    }),

    arxiv_get_paper: tool({
      description:
        "Get full details of a specific arXiv paper by its ID (e.g. '2301.07041' or 'arxiv:2301.07041').",
      inputSchema: z.object({
        arxivId: z
          .string()
          .describe(
            "ArXiv paper ID (e.g. '2301.07041', 'arxiv:2301.07041', or full URL).",
          ),
      }),
      outputSchema: z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        authors: z.array(z.string()),
        published: z.string(),
        updated: z.string(),
        categories: z.array(z.string()),
        pdfUrl: z.string(),
        absUrl: z.string(),
        comment: z.string().nullable(),
        journalRef: z.string().nullable(),
        doi: z.string().nullable(),
      }),
      needsApproval: () => approvalFn("arxiv_get_paper"),
      execute: async (input) => {
        return service.getPaper(input.arxivId);
      },
    }),
  };
}
