export const AI_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "google_vertex",
] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export const SEARCH_PROVIDERS = ["exa", "searxng"] as const;
export type SearchProviderId = (typeof SEARCH_PROVIDERS)[number];

export const PERSONALITY_PRESETS = [
  "friendly",
  "pragmatic",
  "analytical",
  "mentor",
] as const;
export type PersonalityPreset = (typeof PERSONALITY_PRESETS)[number];

export const PERMISSION_MODES = ["default", "full"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THREAD_LIST_ORGANIZE_BY = ["workspace", "chronological"] as const;
export type ThreadListOrganizeBy = (typeof THREAD_LIST_ORGANIZE_BY)[number];

export const THREAD_LIST_SORT_BY = ["created", "updated"] as const;
export type ThreadListSortBy = (typeof THREAD_LIST_SORT_BY)[number];

export const THREAD_MESSAGE_ROLES = ["system", "user", "assistant"] as const;
export type ThreadMessageRole = (typeof THREAD_MESSAGE_ROLES)[number];
