import type { LivecrawlMode, SearchType } from "@/lib/search";
import type { SearchProviderId } from "@/server/db/enums";

import { exaSearchProviderMeta } from "./exa/registry";
import { searxngSearchProviderMeta } from "./searxng/registry";

export type SearchProviderMeta = {
  defaultSettings: {
    defaultLivecrawl: LivecrawlMode;
    defaultSearchType: SearchType;
  };
  description: string;
  displayName: string;
  installationDocsUrl?: string;
  id: SearchProviderId;
  supportsLivecrawlModes: readonly LivecrawlMode[];
  supportsSearchTypes: readonly SearchType[];
};

export const SEARCH_PROVIDERS: Record<SearchProviderId, SearchProviderMeta> = {
  exa: exaSearchProviderMeta,
  searxng: searxngSearchProviderMeta,
};

export const SEARCH_PROVIDER_LIST = Object.values(SEARCH_PROVIDERS);
