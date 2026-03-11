import { decrypt } from "@/lib/ai/providers/encrypt";
import { SEARCH_PROVIDERS } from "@/lib/search/providers/registry";
import {
  createSearchProviderDecryptionError,
  validateSearchProviderConfig,
  validateSearchProviderSettings,
  type SearchProviderConfigMap,
  type SearchProviderSettingsMap,
} from "@/lib/search/providers/config-schemas";
import type { SearchProviderId } from "@/server/db/enums";

export type SearchProviderRuntimeEntry<TProvider extends SearchProviderId> = {
  config: SearchProviderConfigMap[TProvider];
  isEnabled: boolean;
  provider: TProvider;
  settings: SearchProviderSettingsMap[TProvider];
};

export type SearchProviderRuntimeMap = Partial<{
  [TProvider in SearchProviderId]: SearchProviderRuntimeEntry<TProvider>;
}>;

type SearchProviderRecord = {
  encryptedConfig: string;
  isEnabled: boolean;
  provider: SearchProviderId;
  settings: unknown;
};

export function parseStoredSearchProvider(
  record: SearchProviderRecord,
): SearchProviderRuntimeEntry<SearchProviderId> {
  let config: Record<string, unknown>;

  try {
    config = JSON.parse(decrypt(record.encryptedConfig)) as Record<
      string,
      unknown
    >;
  } catch {
    throw createSearchProviderDecryptionError(record.provider);
  }

  const providerDefaults = SEARCH_PROVIDERS[record.provider].defaultSettings;

  return {
    config: validateSearchProviderConfig(record.provider, config),
    isEnabled: record.isEnabled,
    provider: record.provider,
    settings: validateSearchProviderSettings(record.provider, {
      ...providerDefaults,
      ...((record.settings as Record<string, unknown> | null | undefined) ??
        {}),
    }),
  };
}

export function buildSearchProviderRuntimeMap(
  records: readonly SearchProviderRecord[],
) {
  const runtimeMap: SearchProviderRuntimeMap = {};

  for (const record of records) {
    try {
      const parsed = parseStoredSearchProvider(record);
      runtimeMap[parsed.provider] = parsed as never;
    } catch {
      continue;
    }
  }

  return runtimeMap;
}
