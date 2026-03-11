import { z } from "zod";

import { LIVECRAWL_MODE_VALUES, SEARCH_TYPE_VALUES } from "@/lib/search";
import { SEARCH_PROVIDERS } from "@/server/db/enums";

export const searchProviderSchema = z.enum(SEARCH_PROVIDERS);

export const exaSearchProviderConfigFormSchema = z.object({
  apiKey: z.string().trim().min(1, "API key is required."),
  defaultLivecrawl: z.enum(LIVECRAWL_MODE_VALUES),
  defaultSearchType: z.enum(SEARCH_TYPE_VALUES),
  isEnabled: z.boolean(),
});

export const searxngSearchProviderConfigFormSchema = z.object({
  baseURL: z.string().trim().url("Enter a valid URL."),
  defaultLivecrawl: z.literal("preferred"),
  defaultSearchType: z.literal("auto"),
  isEnabled: z.boolean(),
});

export const searchProviderUpsertSchema = z.discriminatedUnion("provider", [
  z.object({
    config: z.object({
      apiKey: z.string().trim().min(1, "API key is required."),
    }),
    isEnabled: z.boolean(),
    provider: z.literal("exa"),
    settings: z.object({
      defaultLivecrawl: z.enum(LIVECRAWL_MODE_VALUES),
      defaultSearchType: z.enum(SEARCH_TYPE_VALUES),
    }),
  }),
  z.object({
    config: z.object({
      baseURL: z.string().trim().url("Enter a valid URL."),
    }),
    isEnabled: z.boolean(),
    provider: z.literal("searxng"),
    settings: z.object({
      defaultLivecrawl: z.literal("preferred"),
      defaultSearchType: z.literal("auto"),
    }),
  }),
]);

export const searchProviderToggleSchema = z.object({
  isEnabled: z.boolean(),
  provider: searchProviderSchema,
});

export const searchProviderGetSchema = z.object({
  provider: searchProviderSchema,
});

export const searchProviderDeleteSchema = z.object({
  provider: searchProviderSchema,
});

export type ExaSearchProviderConfigFormValues = z.infer<
  typeof exaSearchProviderConfigFormSchema
>;
export type SearxngSearchProviderConfigFormValues = z.infer<
  typeof searxngSearchProviderConfigFormSchema
>;
