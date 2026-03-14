import { z } from "zod";

import { REASONING_EFFORTS } from "@/lib/ai/providers/models";
import { THREAD_MODES } from "@/lib/plan";

const reasoningEffortSchema = z.enum(REASONING_EFFORTS);
const compositeModelIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z_]+:.+$/, 'Model must use the "provider:model" format.');

const chatSelectionFieldsSchema = z.object({
  mode: z.enum(THREAD_MODES).nullish(),
  modelId: compositeModelIdSchema.optional(),
  reasoningEffort: reasoningEffortSchema.nullish(),
});

function hasChatSelectionUpdate(value: {
  mode?: (typeof THREAD_MODES)[number] | null;
  modelId?: string;
  reasoningEffort?: (typeof REASONING_EFFORTS)[number] | null;
}) {
  return (
    value.mode !== undefined ||
    value.modelId !== undefined ||
    value.reasoningEffort !== undefined
  );
}

export const chatSelectionSchema = chatSelectionFieldsSchema.refine(
  hasChatSelectionUpdate,
  {
    message: "At least one setting must be provided.",
    path: ["modelId"],
  },
);

export const threadChatSelectionSchema = chatSelectionFieldsSchema
  .extend({
    threadId: z.string().min(1),
  })
  .refine(hasChatSelectionUpdate, {
    message: "At least one setting must be provided.",
    path: ["threadId"],
  });
