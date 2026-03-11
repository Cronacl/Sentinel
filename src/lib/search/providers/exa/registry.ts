import {
  DEFAULT_EXA_LIVECRAWL_MODE,
  DEFAULT_EXA_SEARCH_TYPE,
} from "@/lib/search";
import type { SearchProviderMeta } from "../registry";

export const exaSearchProviderMeta: SearchProviderMeta = {
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
};
