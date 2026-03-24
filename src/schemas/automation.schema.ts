import { z } from "zod";

import {
  AUTOMATION_REASONING_EFFORTS,
  AUTOMATION_SCHEDULE_TYPES,
  CHAT_ENGINES,
} from "@/server/db/enums";

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MODEL_ID_PATTERN = /^[a-z_]+:.+$/;

function addScheduleValidationIssues(
  data: {
    scheduleCron?: string | null;
    scheduleDayOfWeek?: number | null;
    scheduleTime?: string | null;
    scheduleType: (typeof AUTOMATION_SCHEDULE_TYPES)[number];
  },
  ctx: z.RefinementCtx,
) {
  if (
    (data.scheduleType === "daily" || data.scheduleType === "weekdays") &&
    !data.scheduleTime
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Time is required for daily and weekday schedules.",
      path: ["scheduleTime"],
    });
  }

  if (data.scheduleType === "weekly") {
    if (data.scheduleDayOfWeek == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Day is required for weekly schedules.",
        path: ["scheduleDayOfWeek"],
      });
    }

    if (!data.scheduleTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Time is required for weekly schedules.",
        path: ["scheduleTime"],
      });
    }
  }

  if (data.scheduleType === "custom") {
    if (!data.scheduleCron) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cron expression is required for custom schedules.",
        path: ["scheduleCron"],
      });
      return;
    }

    if (!isLikelyCronExpression(data.scheduleCron)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cron expression must use a macro like @hourly or 5-6 fields.",
        path: ["scheduleCron"],
      });
    }
  }
}

export function isLikelyCronExpression(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("@")) {
    return true;
  }

  const parts = trimmed.split(/\s+/);
  return parts.length === 5 || parts.length === 6;
}

export const automationScheduleTypeSchema = z.enum(AUTOMATION_SCHEDULE_TYPES);
export const automationChatEngineSchema = z.enum(CHAT_ENGINES);

const automationFieldsSchema = {
  title: z.string().trim().min(1, "Title is required.").max(200),
  prompt: z.string().trim().min(1, "Prompt is required."),
  chatEngine: automationChatEngineSchema.optional(),
  workspaceId: z.string().trim().min(1).nullable().optional(),
  scheduleType: automationScheduleTypeSchema,
  scheduleDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  scheduleTime: z
    .string()
    .trim()
    .regex(TIME_PATTERN, "Time must be in HH:mm format.")
    .nullable()
    .optional(),
  scheduleCron: z.string().trim().min(1).nullable().optional(),
  modelId: z.string().trim().min(1).nullable().optional(),
  reasoningEffort: z.enum(AUTOMATION_REASONING_EFFORTS).nullable().optional(),
} satisfies Record<string, z.ZodTypeAny>;

function addModelValidationIssues(
  data: {
    chatEngine?: (typeof CHAT_ENGINES)[number];
    modelId?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (!data.modelId) {
    return;
  }

  const engine = data.chatEngine ?? "sentinel";
  if (engine === "sentinel" && !MODEL_ID_PATTERN.test(data.modelId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Model must use the "provider:model" format for Sentinel.',
      path: ["modelId"],
    });
  }
}

export const createAutomationSchema = z
  .object(automationFieldsSchema)
  .superRefine(addScheduleValidationIssues)
  .superRefine(addModelValidationIssues);

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;

export const updateAutomationSchema = z.object({
  id: z.string().trim().min(1),
  title: automationFieldsSchema.title.optional(),
  prompt: automationFieldsSchema.prompt.optional(),
  chatEngine: automationFieldsSchema.chatEngine,
  workspaceId: automationFieldsSchema.workspaceId,
  scheduleType: automationScheduleTypeSchema.optional(),
  scheduleDayOfWeek: automationFieldsSchema.scheduleDayOfWeek,
  scheduleTime: automationFieldsSchema.scheduleTime,
  scheduleCron: automationFieldsSchema.scheduleCron,
  modelId: automationFieldsSchema.modelId,
  reasoningEffort: automationFieldsSchema.reasoningEffort,
});

export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
