import { z } from "zod";

import {
  LIVECRAWL_MODE_VALUES,
  SEARCH_TYPE_VALUES,
  type LivecrawlMode,
  type SearchType,
} from "@/lib/search";
import type { SearchProviderId } from "@/server/db/enums";

export const exaSearchProviderConfigSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
});

export const searxngSearchProviderConfigSchema = z.object({
  baseURL: z.string().url("Base URL must be a valid URL"),
});

export const exaSearchProviderSettingsSchema = z.object({
  defaultLivecrawl: z.enum(LIVECRAWL_MODE_VALUES),
  defaultSearchType: z.enum(SEARCH_TYPE_VALUES),
});

export const searxngSearchProviderSettingsSchema = z.object({
  defaultLivecrawl: z.literal("preferred"),
  defaultSearchType: z.literal("auto"),
});

export type ExaSearchProviderConfig = z.infer<
  typeof exaSearchProviderConfigSchema
>;
export type ExaSearchProviderSettings = z.infer<
  typeof exaSearchProviderSettingsSchema
>;
export type SearxngSearchProviderConfig = z.infer<
  typeof searxngSearchProviderConfigSchema
>;
export type SearxngSearchProviderSettings = z.infer<
  typeof searxngSearchProviderSettingsSchema
>;

export type SearchProviderConfigMap = {
  exa: ExaSearchProviderConfig;
  searxng: SearxngSearchProviderConfig;
};

export type SearchProviderSettingsMap = {
  exa: ExaSearchProviderSettings;
  searxng: SearxngSearchProviderSettings;
};

export const SEARCH_PROVIDER_CONFIG_SCHEMAS: Record<
  SearchProviderId,
  z.ZodType
> = {
  exa: exaSearchProviderConfigSchema,
  searxng: searxngSearchProviderConfigSchema,
};

export const SEARCH_PROVIDER_SETTINGS_SCHEMAS: Record<
  SearchProviderId,
  z.ZodType
> = {
  exa: exaSearchProviderSettingsSchema,
  searxng: searxngSearchProviderSettingsSchema,
};

export function validateSearchProviderConfig<
  TProvider extends SearchProviderId,
>(provider: TProvider, config: unknown) {
  return SEARCH_PROVIDER_CONFIG_SCHEMAS[provider].parse(
    config,
  ) as SearchProviderConfigMap[TProvider];
}

export function validateSearchProviderSettings<
  TProvider extends SearchProviderId,
>(provider: TProvider, settings: unknown) {
  return SEARCH_PROVIDER_SETTINGS_SCHEMAS[provider].parse(
    settings,
  ) as SearchProviderSettingsMap[TProvider];
}

export function createSearchProviderDecryptionError(provider: string): Error {
  return new Error(
    `Search provider "${provider}" credentials could not be decrypted. Re-save them in Settings > Search.`,
  );
}

export function isSupportedSearchType(value: string): value is SearchType {
  return SEARCH_TYPE_VALUES.includes(value as SearchType);
}

export function isSupportedLivecrawlMode(
  value: string,
): value is LivecrawlMode {
  return LIVECRAWL_MODE_VALUES.includes(value as LivecrawlMode);
}
