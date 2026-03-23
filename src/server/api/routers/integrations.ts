import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { encrypt, decrypt } from "@/lib/ai/providers/encrypt";
import { buildIntegrationOAuthRedirectUri } from "@/lib/app-origin";
import { beginIntegrationOAuth } from "@/lib/integrations/oauth/flow";
import { revokeTokens } from "@/lib/integrations/oauth/token-manager";
import {
  AUTHLESS_INTEGRATION_PROVIDERS,
  DATABASE_INTEGRATION_PROVIDERS,
  INTEGRATION_PROVIDERS,
  type AuthlessIntegrationProvider,
  type DatabaseIntegrationProvider,
  type IntegrationProvider,
} from "@/server/db/enums";
import {
  integrationDatabaseConfigs,
  integrationOAuthApps,
  integrationOAuthTokens,
  integrations,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { PostgreSQLService } from "@/lib/integrations/providers/postgresql/service";
import { MySQLService } from "@/lib/integrations/providers/mysql/service";
import { MongoDBService } from "@/lib/integrations/providers/mongodb/service";
import type { DatabaseConnectionConfig } from "@/lib/integrations/types";

const providerSchema = z.enum(INTEGRATION_PROVIDERS);
const dbProviderSchema = z.enum(DATABASE_INTEGRATION_PROVIDERS);
const authlessProviderSchema = z.enum(AUTHLESS_INTEGRATION_PROVIDERS);

function isDatabaseProvider(
  provider: string,
): provider is DatabaseIntegrationProvider {
  return (DATABASE_INTEGRATION_PROVIDERS as readonly string[]).includes(
    provider,
  );
}

function isAuthlessProvider(
  provider: string,
): provider is AuthlessIntegrationProvider {
  return (AUTHLESS_INTEGRATION_PROVIDERS as readonly string[]).includes(
    provider,
  );
}

const INTEGRATION_LABELS: Record<IntegrationProvider, string> = {
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  google_drive: "Google Drive",
  airtable: "Airtable",
  slack: "Slack",
  notion: "Notion",
  github: "GitHub",
  linear: "Linear",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  yahoo_finance: "Yahoo Finance",
  arxiv: "arXiv",
  pubmed: "PubMed",
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

    const dbConfigs = await ctx.db.query.integrationDatabaseConfigs.findMany({
      columns: { integrationId: true },
    });
    const dbConfigIntegrationIds = new Set(
      dbConfigs.map((c) => c.integrationId),
    );

    return INTEGRATION_PROVIDERS.map((provider) => {
      const row = rows.find((r) => r.provider === provider);
      const hasTokens = row?.oauthTokens && row.oauthTokens.length > 0;
      const hasOAuthApp = configuredProviders.has(provider);
      const hasDbConfig = row ? dbConfigIntegrationIds.has(row.id) : false;

      const isConnected = isAuthlessProvider(provider)
        ? Boolean(row)
        : isDatabaseProvider(provider)
          ? Boolean(row && hasDbConfig)
          : Boolean(row && hasTokens);

      return {
        id: row?.id ?? null,
        provider,
        label: INTEGRATION_LABELS[provider],
        isConnected,
        isEnabled: row?.isEnabled ?? false,
        hasOAuthApp,
        hasDbConfig,
        authType:
          row?.authType ??
          (isAuthlessProvider(provider)
            ? "none"
            : isDatabaseProvider(provider)
              ? "connection_config"
              : "oauth"),
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

  getDatabaseConfig: protectedProcedure
    .input(z.object({ provider: dbProviderSchema }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const integration = await ctx.db.query.integrations.findFirst({
        where: and(
          eq(integrations.userId, userId),
          eq(integrations.provider, input.provider),
        ),
      });

      if (!integration) return null;

      const config = await ctx.db.query.integrationDatabaseConfigs.findFirst({
        where: eq(integrationDatabaseConfigs.integrationId, integration.id),
      });

      if (!config) return null;

      return {
        host: decrypt(config.encryptedHost),
        port: decrypt(config.encryptedPort),
        database: config.encryptedDatabase
          ? decrypt(config.encryptedDatabase)
          : "",
        username: decrypt(config.encryptedUsername),
        connectionUrl: config.encryptedConnectionUrl
          ? decrypt(config.encryptedConnectionUrl)
          : "",
        useConnectionUrl: config.useConnectionUrl,
        ssl: config.ssl,
        hasPassword: true,
      };
    }),

  saveDatabaseConfig: protectedProcedure
    .input(
      z.object({
        provider: dbProviderSchema,
        host: z.string().default(""),
        port: z.string().default(""),
        database: z.string().optional(),
        username: z.string().default(""),
        password: z.string().optional(),
        connectionUrl: z.string().optional(),
        useConnectionUrl: z.boolean().default(false),
        ssl: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (input.useConnectionUrl) {
        if (!input.connectionUrl) {
          throw new Error("Connection URL is required.");
        }
      } else {
        if (!input.host) throw new Error("Host is required.");
        if (!input.port) throw new Error("Port is required.");
        if (!input.username) throw new Error("Username is required.");
      }

      let integration = await ctx.db.query.integrations.findFirst({
        where: and(
          eq(integrations.userId, userId),
          eq(integrations.provider, input.provider),
        ),
      });

      if (!integration) {
        const [created] = await ctx.db
          .insert(integrations)
          .values({
            userId,
            provider: input.provider,
            authType: "connection_config",
            isEnabled: true,
          })
          .returning();
        integration = created!;
      }

      const existing = await ctx.db.query.integrationDatabaseConfigs.findFirst({
        where: eq(integrationDatabaseConfigs.integrationId, integration.id),
      });

      const values = {
        encryptedHost: encrypt(input.host || ""),
        encryptedPort: encrypt(input.port || ""),
        encryptedDatabase: input.database ? encrypt(input.database) : null,
        encryptedUsername: encrypt(input.username || ""),
        encryptedPassword: input.password
          ? encrypt(input.password)
          : (existing?.encryptedPassword ?? encrypt("")),
        encryptedConnectionUrl: input.connectionUrl
          ? encrypt(input.connectionUrl)
          : null,
        useConnectionUrl: input.useConnectionUrl,
        ssl: input.ssl,
        updatedAt: new Date(),
      };

      if (existing) {
        await ctx.db
          .update(integrationDatabaseConfigs)
          .set(values)
          .where(eq(integrationDatabaseConfigs.id, existing.id));
      } else {
        await ctx.db.insert(integrationDatabaseConfigs).values({
          ...values,
          integrationId: integration.id,
        });
      }

      await ctx.db
        .update(integrations)
        .set({ isEnabled: true, updatedAt: new Date() })
        .where(eq(integrations.id, integration.id));

      return { saved: true };
    }),

  testDatabaseConnection: protectedProcedure
    .input(
      z.object({
        provider: dbProviderSchema,
        host: z.string().default(""),
        port: z.string().default(""),
        database: z.string().optional(),
        username: z.string().default(""),
        password: z.string().default(""),
        connectionUrl: z.string().optional(),
        useConnectionUrl: z.boolean().default(false),
        ssl: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const config: DatabaseConnectionConfig = {
        host: input.host || "",
        port: Number(input.port) || 0,
        database: input.database || undefined,
        username: input.username || "",
        password: input.password || "",
        connectionUrl: input.connectionUrl || undefined,
        useConnectionUrl: input.useConnectionUrl,
        ssl: input.ssl,
      };

      switch (input.provider) {
        case "postgresql": {
          const service = new PostgreSQLService(config);
          return service.testConnection();
        }
        case "mysql": {
          const service = new MySQLService(config);
          return service.testConnection();
        }
        case "mongodb": {
          const service = new MongoDBService(config);
          return service.testConnection();
        }
        default:
          return { success: false, error: "Unknown database provider" };
      }
    }),

  removeDatabaseConfig: protectedProcedure
    .input(z.object({ provider: dbProviderSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const integration = await ctx.db.query.integrations.findFirst({
        where: and(
          eq(integrations.userId, userId),
          eq(integrations.provider, input.provider),
        ),
      });

      if (integration) {
        await ctx.db
          .delete(integrationDatabaseConfigs)
          .where(eq(integrationDatabaseConfigs.integrationId, integration.id));
        await ctx.db
          .delete(integrations)
          .where(eq(integrations.id, integration.id));
      }

      return { removed: true };
    }),

  enableAuthless: protectedProcedure
    .input(z.object({ provider: authlessProviderSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const existing = await ctx.db.query.integrations.findFirst({
        where: and(
          eq(integrations.userId, userId),
          eq(integrations.provider, input.provider),
        ),
      });

      if (existing) {
        await ctx.db
          .update(integrations)
          .set({ isEnabled: true, updatedAt: new Date() })
          .where(eq(integrations.id, existing.id));
      } else {
        await ctx.db.insert(integrations).values({
          userId,
          provider: input.provider,
          authType: "none",
          isEnabled: true,
        });
      }

      return { enabled: true };
    }),

  disableAuthless: protectedProcedure
    .input(z.object({ provider: authlessProviderSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const existing = await ctx.db.query.integrations.findFirst({
        where: and(
          eq(integrations.userId, userId),
          eq(integrations.provider, input.provider),
        ),
      });

      if (existing) {
        await ctx.db
          .delete(integrations)
          .where(eq(integrations.id, existing.id));
      }

      return { disabled: true };
    }),
});
