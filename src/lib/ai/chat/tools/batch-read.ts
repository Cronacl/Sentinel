import { z } from "zod";

import type { PermissionMode } from "@/lib/security";

import { executeRead, type ReadOutput, readOutputSchema } from "./read";

const MAX_BATCH_READ_PATHS = 25;

export const batchReadInputSchema = z.object({
  limit: z.number().int().min(1).max(400).optional(),
  offset: z.number().int().min(1).optional(),
  paths: z.array(z.string().min(1)).min(1).max(MAX_BATCH_READ_PATHS),
});

export const batchReadOutputSchema = z.object({
  results: z.array(readOutputSchema),
});

export type BatchReadInput = z.infer<typeof batchReadInputSchema>;
export type BatchReadOutput = z.infer<typeof batchReadOutputSchema>;

export async function executeBatchRead({
  defaultDirectory,
  extraAllowedRoots,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  extraAllowedRoots?: readonly string[];
  input: BatchReadInput;
  permissionMode: PermissionMode;
}): Promise<BatchReadOutput> {
  const results: ReadOutput[] = [];

  for (const requestedPath of input.paths) {
    results.push(
      await executeRead({
        defaultDirectory,
        ...(extraAllowedRoots ? { extraAllowedRoots } : {}),
        input: {
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          ...(input.offset === undefined ? {} : { offset: input.offset }),
          path: requestedPath,
        },
        permissionMode,
      }),
    );
  }

  return { results };
}
