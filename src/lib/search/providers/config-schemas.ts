import { z } from "zod";

import {
  LIVECRAWL_MODE_VALUES,
  SEARCH_TYPE_VALUES,
  type LivecrawlMode,
  type SearchType,
} from "@/lib/search";
import type { SearchProviderId } from "@/server/db/enums";

import {
  exaSearchProviderConfigSchema,
  exaSearchProviderSettingsSchema,
} from "./exa/config";
import {
  searxngSearchProviderConfigSchema,
  searxngSearchProviderSettingsSchema,
} from "./searxng/config";

export {
  exaSearchProviderConfigSchema,
  exaSearchProviderSettingsSchema,
  type ExaSearchProviderConfig,
  type ExaSearchProviderSettings,
} from "./exa/config";

export {
  searxngSearchProviderConfigSchema,
  searxngSearchProviderSettingsSchema,
  type SearxngSearchProviderConfig,
  type SearxngSearchProviderSettings,
} from "./searxng/config";

export type SearchProviderConfigMap = {
  exa: z.infer<typeof exaSearchProviderConfigSchema>;
  searxng: z.infer<typeof searxngSearchProviderConfigSchema>;
};

export type SearchProviderSettingsMap = {
  exa: z.infer<typeof exaSearchProviderSettingsSchema>;
  searxng: z.infer<typeof searxngSearchProviderSettingsSchema>;
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
