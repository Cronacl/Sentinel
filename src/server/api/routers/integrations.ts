import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { encrypt, decrypt } from "@/lib/ai/providers/encrypt";
import { buildIntegrationOAuthRedirectUri } from "@/lib/app-origin";
import { beginIntegrationOAuth } from "@/lib/integrations/oauth/flow";
import { revokeTokens } from "@/lib/integrations/oauth/token-manager";
import {
  INTEGRATION_PROVIDERS,
  type IntegrationProvider,
} from "@/server/db/enums";
import {
  integrationOAuthApps,
  integrationOAuthTokens,
  integrations,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const providerSchema = z.enum(INTEGRATION_PROVIDERS);

const INTEGRATION_LABELS: Record<IntegrationProvider, string> = {
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  google_drive: "Google Drive",
  slack: "Slack",
  notion: "Notion",
  github: "GitHub",
  linear: "Linear",
};

export const integrationsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const rows = await ctx.db.query.integrations.findMany({
      where: eq(integrations.userId, userId),
      with: { oauthTokens: { columns: { id: true, expiresAt: true } } },
    });

    const oauthApps = await ctx.db.query.integrationOAuthApps.findMany({
      where: eq(integrationOAuthApps.userId, userId),
      columns: { provider: true },
    });
    const configuredProviders = new Set(oauthApps.map((a) => a.provider));

    return INTEGRATION_PROVIDERS.map((provider) => {
      const row = rows.find((r) => r.provider === provider);
      const hasTokens = row?.oauthTokens && row.oauthTokens.length > 0;
      const hasOAuthApp = configuredProviders.has(provider);

      return {
        id: row?.id ?? null,
        provider,
        label: INTEGRATION_LABELS[provider],
        isConnected: Boolean(row && hasTokens),
        isEnabled: row?.isEnabled ?? false,
        hasOAuthApp,
        authType: row?.authType ?? "oauth",
      };
    });
  }),

  connect: protectedProcedure
    .input(z.object({ provider: providerSchema }))
    .mutation(async ({ ctx, input }) => {
      const authorizationUrl = await beginIntegrationOAuth(
        input.provider,
        ctx.session.user.id,
      );
      return { authorizationUrl };
    }),

  disconnect: protectedProcedure
    .input(z.object({ provider: providerSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const row = await ctx.db.query.integrations.findFirst({
        where: and(
          eq(integrations.userId, userId),
          eq(integrations.provider, input.provider),
        ),
      });

      if (row) {
        await revokeTokens(row.id);
        await ctx.db.delete(integrations).where(eq(integrations.id, row.id));
      }

      return { disconnected: true };
    }),

  toggle: protectedProcedure
    .input(
      z.object({
        provider: providerSchema,
        isEnabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await ctx.db
        .update(integrations)
        .set({ isEnabled: input.isEnabled, updatedAt: new Date() })
        .where(
          and(
            eq(integrations.userId, userId),
            eq(integrations.provider, input.provider),
          ),
        );

      return { isEnabled: input.isEnabled };
    }),

  getOAuthApp: protectedProcedure
    .input(z.object({ provider: providerSchema }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const row = await ctx.db.query.integrationOAuthApps.findFirst({
        where: and(
          eq(integrationOAuthApps.userId, userId),
          eq(integrationOAuthApps.provider, input.provider),
        ),
      });

      if (!row) return null;

      return {
        clientId: decrypt(row.encryptedClientId),
        redirectUri: row.redirectUri ?? buildIntegrationOAuthRedirectUri(),
        scopes: row.scopes,
        hasClientSecret: true,
      };
    }),

  upsertOAuthApp: protectedProcedure
    .input(
      z.object({
        provider: providerSchema,
        clientId: z.string().min(1),
        clientSecret: z.string().optional(),
        redirectUri: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const clientId = input.clientId.trim();
      const clientSecret = input.clientSecret?.trim();
      const redirectUri = input.redirectUri?.trim() || undefined;

      if (!clientId) {
        throw new Error("Client ID is required to configure this integration.");
      }

      const existing = await ctx.db.query.integrationOAuthApps.findFirst({
        where: and(
          eq(integrationOAuthApps.userId, userId),
          eq(integrationOAuthApps.provider, input.provider),
        ),
      });

      if (existing) {
        await ctx.db
          .update(integrationOAuthApps)
          .set({
            encryptedClientId: encrypt(clientId),
            encryptedClientSecret: clientSecret
              ? encrypt(clientSecret)
              : existing.encryptedClientSecret,
            redirectUri: redirectUri ?? existing.redirectUri ?? null,
            updatedAt: new Date(),
          })
          .where(eq(integrationOAuthApps.id, existing.id));
      } else {
        if (!clientSecret) {
          throw new Error(
            "Client secret is required to configure this integration.",
          );
        }

        await ctx.db.insert(integrationOAuthApps).values({
          userId,
          provider: input.provider,
          encryptedClientId: encrypt(clientId),
          encryptedClientSecret: encrypt(clientSecret),
          redirectUri,
        });
      }

      return { saved: true };
    }),

  deleteOAuthApp: protectedProcedure
    .input(z.object({ provider: providerSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await ctx.db
        .delete(integrationOAuthApps)
        .where(
          and(
            eq(integrationOAuthApps.userId, userId),
            eq(integrationOAuthApps.provider, input.provider),
          ),
        );

      return { deleted: true };
    }),
});
