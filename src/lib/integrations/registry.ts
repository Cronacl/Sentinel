import type { ToolSet } from "ai";

import type { IntegrationProvider } from "@/server/db/enums";
import type { IntegrationContext } from "./types";

type ToolBuilder = (
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) => ToolSet;

const PROVIDER_TOOL_LOADERS: Partial<
  Record<IntegrationProvider, () => Promise<ToolBuilder>>
> = {
  gmail: async () => {
    const { buildGmailTools } = await import("./providers/gmail/tools");
    return buildGmailTools;
  },
  google_calendar: async () => {
    const { buildGoogleCalendarTools } = await import(
      "./providers/google-calendar/tools"
    );
    return buildGoogleCalendarTools;
  },
  google_drive: async () => {
    const { buildGoogleDriveTools } = await import(
      "./providers/google-drive/tools"
    );
    return buildGoogleDriveTools;
  },
  github: async () => {
    const { buildGitHubTools } = await import("./providers/github/tools");
    return buildGitHubTools;
  },
  linear: async () => {
    const { buildLinearTools } = await import("./providers/linear/tools");
    return buildLinearTools;
  },
};

export async function loadIntegrationTools(
  enabledProviders: IntegrationProvider[],
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
): Promise<ToolSet> {
  const allTools: ToolSet = {};

  await Promise.all(
    enabledProviders.map(async (provider) => {
      const loader = PROVIDER_TOOL_LOADERS[provider];
      if (!loader) return;

      const builder = await loader();
      const tools = builder(context, approvalFn);
      Object.assign(allTools, tools);
    }),
  );

  return allTools;
}
