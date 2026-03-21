import { z } from "zod";

import {
  clampMemoryRetrievalLimit,
  MEMORY_KIND_VALUES,
  MEMORY_SEARCH_SCOPE_VALUES,
  type MemorySettings,
} from "@/lib/memory";
import { retrieveRelevantMemories } from "@/lib/memory/service";

export const searchMemoryInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe("Maximum number of memories to return."),
  query: z.string().min(1).describe("What to look up in long-term memory."),
  scope: z
    .enum(MEMORY_SEARCH_SCOPE_VALUES)
    .optional()
    .describe("Search global memory, workspace memory, or both."),
});

const searchMemoryResultSchema = z.object({
  content: z.string(),
  id: z.string(),
  kind: z.enum(MEMORY_KIND_VALUES),
  scope: z.enum(["global", "workspace"] as const),
  score: z.number(),
  summary: z.string().nullable(),
  workspaceId: z.string().nullable(),
});

export const searchMemoryOutputSchema = z.object({
  query: z.string(),
  resolvedScope: z.enum(["both", "global", "workspace"] as const),
  resultCount: z.number().int().min(0),
  results: z.array(searchMemoryResultSchema),
});

export type SearchMemoryInput = z.infer<typeof searchMemoryInputSchema>;
export type SearchMemoryOutput = z.infer<typeof searchMemoryOutputSchema>;

export async function executeSearchMemory({
  abortSignal,
  input,
  runtime,
}: {
  abortSignal?: AbortSignal;
  input: SearchMemoryInput;
  runtime: {
    settings: MemorySettings;
    userId: string;
    workspaceId?: string | null;
  };
}): Promise<SearchMemoryOutput> {
  const results = await retrieveRelevantMemories({
    abortSignal,
    limit: clampMemoryRetrievalLimit(
      input.limit ?? runtime.settings.retrievalLimit,
    ),
    query: input.query,
    requestedScope: input.scope ?? "auto",
    settings: runtime.settings,
    userId: runtime.userId,
    workspaceId: runtime.workspaceId,
  });
  const resolvedScope =
    input.scope === "global" ||
    input.scope === "workspace" ||
    input.scope === "both"
      ? input.scope
      : runtime.settings.defaultScope === "workspace"
        ? "both"
        : "global";

  return {
    query: input.query.trim(),
    resolvedScope,
    resultCount: results.length,
    results: results.map((result) => ({
      content: result.content,
      id: result.id,
      kind: result.kind,
      scope: result.scope,
      score: result.score,
      summary: result.summary,
      workspaceId: result.workspaceId,
    })),
  };
}
