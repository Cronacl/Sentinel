import type { IntegrationProvider } from "@/server/db/enums";

export type IntegrationContext = {
  tokens: Partial<Record<IntegrationProvider, string>>;
};

export type OAuthAppConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type OAuthProviderConfig = {
  authorizationEndpoint: string;
  provider: IntegrationProvider;
  revokeEndpoint?: string;
  scopes: string[];
  tokenEndpoint: string;
};

export type OAuthTokenResult = {
  accessToken: string;
  expiresAt: Date | null;
  refreshToken: string | null;
  scope: string;
  tokenType: string;
};
