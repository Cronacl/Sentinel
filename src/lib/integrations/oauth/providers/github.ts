import type { IntegrationProvider } from "@/server/db/enums";
import type { OAuthProviderConfig } from "../../types";

const GITHUB_AUTH_ENDPOINT = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";

const GITHUB_SCOPES = ["repo", "read:org", "workflow", "read:user"];

export function getGitHubOAuthConfig(): OAuthProviderConfig {
  return {
    authorizationEndpoint: GITHUB_AUTH_ENDPOINT,
    provider: "github",
    scopes: GITHUB_SCOPES,
    tokenEndpoint: GITHUB_TOKEN_ENDPOINT,
  };
}

export function isGitHubProvider(provider: IntegrationProvider): boolean {
  return provider === "github";
}
