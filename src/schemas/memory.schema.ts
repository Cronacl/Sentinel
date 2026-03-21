import { z } from "zod";

import {
  MAX_MEMORY_RETRIEVAL_LIMIT,
  MEMORY_KIND_VALUES,
  MEMORY_SCOPE_VALUES,
} from "@/lib/memory";
import { MEMORY_EMBEDDING_PROFILE_IDS } from "@/lib/memory/profiles";

export const memoryListSchema = z.object({
  kind: z.enum([...MEMORY_KIND_VALUES, "all"] as const).optional(),
  pinned: z.boolean().optional(),
  query: z.string().optional(),
  scope: z.enum([...MEMORY_SCOPE_VALUES, "all"] as const).optional(),
  workspaceId: z.string().optional(),
});

export const memoryDeleteSchema = z.object({
  memoryId: z.string().min(1),
});

export const memoryTogglePinnedSchema = z.object({
  isPinned: z.boolean(),
  memoryId: z.string().min(1),
});

export const memoryClearAllSchema = z.object({
  nextProfileId: z.enum(MEMORY_EMBEDDING_PROFILE_IDS).optional(),
});

export const memoryReindexSchema = z.object({
  nextProfileId: z.enum(MEMORY_EMBEDDING_PROFILE_IDS),
});

export const memoryToolSearchScopeSchema = z.enum([
  "auto",
  "both",
  ...MEMORY_SCOPE_VALUES,
] as const);

export const memoryToolResultLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_MEMORY_RETRIEVAL_LIMIT);
