import { z } from "zod";

import { REASONING_EFFORTS } from "@/lib/ai/providers/models";

const reasoningEffortSchema = z.enum(REASONING_EFFORTS);

export const chatSelectionSchema = z.object({
  modelId: z.string().trim().min(1, "Model ID is required."),
  reasoningEffort: reasoningEffortSchema.nullish(),
});

export const threadChatSelectionSchema = chatSelectionSchema.extend({
  threadId: z.string().min(1),
});
