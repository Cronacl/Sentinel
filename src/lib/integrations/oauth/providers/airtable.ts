import type { IntegrationProvider } from "@/server/db/enums";
import type { OAuthProviderConfig } from "../../types";

const AIRTABLE_AUTH_ENDPOINT = "https://airtable.com/oauth2/v1/authorize";
const AIRTABLE_TOKEN_ENDPOINT = "https://airtable.com/oauth2/v1/token";
const AIRTABLE_REVOKE_ENDPOINT = "https://airtable.com/oauth2/v1/revoke";

export function getAirtableOAuthConfig(): OAuthProviderConfig {
  return {
    authorizationEndpoint: AIRTABLE_AUTH_ENDPOINT,
    provider: "airtable",
    revokeEndpoint: AIRTABLE_REVOKE_ENDPOINT,
    scopes: [
      "data.records:read",
      "data.records:write",
      "data.recordComments:read",
      "data.recordComments:write",
      "schema.bases:read",
      "schema.bases:write",
      "user.email:read",
    ],
    tokenEndpoint: AIRTABLE_TOKEN_ENDPOINT,
  };
}

export function isAirtableProvider(provider: IntegrationProvider): boolean {
  return provider === "airtable";
}
