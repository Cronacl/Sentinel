import "server-only";

import { and, eq } from "drizzle-orm";

import { decrypt, encrypt } from "@/lib/ai/providers/encrypt";
import { db } from "@/server/db";
import {
  integrationOAuthApps,
  integrationOAuthTokens,
  integrations,
} from "@/server/db/schema";
import type { IntegrationProvider } from "@/server/db/enums";

import { getGoogleOAuthConfig, isGoogleProvider } from "./providers/google";
import { isGitHubProvider } from "./providers/github";
import type { OAuthAppConfig } from "../types";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

async function resolveOAuthAppConfig(
  userId: string,
  provider: IntegrationProvider,
): Promise<OAuthAppConfig | null> {
  const byokApp = await db.query.integrationOAuthApps.findFirst({
    where: and(
      eq(integrationOAuthApps.userId, userId),
      eq(integrationOAuthApps.provider, provider),
    ),
  });

  if (!byokApp) return null;

  return {
    clientId: decrypt(byokApp.encryptedClientId),
    clientSecret: decrypt(byokApp.encryptedClientSecret),
    redirectUri: byokApp.redirectUri ?? "",
  };
}

async function refreshAccessToken(
  provider: IntegrationProvider,
  refreshToken: string,
  appConfig: OAuthAppConfig,
): Promise<{
  accessToken: string;
  expiresAt: Date | null;
}> {
  if (!isGoogleProvider(provider)) {
    throw new Error(`Token refresh not supported for provider: ${provider}`);
  }

  const oauthConfig = getGoogleOAuthConfig(provider);

  const response = await fetch(oauthConfig.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appConfig.clientId,
      client_secret: appConfig.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Token refresh failed: ${errorBody}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
  };
}

export async function getValidAccessToken(
  integrationId: string,
): Promise<string> {
  const tokenRow = await db.query.integrationOAuthTokens.findFirst({
    where: eq(integrationOAuthTokens.integrationId, integrationId),
  });

  if (!tokenRow) {
    throw new Error("No OAuth tokens found for this integration.");
  }

  const integration = await db.query.integrations.findFirst({
    where: eq(integrations.id, integrationId),
  });

  if (!integration) {
    throw new Error("Integration not found.");
  }

  // GitHub tokens don't expire -- always return the stored token
  if (isGitHubProvider(integration.provider)) {
    return decrypt(tokenRow.encryptedAccessToken);
  }

  const isExpired =
    tokenRow.expiresAt &&
    tokenRow.expiresAt.getTime() < Date.now() + TOKEN_REFRESH_BUFFER_MS;

  if (!isExpired) {
    return decrypt(tokenRow.encryptedAccessToken);
  }

  if (!tokenRow.encryptedRefreshToken) {
    throw new Error(
      "Access token expired and no refresh token available. Please reconnect the integration.",
    );
  }

  const appConfig = await resolveOAuthAppConfig(
    integration.userId,
    integration.provider,
  );

  if (!appConfig) {
    throw new Error(
      "No OAuth app configuration found. Please reconfigure in Settings > Integrations.",
    );
  }

  const refreshToken = decrypt(tokenRow.encryptedRefreshToken);
  const refreshed = await refreshAccessToken(
    integration.provider,
    refreshToken,
    appConfig,
  );

  await db
    .update(integrationOAuthTokens)
    .set({
      encryptedAccessToken: encrypt(refreshed.accessToken),
      expiresAt: refreshed.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(integrationOAuthTokens.id, tokenRow.id));

  return refreshed.accessToken;
}

export async function revokeTokens(integrationId: string): Promise<void> {
  const tokenRow = await db.query.integrationOAuthTokens.findFirst({
    where: eq(integrationOAuthTokens.integrationId, integrationId),
  });

  if (tokenRow) {
    const integration = await db.query.integrations.findFirst({
      where: eq(integrations.id, integrationId),
    });

    if (integration) {
      try {
        if (isGoogleProvider(integration.provider)) {
          const oauthConfig = getGoogleOAuthConfig(integration.provider);
          if (oauthConfig.revokeEndpoint) {
            const accessToken = decrypt(tokenRow.encryptedAccessToken);
            await fetch(
              `${oauthConfig.revokeEndpoint}?token=${encodeURIComponent(accessToken)}`,
              { method: "POST" },
            );
          }
        } else if (isGitHubProvider(integration.provider)) {
          const appConfig = await resolveOAuthAppConfig(
            integration.userId,
            integration.provider,
          );
          if (appConfig) {
            const accessToken = decrypt(tokenRow.encryptedAccessToken);
            await fetch(
              `https://api.github.com/applications/${appConfig.clientId}/token`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Basic ${Buffer.from(`${appConfig.clientId}:${appConfig.clientSecret}`).toString("base64")}`,
                  Accept: "application/vnd.github+json",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ access_token: accessToken }),
              },
            );
          }
        }
      } catch {
        // Best-effort revocation
      }
    }

    await db
      .delete(integrationOAuthTokens)
      .where(eq(integrationOAuthTokens.integrationId, integrationId));
  }
}
