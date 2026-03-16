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
  "github",
  "linear",
  "notion",
  "postgresql",
  "mysql",
  "mongodb",
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
    availability: "ready",
    description:
      "Search pages, query databases, manage content blocks, and collaborate with comments in Notion from chat.",
    highlights: [
      "Search and browse pages and databases",
      "Create, update, and archive pages with rich content",
      "Query databases with filters and sorts",
      "Read and append content blocks, manage comments",
    ],
    requiredAccess: [
      "Read pages, databases, blocks, comments, and users",
      "Create and update pages, database entries, blocks, and comments",
      "Archive pages",
    ],
    setupHint:
      "Create a Notion Public Integration at notion.so/my-integrations, enable OAuth, and paste the Client ID and Client Secret.",
  },
  github: {
    availability: "ready",
    description:
      "Search repos, manage issues and pull requests, browse code, run workflows, and create releases from chat.",
    highlights: [
      "Search repos and code across GitHub",
      "Create, update, and close issues with comments",
      "Open, review, merge pull requests",
      "List branches, workflow runs, and releases",
    ],
    requiredAccess: [
      "Read repositories, issues, and pull requests",
      "Create and manage issues, PRs, branches, and releases",
      "Trigger and view GitHub Actions workflows",
    ],
    setupHint:
      "Create a GitHub OAuth App at github.com/settings/developers and paste the Client ID and Client Secret.",
  },
  linear: {
    availability: "ready",
    description:
      "Search and manage issues, projects, cycles, and teams in Linear from chat.",
    highlights: [
      "Search, create, and update issues with full detail",
      "Browse projects, teams, cycles, and workflow states",
      "Add comments and manage labels",
      "List workspace members and track progress",
    ],
    requiredAccess: [
      "Read issues, projects, teams, cycles, labels, and users",
      "Create and update issues, projects, comments, and labels",
      "Delete issues",
    ],
    setupHint:
      "Create a Linear OAuth2 Application at linear.app/settings/api and paste the Client ID and Client Secret.",
  },
  postgresql: {
    availability: "ready",
    description:
      "Query, explore schemas, and manage data in PostgreSQL databases from chat.",
    highlights: [
      "Browse databases, schemas, and table structures",
      "Execute SQL queries and view results in rich tables",
      "Run INSERT, UPDATE, DELETE with approval safeguards",
    ],
    requiredAccess: [
      "Connect to PostgreSQL with provided credentials",
      "Execute read and write SQL statements",
    ],
    setupHint:
      "Provide host, port, database, username, and password, or a connection URL.",
  },
  mysql: {
    availability: "ready",
    description:
      "Query, explore tables, and manage data in MySQL databases from chat.",
    highlights: [
      "Browse databases and table structures",
      "Execute SQL queries and view results in rich tables",
      "Run INSERT, UPDATE, DELETE with approval safeguards",
    ],
    requiredAccess: [
      "Connect to MySQL with provided credentials",
      "Execute read and write SQL statements",
    ],
    setupHint:
      "Provide host, port, database, username, and password, or a connection URL.",
  },
  mongodb: {
    availability: "ready",
    description:
      "Query, browse collections, and manage documents in MongoDB databases from chat.",
    highlights: [
      "Browse databases and collections",
      "Find, insert, update, and aggregate documents",
      "Run aggregation pipelines with rich result views",
    ],
    requiredAccess: [
      "Connect to MongoDB with provided credentials",
      "Execute read and write operations",
    ],
    setupHint:
      "Provide host, port, database, username, and password, or a connection URL.",
  },
};

export function isIntegrationSetupReady(
  provider: IntegrationProvider,
): boolean {
  return READY_INTEGRATION_PROVIDERS.has(provider);
}
