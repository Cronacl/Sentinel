import { z } from "zod";

import {
  MAX_WEBFETCH_BATCH_LIMIT,
  MIN_WEBFETCH_BATCH_LIMIT,
} from "@/lib/webfetch";

export const FOLLOW_UP_BEHAVIOR_OPTIONS = ["queue", "steer"] as const;
export type FollowUpBehavior = (typeof FOLLOW_UP_BEHAVIOR_OPTIONS)[number];
export const DEFAULT_FOLLOW_UP_BEHAVIOR: FollowUpBehavior = "queue";

export const generalSettingsFormSchema = z.object({
  followUpBehavior: z.enum(FOLLOW_UP_BEHAVIOR_OPTIONS),
  webFetchBatchEnabled: z.boolean(),
  webFetchBatchLimit: z
    .number()
    .int()
    .min(MIN_WEBFETCH_BATCH_LIMIT)
    .max(MAX_WEBFETCH_BATCH_LIMIT),
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
