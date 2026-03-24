import { z } from "zod";

import { REASONING_EFFORTS } from "@/lib/ai/providers/models";
import { THREAD_MODES } from "@/lib/plan";
import { CHAT_ENGINES } from "@/server/db/enums";

const reasoningEffortSchema = z.enum(REASONING_EFFORTS);
const chatEngineSchema = z.enum(CHAT_ENGINES);
const chatModelIdSchema = z.string().trim().min(1, "Model is required.");

const chatSelectionFieldsSchema = z.object({
  engine: chatEngineSchema.nullish(),
  mode: z.enum(THREAD_MODES).nullish(),
  modelId: chatModelIdSchema.optional(),
  reasoningEffort: reasoningEffortSchema.nullish(),
});

function hasChatSelectionUpdate(value: {
  engine?: (typeof CHAT_ENGINES)[number] | null;
  mode?: (typeof THREAD_MODES)[number] | null;
  modelId?: string;
  reasoningEffort?: (typeof REASONING_EFFORTS)[number] | null;
}) {
  return (
    value.engine !== undefined ||
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
