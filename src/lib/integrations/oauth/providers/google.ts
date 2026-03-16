import type { IntegrationProvider } from "@/server/db/enums";
import type { OAuthProviderConfig } from "../../types";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
];

const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

const PROVIDER_SCOPES: Partial<Record<IntegrationProvider, string[]>> = {
  gmail: GMAIL_SCOPES,
  google_calendar: GOOGLE_CALENDAR_SCOPES,
};

export function getGoogleOAuthConfig(
  provider: IntegrationProvider,
): OAuthProviderConfig {
  const scopes = PROVIDER_SCOPES[provider];
  if (!scopes) {
    throw new Error(`No Google OAuth config for provider: ${provider}`);
  }

  return {
    authorizationEndpoint: GOOGLE_AUTH_ENDPOINT,
    provider,
    revokeEndpoint: GOOGLE_REVOKE_ENDPOINT,
    scopes,
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
  };
}

export function isGoogleProvider(provider: IntegrationProvider): boolean {
  return provider === "gmail" || provider === "google_calendar";
}
