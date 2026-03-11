import { z } from "zod";

export const searxngSearchProviderConfigSchema = z.object({
  baseURL: z.string().url("Base URL must be a valid URL"),
});

export const searxngSearchProviderSettingsSchema = z.object({
  defaultLivecrawl: z.literal("preferred"),
  defaultSearchType: z.literal("auto"),
});

export type SearxngSearchProviderConfig = z.infer<
  typeof searxngSearchProviderConfigSchema
>;
export type SearxngSearchProviderSettings = z.infer<
  typeof searxngSearchProviderSettingsSchema
>;
