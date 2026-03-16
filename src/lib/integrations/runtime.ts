import "server-only";

import { and, eq } from "drizzle-orm";

import { decrypt } from "@/lib/ai/providers/encrypt";
import { db } from "@/server/db";
import {
  integrationDatabaseConfigs,
  integrations,
} from "@/server/db/schema";
import type {
  DatabaseIntegrationProvider,
  IntegrationProvider,
} from "@/server/db/enums";
import { DATABASE_INTEGRATION_PROVIDERS } from "@/server/db/enums";
import { getValidAccessToken } from "./oauth/token-manager";
import type { DatabaseConnectionConfig, IntegrationContext } from "./types";

export type EnabledIntegration = {
  id: string;
  provider: IntegrationProvider;
  isEnabled: boolean;
};

const INTEGRATION_LABELS: Partial<Record<IntegrationProvider, string>> = {
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  google_drive: "Google Drive",
  slack: "Slack",
  notion: "Notion",
  github: "GitHub",
  linear: "Linear",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
};

const INTEGRATION_TOOL_COUNTS: Partial<Record<IntegrationProvider, number>> = {
  gmail: 16,
  google_calendar: 11,
  google_drive: 10,
  github: 23,
  linear: 20,
  postgresql: 6,
  mysql: 5,
  mongodb: 11,
};

function isDatabaseProvider(
  provider: string,
): provider is DatabaseIntegrationProvider {
  return (DATABASE_INTEGRATION_PROVIDERS as readonly string[]).includes(
    provider,
  );
}

export async function getEnabledIntegrations(
  userId: string,
): Promise<EnabledIntegration[]> {
  const rows = await db.query.integrations.findMany({
    where: and(
      eq(integrations.userId, userId),
      eq(integrations.isEnabled, true),
    ),
    columns: {
      id: true,
      provider: true,
      isEnabled: true,
    },
  });

  return rows;
}

async function loadDatabaseConfig(
  integrationId: string,
): Promise<DatabaseConnectionConfig | null> {
  const row = await db.query.integrationDatabaseConfigs.findFirst({
    where: eq(integrationDatabaseConfigs.integrationId, integrationId),
  });

  if (!row) return null;

  return {
    host: decrypt(row.encryptedHost),
    port: Number(decrypt(row.encryptedPort)),
    database: row.encryptedDatabase ? decrypt(row.encryptedDatabase) : undefined,
    username: decrypt(row.encryptedUsername),
    password: decrypt(row.encryptedPassword),
    connectionUrl: row.encryptedConnectionUrl
      ? decrypt(row.encryptedConnectionUrl)
      : undefined,
    useConnectionUrl: row.useConnectionUrl,
    ssl: row.ssl,
  };
}

export async function buildIntegrationContext(
  enabledIntegrations: EnabledIntegration[],
): Promise<IntegrationContext> {
  const tokens: Partial<Record<IntegrationProvider, string>> = {};
  const databases: Partial<
    Record<DatabaseIntegrationProvider, DatabaseConnectionConfig>
  > = {};

  await Promise.all(
    enabledIntegrations.map(async (integration) => {
      if (isDatabaseProvider(integration.provider)) {
        try {
          const config = await loadDatabaseConfig(integration.id);
          if (config) {
            databases[integration.provider] = config;
          }
        } catch {
          // Skip database integrations with invalid configs
        }
      } else {
        try {
          const token = await getValidAccessToken(integration.id);
          tokens[integration.provider] = token;
        } catch {
          // Skip integrations with expired/invalid tokens
        }
      }
    }),
  );

  return { tokens, databases };
}

export function getIntegrationLabel(provider: IntegrationProvider): string {
  return INTEGRATION_LABELS[provider] ?? provider;
}

export function getIntegrationToolCount(provider: IntegrationProvider): number {
  return INTEGRATION_TOOL_COUNTS[provider] ?? 0;
}
