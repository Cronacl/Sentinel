import "server-only";

import { and, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

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
import { getLinearOAuthConfig, isLinearProvider } from "./providers/linear";
import { getNotionOAuthConfig, isNotionProvider } from "./providers/notion";
import { getSlackOAuthConfig, isSlackProvider } from "./providers/slack";
import {
  getAirtableOAuthConfig,
  isAirtableProvider,
} from "./providers/airtable";
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
  if (isLinearProvider(provider)) return getLinearOAuthConfig();
  if (isNotionProvider(provider)) return getNotionOAuthConfig();
  if (isSlackProvider(provider)) return getSlackOAuthConfig();
  if (isAirtableProvider(provider)) return getAirtableOAuthConfig();
  throw new Error(`No OAuth config for provider: ${provider}`);
}

function generateState(
  provider: IntegrationProvider,
  userId: string,
  codeVerifier?: string,
): string {
  const payload: Record<string, string> = {
    provider,
    userId,
    nonce: randomBytes(16).toString("hex"),
  };
  if (codeVerifier) payload.codeVerifier = codeVerifier;
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function parseState(state: string): {
  provider: IntegrationProvider;
  userId: string;
  codeVerifier?: string;
} {
  const payload = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
  return {
    provider: payload.provider,
    userId: payload.userId,
    codeVerifier: payload.codeVerifier,
  };
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

  const scopeSeparator =
    isLinearProvider(provider) || isSlackProvider(provider) ? "," : " ";
  const scopeString = oauthConfig.scopes.join(scopeSeparator);

  let codeVerifier: string | undefined;
  if (isAirtableProvider(provider)) {
    codeVerifier = randomBytes(32).toString("base64url");
  }

  const state = generateState(provider, userId, codeVerifier);

  const params = new URLSearchParams({
    client_id: appConfig.clientId,
    redirect_uri: appConfig.redirectUri,
    response_type: "code",
    state,
  });

  if (isSlackProvider(provider)) {
    params.set("user_scope", scopeString);
  } else {
    params.set("scope", scopeString);
  }

  if (isGoogleProvider(provider)) {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }

  if (isNotionProvider(provider)) {
    params.set("owner", "user");
  }

  if (isAirtableProvider(provider) && codeVerifier) {
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  return `${oauthConfig.authorizationEndpoint}?${params.toString()}`;
}

export async function completeIntegrationOAuth(
  code: string,
  state: string,
): Promise<void> {
  const { provider, userId, codeVerifier } = parseState(state);
  const oauthConfig = resolveOAuthConfig(provider);
  const appConfig = await resolveOAuthAppConfig(userId, provider);

  const usesBasicAuth =
    isNotionProvider(provider) || isAirtableProvider(provider);

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (isGitHubProvider(provider)) {
    headers["Accept"] = "application/json";
  }

  if (usesBasicAuth) {
    headers["Authorization"] =
      `Basic ${Buffer.from(`${appConfig.clientId}:${appConfig.clientSecret}`).toString("base64")}`;
  }

  const body = new URLSearchParams({
    code,
    redirect_uri: appConfig.redirectUri,
  });

  if (!usesBasicAuth) {
    body.set("client_id", appConfig.clientId);
    body.set("client_secret", appConfig.clientSecret);
  }

  if (
    isGoogleProvider(provider) ||
    isLinearProvider(provider) ||
    usesBasicAuth
  ) {
    body.set("grant_type", "authorization_code");
  }

  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
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
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
    ok?: boolean;
    authed_user?: {
      access_token?: string;
      scope?: string;
      token_type?: string;
    };
  };

  if (tokenData.error) {
    throw new Error(tokenData.error_description ?? tokenData.error);
  }

  // Slack V2 OAuth returns the user token under authed_user
  const accessToken = isSlackProvider(provider)
    ? tokenData.authed_user?.access_token
    : tokenData.access_token;

  if (!accessToken) {
    throw new Error("No access token returned from token exchange.");
  }

  const tokens: OAuthTokenResult = {
    accessToken,
    expiresAt: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null,
    refreshToken: tokenData.refresh_token ?? null,
    scope:
      (isSlackProvider(provider)
        ? tokenData.authed_user?.scope
        : tokenData.scope) ??
      oauthConfig.scopes.join(
        isLinearProvider(provider) || isSlackProvider(provider) ? "," : " ",
      ),
    tokenType:
      (isSlackProvider(provider)
        ? tokenData.authed_user?.token_type
        : tokenData.token_type) ?? "Bearer",
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
