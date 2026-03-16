import type { IntegrationProvider } from "@/server/db/enums";
import type { OAuthProviderConfig } from "../../types";

const LINEAR_AUTH_ENDPOINT = "https://linear.app/oauth/authorize";
const LINEAR_TOKEN_ENDPOINT = "https://api.linear.app/oauth/token";
const LINEAR_REVOKE_ENDPOINT = "https://api.linear.app/oauth/revoke";

const LINEAR_SCOPES = ["read", "write"];

export function getLinearOAuthConfig(): OAuthProviderConfig {
  return {
    authorizationEndpoint: LINEAR_AUTH_ENDPOINT,
    provider: "linear",
    revokeEndpoint: LINEAR_REVOKE_ENDPOINT,
    scopes: LINEAR_SCOPES,
    tokenEndpoint: LINEAR_TOKEN_ENDPOINT,
  };
}

export function isLinearProvider(provider: IntegrationProvider): boolean {
  return provider === "linear";
}
