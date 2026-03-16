import "server-only";

import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { encrypt, decrypt } from "@/lib/ai/providers/encrypt";
import { buildIntegrationOAuthRedirectUri } from "@/lib/app-origin";
import { db } from "@/server/db";
import {
  integrationOAuthApps,
  integrationOAuthTokens,
  integrations,
} from "@/server/db/schema";
import type { IntegrationProvider } from "@/server/db/enums";

import { getGoogleOAuthConfig, isGoogleProvider } from "./providers/google";
import { getGitHubOAuthConfig, isGitHubProvider } from "./providers/github";
import type {
  OAuthAppConfig,
  OAuthProviderConfig,
  OAuthTokenResult,
} from "../types";

function resolveOAuthConfig(
  provider: IntegrationProvider,
): OAuthProviderConfig {
  if (isGoogleProvider(provider)) return getGoogleOAuthConfig(provider);
  if (isGitHubProvider(provider)) return getGitHubOAuthConfig();
  throw new Error(`No OAuth config for provider: ${provider}`);
}

function generateState(provider: IntegrationProvider, userId: string): string {
  const payload = JSON.stringify({
    provider,
    userId,
    nonce: randomBytes(16).toString("hex"),
  });
  return Buffer.from(payload).toString("base64url");
}

function parseState(state: string): {
  provider: IntegrationProvider;
  userId: string;
} {
  const payload = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
  return { provider: payload.provider, userId: payload.userId };
}

async function resolveOAuthAppConfig(
  userId: string,
  provider: IntegrationProvider,
): Promise<OAuthAppConfig> {
  const byokApp = await db.query.integrationOAuthApps.findFirst({
    where: and(
      eq(integrationOAuthApps.userId, userId),
      eq(integrationOAuthApps.provider, provider),
    ),
  });

  if (byokApp) {
    return {
      clientId: decrypt(byokApp.encryptedClientId),
      clientSecret: decrypt(byokApp.encryptedClientSecret),
      redirectUri: byokApp.redirectUri ?? buildIntegrationOAuthRedirectUri(),
    };
  }

  throw new Error(
    `No OAuth app configured for ${provider}. Add your OAuth client credentials in Settings > Integrations.`,
  );
}

export async function beginIntegrationOAuth(
  provider: IntegrationProvider,
  userId: string,
): Promise<string> {
  const oauthConfig = resolveOAuthConfig(provider);
  const appConfig = await resolveOAuthAppConfig(userId, provider);
  const state = generateState(provider, userId);

  const params = new URLSearchParams({
    client_id: appConfig.clientId,
    redirect_uri: appConfig.redirectUri,
    response_type: "code",
    scope: oauthConfig.scopes.join(" "),
    state,
  });

  if (isGoogleProvider(provider)) {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }

  return `${oauthConfig.authorizationEndpoint}?${params.toString()}`;
}

export async function completeIntegrationOAuth(
  code: string,
  state: string,
): Promise<void> {
  const { provider, userId } = parseState(state);
  const oauthConfig = resolveOAuthConfig(provider);
  const appConfig = await resolveOAuthAppConfig(userId, provider);

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (isGitHubProvider(provider)) {
    headers["Accept"] = "application/json";
  }

  const body = new URLSearchParams({
    client_id: appConfig.clientId,
    client_secret: appConfig.clientSecret,
    code,
    redirect_uri: appConfig.redirectUri,
  });

  if (isGoogleProvider(provider)) {
    body.set("grant_type", "authorization_code");
  }

  const tokenResponse = await fetch(oauthConfig.tokenEndpoint, {
    method: "POST",
    headers,
    body,
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(
      `Token exchange failed for redirect URI ${appConfig.redirectUri}: ${errorBody}`,
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (tokenData.error) {
    throw new Error(
      tokenData.error_description ?? tokenData.error,
    );
  }

  const tokens: OAuthTokenResult = {
    accessToken: tokenData.access_token,
    expiresAt: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null,
    refreshToken: tokenData.refresh_token ?? null,
    scope: tokenData.scope ?? oauthConfig.scopes.join(" "),
    tokenType: tokenData.token_type ?? "Bearer",
  };

  const existingIntegration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.userId, userId),
      eq(integrations.provider, provider),
    ),
  });

  let integrationId: string;

  if (existingIntegration) {
    integrationId = existingIntegration.id;
    await db
      .update(integrations)
      .set({ isEnabled: true, updatedAt: new Date() })
      .where(eq(integrations.id, integrationId));

    await db
      .delete(integrationOAuthTokens)
      .where(eq(integrationOAuthTokens.integrationId, integrationId));
  } else {
    const [inserted] = await db
      .insert(integrations)
      .values({ userId, provider, authType: "oauth" })
      .returning({ id: integrations.id });
    integrationId = inserted!.id;
  }

  await db.insert(integrationOAuthTokens).values({
    integrationId,
    encryptedAccessToken: encrypt(tokens.accessToken),
    encryptedRefreshToken: tokens.refreshToken
      ? encrypt(tokens.refreshToken)
      : null,
    tokenType: tokens.tokenType,
    scope: tokens.scope,
    expiresAt: tokens.expiresAt,
  });
}
