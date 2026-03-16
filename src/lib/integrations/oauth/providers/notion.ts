import type { IntegrationProvider } from "@/server/db/enums";
import type { OAuthProviderConfig } from "../../types";

const NOTION_AUTH_ENDPOINT = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_ENDPOINT = "https://api.notion.com/v1/oauth/token";

export function getNotionOAuthConfig(): OAuthProviderConfig {
  return {
    authorizationEndpoint: NOTION_AUTH_ENDPOINT,
    provider: "notion",
    scopes: [],
    tokenEndpoint: NOTION_TOKEN_ENDPOINT,
  };
}

export function isNotionProvider(provider: IntegrationProvider): boolean {
  return provider === "notion";
}
