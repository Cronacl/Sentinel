import { z } from "zod";

import {
  MAX_MEMORY_AUTO_SAVE_PER_TURN_LIMIT,
  MAX_MEMORY_RETRIEVAL_LIMIT,
  MEMORY_SCOPE_VALUES,
  MIN_MEMORY_AUTO_SAVE_PER_TURN_LIMIT,
  MIN_MEMORY_RETRIEVAL_LIMIT,
} from "@/lib/memory";
import { MEMORY_EMBEDDING_PROFILE_IDS } from "@/lib/memory/profiles";

export const memorySettingsFormSchema = z.object({
  autoSaveEnabled: z.boolean(),
  autoSavePerTurnLimit: z
    .number()
    .int()
    .min(MIN_MEMORY_AUTO_SAVE_PER_TURN_LIMIT)
    .max(MAX_MEMORY_AUTO_SAVE_PER_TURN_LIMIT),
  defaultScope: z.enum(MEMORY_SCOPE_VALUES),
  enabled: z.boolean(),
  memoryProfileId: z.enum(MEMORY_EMBEDDING_PROFILE_IDS),
  retrievalLimit: z
    .number()
    .int()
    .min(MIN_MEMORY_RETRIEVAL_LIMIT)
    .max(MAX_MEMORY_RETRIEVAL_LIMIT),
});

export type MemorySettingsFormValues = z.infer<typeof memorySettingsFormSchema>;
