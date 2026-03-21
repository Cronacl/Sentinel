import { z } from "zod";

import { LIVECRAWL_MODE_VALUES, SEARCH_TYPE_VALUES } from "@/lib/search";

export const exaSearchProviderConfigSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
});

export const exaSearchProviderSettingsSchema = z.object({
  defaultLivecrawl: z.enum(LIVECRAWL_MODE_VALUES),
  defaultSearchType: z.enum(SEARCH_TYPE_VALUES),
});

export type ExaSearchProviderConfig = z.infer<
  typeof exaSearchProviderConfigSchema
>;
export type ExaSearchProviderSettings = z.infer<
  typeof exaSearchProviderSettingsSchema
>;
