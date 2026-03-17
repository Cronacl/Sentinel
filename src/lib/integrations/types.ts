import type {
  DatabaseIntegrationProvider,
  IntegrationProvider,
} from "@/server/db/enums";

export type DatabaseConnectionConfig = {
  host: string;
  port: number;
  database?: string;
  username: string;
  password: string;
  connectionUrl?: string;
  useConnectionUrl: boolean;
  ssl: boolean;
  sslRejectUnauthorized?: boolean;
};

export type IntegrationContext = {
  tokens: Partial<Record<IntegrationProvider, string>>;
  databases: Partial<
    Record<DatabaseIntegrationProvider, DatabaseConnectionConfig>
  >;
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
