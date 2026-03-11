import { z } from "zod";

import { MAX_SEARCH_RESULT_COUNT, MIN_SEARCH_RESULT_COUNT } from "@/lib/search";
import { SEARCH_PROVIDERS } from "@/server/db/enums";

export const searchSettingsFormSchema = z
  .object({
    defaultProvider: z.enum(SEARCH_PROVIDERS),
    defaultResultCount: z
      .number()
      .int()
      .min(MIN_SEARCH_RESULT_COUNT)
      .max(MAX_SEARCH_RESULT_COUNT),
    maxResultCount: z
      .number()
      .int()
      .min(MIN_SEARCH_RESULT_COUNT)
      .max(MAX_SEARCH_RESULT_COUNT),
  })
  .refine((value) => value.defaultResultCount <= value.maxResultCount, {
    message: "Default result count cannot exceed the maximum result count.",
    path: ["defaultResultCount"],
  });

export type SearchSettingsFormValues = z.infer<typeof searchSettingsFormSchema>;
