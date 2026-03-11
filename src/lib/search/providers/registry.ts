import {
  DEFAULT_EXA_LIVECRAWL_MODE,
  DEFAULT_EXA_SEARCH_TYPE,
  type LivecrawlMode,
  type SearchType,
} from "@/lib/search";
import type { SearchProviderId } from "@/server/db/enums";

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
  exa: {
    defaultSettings: {
      defaultLivecrawl: DEFAULT_EXA_LIVECRAWL_MODE,
      defaultSearchType: DEFAULT_EXA_SEARCH_TYPE,
    },
    description:
      "Exa web search with LLM-oriented summaries and crawl options.",
    displayName: "Exa",
    id: "exa",
    supportsLivecrawlModes: ["never", "preferred", "always"],
    supportsSearchTypes: ["auto", "fast", "deep"],
  },
  searxng: {
    defaultSettings: {
      defaultLivecrawl: "preferred",
      defaultSearchType: "auto",
    },
    description:
      "Self-hosted SearXNG metasearch instance for privacy-focused web search.",
    displayName: "SearXNG",
    installationDocsUrl: "https://docs.searxng.org/admin/installation.html",
    id: "searxng",
    supportsLivecrawlModes: ["preferred"],
    supportsSearchTypes: ["auto"],
  },
};

export const SEARCH_PROVIDER_LIST = Object.values(SEARCH_PROVIDERS);
