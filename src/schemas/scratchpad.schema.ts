import { z } from "zod";

import { CHAT_ENGINES, SCRATCHPAD_TASK_STATUSES } from "@/server/db/enums";
import { REASONING_EFFORTS } from "@/lib/ai/providers/models";

export const scratchpadTaskStatusSchema = z.enum(SCRATCHPAD_TASK_STATUSES);

export const scratchpadCreateTaskSchema = z.object({
  engine: z.enum(CHAT_ENGINES).optional(),
  modelId: z.string().optional(),
  reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
  title: z.string().trim().min(1, "Task title is required.").max(300),
});

export const scratchpadTaskActionSchema = z.object({
  taskId: z.string().trim().min(1),
});

export const scratchpadToggleTaskCompleteSchema =
  scratchpadTaskActionSchema.extend({
    completed: z.boolean().optional(),
  });
