import type { IntegrationProvider } from "@/server/db/enums";

export type IntegrationAvailability = "ready" | "coming_soon";

export type IntegrationMetadata = {
  availability: IntegrationAvailability;
  description: string;
  highlights: readonly string[];
  requiredAccess: readonly string[];
  setupHint: string;
};

export const READY_INTEGRATION_PROVIDERS = new Set<IntegrationProvider>([
  "gmail",
  "google_calendar",
  "google_drive",
]);

export const INTEGRATION_METADATA: Record<
  IntegrationProvider,
  IntegrationMetadata
> = {
  gmail: {
    availability: "ready",
    description:
      "Search, read, draft, reply to, and organize email without leaving Sentinel.",
    highlights: [
      "Search across your inbox with natural language",
      "Draft, reply to, archive, and label messages",
    ],
    requiredAccess: [
      "Read messages, threads, and labels",
      "Send, draft, archive, trash, and manage labels",
    ],
    setupHint:
      "Use a Google Cloud OAuth client with the Gmail API enabled for your project.",
  },
  google_calendar: {
    availability: "ready",
    description:
      "Review schedules, check availability, and create or update events from chat.",
    highlights: [
      "Read calendars, events, and free/busy windows",
      "Create, update, and remove events",
    ],
    requiredAccess: [
      "Read calendars and events",
      "Create, update, and delete calendar events",
    ],
    setupHint:
      "Use a Google Cloud OAuth client with the Google Calendar API enabled for your project.",
  },
  google_drive: {
    availability: "ready",
    description:
      "Search, browse, upload, download, and organize files in Google Drive from chat.",
    highlights: [
      "Search and browse files and folders",
      "Upload local files and download Drive files to workspace",
      "Share, move, rename, and organize files",
    ],
    requiredAccess: [
      "Read files, folders, and metadata",
      "Upload, download, move, rename, trash, and share files",
    ],
    setupHint:
      "Use a Google Cloud OAuth client with the Google Drive API enabled for your project.",
  },
  slack: {
    availability: "coming_soon",
    description:
      "Slack integration is planned for channel search, message review, and team workflows.",
    highlights: [
      "Planned support for channels, threads, and messages",
      "Designed for direct team context inside Sentinel",
    ],
    requiredAccess: [],
    setupHint: "Slack connection flow is not available yet.",
  },
  notion: {
    availability: "coming_soon",
    description:
      "Notion integration is planned for knowledge base lookups and page workflows.",
    highlights: [
      "Planned workspace search and page retrieval",
      "Will support direct knowledge access from chat",
    ],
    requiredAccess: [],
    setupHint: "Notion connection flow is not available yet.",
  },
  github: {
    availability: "coming_soon",
    description:
      "GitHub integration is planned for repository context, issues, and pull requests.",
    highlights: [
      "Planned support for repos, issues, and PR workflows",
      "Will make external repository context available in chat",
    ],
    requiredAccess: [],
    setupHint: "GitHub connection flow is not available yet.",
  },
  linear: {
    availability: "coming_soon",
    description:
      "Linear integration is planned for issue tracking, triage, and planning workflows.",
    highlights: [
      "Planned support for projects, issues, and status updates",
      "Designed to keep planning workflows close to coding context",
    ],
    requiredAccess: [],
    setupHint: "Linear connection flow is not available yet.",
  },
};

export function isIntegrationSetupReady(
  provider: IntegrationProvider,
): boolean {
  return READY_INTEGRATION_PROVIDERS.has(provider);
}
