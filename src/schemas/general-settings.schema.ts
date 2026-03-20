import { z } from "zod";

import {
  MAX_WEBFETCH_BATCH_LIMIT,
  MIN_WEBFETCH_BATCH_LIMIT,
} from "@/lib/webfetch";

export const FOLLOW_UP_BEHAVIOR_OPTIONS = ["queue", "steer"] as const;
export type FollowUpBehavior = (typeof FOLLOW_UP_BEHAVIOR_OPTIONS)[number];
export const DEFAULT_FOLLOW_UP_BEHAVIOR: FollowUpBehavior = "queue";
export const MIN_CONTEXT_COMPACTION_WINDOW_PERCENT = 50;
export const MAX_CONTEXT_COMPACTION_WINDOW_PERCENT = 90;
export const DEFAULT_CONTEXT_COMPACTION_ENABLED = false;
export const DEFAULT_CONTEXT_COMPACTION_WINDOW_PERCENT = 70;
export const MIN_FIXED_CONTEXT_WINDOW_SIZE = 32_000;
export const MAX_FIXED_CONTEXT_WINDOW_SIZE = 2_000_000;
export const DEFAULT_CONTEXT_COMPACTION_USE_FIXED_WINDOW = false;
export const DEFAULT_FIXED_CONTEXT_WINDOW_SIZE = 128_000;

export const generalSettingsFormSchema = z.object({
  followUpBehavior: z.enum(FOLLOW_UP_BEHAVIOR_OPTIONS),
  webFetchBatchEnabled: z.boolean(),
  webFetchBatchLimit: z
    .number()
    .int()
    .min(MIN_WEBFETCH_BATCH_LIMIT)
    .max(MAX_WEBFETCH_BATCH_LIMIT),
  contextCompactionEnabled: z.boolean(),
  contextCompactionWindowPercent: z
    .number()
    .int()
    .min(MIN_CONTEXT_COMPACTION_WINDOW_PERCENT)
    .max(MAX_CONTEXT_COMPACTION_WINDOW_PERCENT),
  contextCompactionUseFixedWindow: z.boolean(),
  contextCompactionFixedWindowSize: z
    .number()
    .int()
    .min(MIN_FIXED_CONTEXT_WINDOW_SIZE)
    .max(MAX_FIXED_CONTEXT_WINDOW_SIZE),
  skillsBasePath: z
    .string()
    .trim()
    .refine((v) => v === "" || v.startsWith("/"), {
      message: "Must be an absolute path (starting with /).",
    })
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

export type GeneralSettingsFormValues = z.infer<
  typeof generalSettingsFormSchema
>;
