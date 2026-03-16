import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { integrations } from "@/server/db/schema";
import type { IntegrationProvider } from "@/server/db/enums";
import { getValidAccessToken } from "./oauth/token-manager";
import type { IntegrationContext } from "./types";

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
};

const INTEGRATION_TOOL_COUNTS: Partial<Record<IntegrationProvider, number>> = {
  gmail: 16,
  google_calendar: 11,
  google_drive: 10,
};

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

export async function buildIntegrationContext(
  enabledIntegrations: EnabledIntegration[],
): Promise<IntegrationContext> {
  const tokens: Partial<Record<IntegrationProvider, string>> = {};

  await Promise.all(
    enabledIntegrations.map(async (integration) => {
      try {
        const token = await getValidAccessToken(integration.id);
        tokens[integration.provider] = token;
      } catch {
        // Skip integrations with expired/invalid tokens
      }
    }),
  );

  return { tokens };
}

export function getIntegrationLabel(provider: IntegrationProvider): string {
  return INTEGRATION_LABELS[provider] ?? provider;
}

export function getIntegrationToolCount(provider: IntegrationProvider): number {
  return INTEGRATION_TOOL_COUNTS[provider] ?? 0;
}
