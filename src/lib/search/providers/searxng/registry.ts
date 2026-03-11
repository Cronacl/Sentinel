import type { SearchProviderMeta } from "../registry";

export const searxngSearchProviderMeta: SearchProviderMeta = {
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
};
