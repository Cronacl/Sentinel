export const AI_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "google_vertex",
  "vercel",
  "xai",
  "black_forest_labs",
  "klingai",
  "bytedance",
  "fal",
  "replicate",
  "azure",
  "amazon_bedrock",
  "groq",
  "cohere",
  "moonshotai",
  "mistral",
  "ollama",
  "openrouter",
] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export const CHAT_ENGINES = [
  "sentinel",
  "codex",
  "claude",
  "copilot",
  "cursor",
  "opencode",
] as const;
export type ChatEngine = (typeof CHAT_ENGINES)[number];

export const SEARCH_PROVIDERS = ["exa", "searxng"] as const;
export type SearchProviderId = (typeof SEARCH_PROVIDERS)[number];

export const MCP_TRANSPORTS = ["stdio", "http"] as const;
export type MCPTransportId = (typeof MCP_TRANSPORTS)[number];

export const MCP_SERVER_CATALOG_IDS = [
  "linear",
  "notion",
  "figma",
  "git",
  "playwright",
] as const;
export type McpServerCatalogId = (typeof MCP_SERVER_CATALOG_IDS)[number];

export const PERSONALITY_PRESETS = [
  "friendly",
  "pragmatic",
  "analytical",
  "mentor",
] as const;
export type PersonalityPreset = (typeof PERSONALITY_PRESETS)[number];

export const PERMISSION_MODES = ["default", "full"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const WORKSPACE_KINDS = ["project", "quick_chat"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THREAD_LIST_ORGANIZE_BY = ["workspace", "chronological"] as const;
export type ThreadListOrganizeBy = (typeof THREAD_LIST_ORGANIZE_BY)[number];

export const THREAD_LIST_SORT_BY = ["created", "updated"] as const;
export type ThreadListSortBy = (typeof THREAD_LIST_SORT_BY)[number];

export const THREAD_MESSAGE_ROLES = ["system", "user", "assistant"] as const;
export type ThreadMessageRole = (typeof THREAD_MESSAGE_ROLES)[number];

export const THREAD_MODES = ["chat", "plan"] as const;
export type ThreadMode = (typeof THREAD_MODES)[number];

export const THREAD_STATUSES = [
  "idle",
  "streaming",
  "awaiting_approval",
] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const THREAD_VISIBILITIES = ["visible", "virtual"] as const;
export type ThreadVisibility = (typeof THREAD_VISIBILITIES)[number];

export const THREAD_PLAN_TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "blocked",
] as const;
export type ThreadPlanTaskStatus = (typeof THREAD_PLAN_TASK_STATUSES)[number];

export const THREAD_PLAN_QUESTION_STATUSES = [
  "pending",
  "answered",
  "cancelled",
] as const;
export type ThreadPlanQuestionStatus =
  (typeof THREAD_PLAN_QUESTION_STATUSES)[number];

export const THREAD_PLAN_AUDIENCES = ["technical", "general"] as const;
export type ThreadPlanAudience = (typeof THREAD_PLAN_AUDIENCES)[number];

export const SCRATCHPAD_TASK_STATUSES = [
  "pending",
  "running",
  "completed",
  "blocked",
  "failed",
] as const;
export type ScratchpadTaskStatus = (typeof SCRATCHPAD_TASK_STATUSES)[number];

export const FOLLOW_UP_BEHAVIORS = ["queue", "steer"] as const;
export type FollowUpBehavior = (typeof FOLLOW_UP_BEHAVIORS)[number];

export const THREAD_FOLLOW_UP_STATUSES = ["queued", "processing"] as const;
export type ThreadFollowUpStatus = (typeof THREAD_FOLLOW_UP_STATUSES)[number];

export const AUTOMATION_STATUSES = ["active", "paused"] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

export const AUTOMATION_SCHEDULE_TYPES = [
  "hourly",
  "daily",
  "weekly",
  "weekdays",
  "custom",
] as const;
export type AutomationScheduleType = (typeof AUTOMATION_SCHEDULE_TYPES)[number];

export const AUTOMATION_RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export const AUTOMATION_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;
export type AutomationReasoningEffort =
  (typeof AUTOMATION_REASONING_EFFORTS)[number];

export const INTEGRATION_PROVIDERS = [
  "gmail",
  "google_calendar",
  "google_drive",
  "airtable",
  "slack",
  "notion",
  "github",
  "linear",
  "postgresql",
  "mysql",
  "mongodb",
  "yahoo_finance",
  "arxiv",
  "pubmed",
] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const DATABASE_INTEGRATION_PROVIDERS = [
  "postgresql",
  "mysql",
  "mongodb",
] as const;
export type DatabaseIntegrationProvider =
  (typeof DATABASE_INTEGRATION_PROVIDERS)[number];

export const AUTHLESS_INTEGRATION_PROVIDERS = [
  "yahoo_finance",
  "arxiv",
  "pubmed",
] as const;
export type AuthlessIntegrationProvider =
  (typeof AUTHLESS_INTEGRATION_PROVIDERS)[number];

export const INTEGRATION_AUTH_TYPES = [
  "oauth",
  "api_key",
  "bearer_token",
  "connection_config",
  "none",
] as const;
export type IntegrationAuthType = (typeof INTEGRATION_AUTH_TYPES)[number];
