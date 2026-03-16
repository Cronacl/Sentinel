import type { IntegrationProvider } from "@/server/db/enums";
import type { OAuthProviderConfig } from "../../types";

const SLACK_AUTH_ENDPOINT = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_ENDPOINT = "https://slack.com/api/oauth.v2.access";
const SLACK_REVOKE_ENDPOINT = "https://slack.com/api/auth.revoke";

export function getSlackOAuthConfig(): OAuthProviderConfig {
  return {
    authorizationEndpoint: SLACK_AUTH_ENDPOINT,
    provider: "slack",
    revokeEndpoint: SLACK_REVOKE_ENDPOINT,
    scopes: [
      "channels:read",
      "channels:write",
      "channels:history",
      "groups:read",
      "groups:write",
      "groups:history",
      "chat:write",
      "pins:read",
      "pins:write",
      "reactions:read",
      "reactions:write",
      "search:read",
      "users:read",
    ],
    tokenEndpoint: SLACK_TOKEN_ENDPOINT,
  };
}

export function isSlackProvider(provider: IntegrationProvider): boolean {
  return provider === "slack";
}
