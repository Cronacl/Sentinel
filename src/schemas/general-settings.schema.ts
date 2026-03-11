import { z } from "zod";

import {
  MAX_WEBFETCH_BATCH_LIMIT,
  MIN_WEBFETCH_BATCH_LIMIT,
} from "@/lib/webfetch";

export const generalSettingsFormSchema = z.object({
  webFetchBatchEnabled: z.boolean(),
  webFetchBatchLimit: z
    .number()
    .int()
    .min(MIN_WEBFETCH_BATCH_LIMIT)
    .max(MAX_WEBFETCH_BATCH_LIMIT),
});

export type GeneralSettingsFormValues = z.infer<
  typeof generalSettingsFormSchema
>;
