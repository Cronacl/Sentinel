import { relations } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

import {
  AI_PROVIDERS,
  AUTOMATION_REASONING_EFFORTS,
  AUTOMATION_RUN_STATUSES,
  AUTOMATION_SCHEDULE_TYPES,
  AUTOMATION_STATUSES,
  CHAT_ENGINES,
  FOLLOW_UP_BEHAVIORS,
  THREAD_FOLLOW_UP_STATUSES,
  INTEGRATION_AUTH_TYPES,
  INTEGRATION_PROVIDERS,
  MCP_SERVER_CATALOG_IDS,
  MCP_TRANSPORTS,
  PERMISSION_MODES,
  PERSONALITY_PRESETS,
  SEARCH_PROVIDERS,
  THEME_PREFERENCES,
  THREAD_LIST_ORGANIZE_BY,
  THREAD_LIST_SORT_BY,
  THREAD_PLAN_AUDIENCES,
  THREAD_MESSAGE_ROLES,
  THREAD_MODES,
  THREAD_PLAN_QUESTION_STATUSES,
  THREAD_PLAN_TASK_STATUSES,
  THREAD_STATUSES,
} from "./enums";
import type { ShortcutOverrides } from "@/lib/shortcuts/schema";

export const users = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    image: text("image"),
    nickname: text("nickname"),
    occupation: text("occupation"),
    aboutUser: text("about_user"),
    personalityPreset: text("personality_preset", {
      enum: PERSONALITY_PRESETS,
    })
      .notNull()
      .default("pragmatic"),
    customInstructions: text("custom_instructions"),
    permissionMode: text("permission_mode", { enum: PERMISSION_MODES })
      .notNull()
      .default("default"),
    persistBrowserSession: integer("persist_browser_session", {
      mode: "boolean",
    })
      .notNull()
      .default(true),
    webFetchBatchEnabled: integer("webfetch_batch_enabled", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    webFetchBatchLimit: integer("webfetch_batch_limit").notNull().default(10),
    contextCompactionEnabled: integer("context_compaction_enabled", {
      mode: "boolean",
    }),
    contextCompactionUseFixedWindow: integer(
      "context_compaction_use_fixed_window",
      {
        mode: "boolean",
      },
    ),
    contextCompactionFixedWindowSize: integer(
      "context_compaction_fixed_window_size",
    ),
    contextCompactionWindowPercent: integer(
      "context_compaction_window_percent",
    ),
    skillsBasePath: text("skills_base_path"),
    themePreference: text("theme_preference", { enum: THEME_PREFERENCES })
      .notNull()
      .default("system"),
    codeTheme: text("code_theme"),
    uiFontFamily: text("ui_font_family"),
    codeFontFamily: text("code_font_family"),
    uiFontSize: real("ui_font_size"),
    codeFontSize: real("code_font_size"),
    defaultChatEngine: text("default_chat_engine", { enum: CHAT_ENGINES }),
    defaultChatModelId: text("default_chat_model_id"),
    defaultChatMode: text("default_chat_mode", { enum: THREAD_MODES }),
    defaultChatReasoningEffort: text("default_chat_reasoning_effort"),
    shortcutOverrides: text("shortcut_overrides", {
      mode: "json",
    }).$type<ShortcutOverrides | null>(),
    followUpBehavior: text("follow_up_behavior", {
      enum: FOLLOW_UP_BEHAVIORS,
    })
      .notNull()
      .default("queue"),
    selectedWorkspaceId: text("selected_workspace_id"),
    lastProjectOpenTargetId: text("last_project_open_target_id"),
    threadListOrganizeBy: text("thread_list_organize_by", {
      enum: THREAD_LIST_ORGANIZE_BY,
    })
      .notNull()
      .default("workspace"),
    threadListSortBy: text("thread_list_sort_by", {
      enum: THREAD_LIST_SORT_BY,
    })
      .notNull()
      .default("updated"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("user_email_unique").on(table.email),
    index("user_selected_workspace_idx").on(table.selectedWorkspaceId),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  selectedWorkspace: one(workspaces, {
    fields: [users.selectedWorkspaceId],
    references: [workspaces.id],
    relationName: "selectedWorkspace",
  }),
  ownedWorkspaces: many(workspaces, { relationName: "ownedWorkspaces" }),
  threads: many(threads),
  credentials: many(providerCredentials),
  mcpServerConfigs: many(mcpServerConfigs),
  modelPreferences: many(modelPreferences),
  searchProviderConfigs: many(searchProviderConfigs),
  searchSettings: many(searchSettings),
  memorySettings: many(memorySettings),
  toolApprovalPolicies: many(toolApprovalPolicies),
  automations: many(automations),
  integrations: many(integrations),
  integrationOAuthApps: many(integrationOAuthApps),
}));

export const workspaces = sqliteTable(
  "workspace",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    rootPath: text("root_path"),
    description: text("description"),
    permissionModeOverride: text("permission_mode_override", {
      enum: PERMISSION_MODES,
    }),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    isExpanded: integer("is_expanded", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("workspace_user_id_idx").on(table.userId),
    index("workspace_user_id_archived_idx").on(table.userId, table.isArchived),
  ],
);

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  user: one(users, {
    fields: [workspaces.userId],
    references: [users.id],
    relationName: "ownedWorkspaces",
  }),
  selectedByUsers: many(users, { relationName: "selectedWorkspace" }),
  threads: many(threads),
  automations: many(automations),
}));

export const threads = sqliteTable(
  "thread",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    summary: text("summary"),
    mode: text("mode", { enum: THREAD_MODES }).notNull().default("chat"),
    chatEngine: text("chat_engine", { enum: CHAT_ENGINES })
      .notNull()
      .default("sentinel"),
    chatEngineState: text("chat_engine_state", { mode: "json" }),
    chatModelId: text("chat_model_id"),
    chatReasoningEffort: text("chat_reasoning_effort"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    pinnedAt: integer("pinned_at", { mode: "timestamp" }),
    activeStreamId: text("active_stream_id"),
    contextCompactionSummary: text("context_compaction_summary"),
    contextCompactionCoveredThroughMessageId: text(
      "context_compaction_covered_through_message_id",
    ),
    contextCompactionUpdatedAt: integer("context_compaction_updated_at", {
      mode: "timestamp",
    }),
    status: text("status", { enum: THREAD_STATUSES }).notNull().default("idle"),
  },
  (table) => [
    index("thread_workspace_id_idx").on(table.workspaceId),
    index("thread_user_id_idx").on(table.userId),
    index("thread_workspace_archived_updated_idx").on(
      table.workspaceId,
      table.archivedAt,
      table.updatedAt,
    ),
    index("thread_user_archived_updated_idx").on(
      table.userId,
      table.archivedAt,
      table.updatedAt,
    ),
    index("thread_user_pinned_idx").on(table.userId, table.pinnedAt),
  ],
);

export const threadsRelations = relations(threads, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [threads.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [threads.userId],
    references: [users.id],
  }),
  followUps: many(threadFollowUps),
  messages: many(threadMessages),
  repoCheckpoints: many(threadRepoCheckpoints),
  plans: many(threadPlans),
  planQuestions: many(threadPlanQuestions),
}));

export const threadFollowUps = sqliteTable(
  "thread_follow_up",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    parts: text("parts", { mode: "json" }).notNull(),
    modelId: text("model_id").notNull(),
    reasoningEffort: text("reasoning_effort"),
    threadMode: text("thread_mode", { enum: THREAD_MODES }).notNull(),
    status: text("status", { enum: THREAD_FOLLOW_UP_STATUSES })
      .notNull()
      .default("queued"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("thread_follow_up_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
    index("thread_follow_up_thread_status_idx").on(
      table.threadId,
      table.status,
    ),
  ],
);

export const threadFollowUpsRelations = relations(
  threadFollowUps,
  ({ one }) => ({
    thread: one(threads, {
      fields: [threadFollowUps.threadId],
      references: [threads.id],
    }),
  }),
);

export const threadMessages = sqliteTable(
  "thread_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    threadId: text("thread_id").notNull(),
    messageId: text("message_id").notNull(),
    role: text("role", { enum: THREAD_MESSAGE_ROLES }).notNull(),
    parts: text("parts", { mode: "json" }).notNull(),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("thread_message_thread_message_unique").on(
      table.threadId,
      table.messageId,
    ),
    index("thread_message_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
  ],
);

export const threadMessagesRelations = relations(threadMessages, ({ one }) => ({
  thread: one(threads, {
    fields: [threadMessages.threadId],
    references: [threads.id],
  }),
}));

export const threadRepoCheckpoints = sqliteTable(
  "thread_repo_checkpoint",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    threadId: text("thread_id").notNull(),
    assistantMessageId: text("assistant_message_id").notNull(),
    parentCheckpointId: text("parent_checkpoint_id"),
    runId: text("run_id").notNull(),
    effectiveProjectPath: text("effective_project_path").notNull(),
    repoRoot: text("repo_root").notNull(),
    branchAtCapture: text("branch_at_capture"),
    headAtCapture: text("head_at_capture"),
    changedPaths: text("changed_paths", { mode: "json" }).notNull(),
    beforeTreeHash: text("before_tree_hash"),
    afterTreeHash: text("after_tree_hash"),
    forwardPatch: text("forward_patch").notNull(),
    reversePatch: text("reverse_patch").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("thread_repo_checkpoint_assistant_unique").on(
      table.threadId,
      table.assistantMessageId,
    ),
    index("thread_repo_checkpoint_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
    index("thread_repo_checkpoint_parent_idx").on(table.parentCheckpointId),
  ],
);

export const threadRepoCheckpointsRelations = relations(
  threadRepoCheckpoints,
  ({ one }) => ({
    thread: one(threads, {
      fields: [threadRepoCheckpoints.threadId],
      references: [threads.id],
    }),
    parent: one(threadRepoCheckpoints, {
      fields: [threadRepoCheckpoints.parentCheckpointId],
      references: [threadRepoCheckpoints.id],
      relationName: "threadRepoCheckpointParent",
    }),
  }),
);

export const threadPlans = sqliteTable(
  "thread_plan",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    threadId: text("thread_id").notNull(),
    title: text("title").notNull(),
    goal: text("goal").notNull(),
    summary: text("summary").notNull(),
    audience: text("audience", { enum: THREAD_PLAN_AUDIENCES })
      .notNull()
      .default("technical"),
    document: text("document").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("thread_plan_thread_id_unique").on(table.threadId),
    index("thread_plan_thread_id_idx").on(table.threadId),
  ],
);

export const threadPlansRelations = relations(threadPlans, ({ one, many }) => ({
  thread: one(threads, {
    fields: [threadPlans.threadId],
    references: [threads.id],
  }),
  tasks: many(threadPlanTasks),
}));

export const threadPlanTasks = sqliteTable(
  "thread_plan_task",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    planId: text("plan_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: THREAD_PLAN_TASK_STATUSES })
      .notNull()
      .default("pending"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("thread_plan_task_plan_id_idx").on(table.planId),
    index("thread_plan_task_plan_sort_idx").on(table.planId, table.sortOrder),
  ],
);

export const threadPlanTasksRelations = relations(
  threadPlanTasks,
  ({ one }) => ({
    plan: one(threadPlans, {
      fields: [threadPlanTasks.planId],
      references: [threadPlans.id],
    }),
  }),
);

export const threadPlanQuestions = sqliteTable(
  "thread_plan_question",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    threadId: text("thread_id").notNull(),
    questions: text("questions", { mode: "json" }).notNull(),
    response: text("response", { mode: "json" }),
    status: text("status", { enum: THREAD_PLAN_QUESTION_STATUSES })
      .notNull()
      .default("pending"),
    answeredAt: integer("answered_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("thread_plan_question_thread_id_idx").on(table.threadId),
    index("thread_plan_question_thread_status_idx").on(
      table.threadId,
      table.status,
    ),
  ],
);

export const threadPlanQuestionsRelations = relations(
  threadPlanQuestions,
  ({ one }) => ({
    thread: one(threads, {
      fields: [threadPlanQuestions.threadId],
      references: [threads.id],
    }),
  }),
);

export const providerCredentials = sqliteTable(
  "provider_credential",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    provider: text("provider", { enum: AI_PROVIDERS }).notNull(),
    encryptedConfig: text("encrypted_config").notNull(),
    isEnabled: integer("is_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("provider_credential_user_provider_unique").on(
      table.userId,
      table.provider,
    ),
    index("provider_credential_user_id_idx").on(table.userId),
  ],
);

export const providerCredentialsRelations = relations(
  providerCredentials,
  ({ one }) => ({
    user: one(users, {
      fields: [providerCredentials.userId],
      references: [users.id],
    }),
  }),
);

export const mcpServerConfigs = sqliteTable(
  "mcp_server_config",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    catalogId: text("catalog_id", { enum: MCP_SERVER_CATALOG_IDS }),
    transport: text("transport", { enum: MCP_TRANSPORTS }).notNull(),
    encryptedConfig: text("encrypted_config").notNull(),
    isEnabled: integer("is_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("mcp_server_config_user_catalog_unique").on(
      table.userId,
      table.catalogId,
    ),
    index("mcp_server_config_user_id_idx").on(table.userId),
    index("mcp_server_config_user_enabled_idx").on(
      table.userId,
      table.isEnabled,
    ),
  ],
);

export const mcpServerConfigsRelations = relations(
  mcpServerConfigs,
  ({ one }) => ({
    user: one(users, {
      fields: [mcpServerConfigs.userId],
      references: [users.id],
    }),
  }),
);

export const searchProviderConfigs = sqliteTable(
  "search_provider_config",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    provider: text("provider", { enum: SEARCH_PROVIDERS }).notNull(),
    encryptedConfig: text("encrypted_config").notNull(),
    settings: text("settings", { mode: "json" }).notNull(),
    isEnabled: integer("is_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("search_provider_config_user_provider_unique").on(
      table.userId,
      table.provider,
    ),
    index("search_provider_config_user_id_idx").on(table.userId),
  ],
);

export const searchProviderConfigsRelations = relations(
  searchProviderConfigs,
  ({ one }) => ({
    user: one(users, {
      fields: [searchProviderConfigs.userId],
      references: [users.id],
    }),
  }),
);

export const searchSettings = sqliteTable(
  "search_setting",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    defaultProvider: text("default_provider", {
      enum: SEARCH_PROVIDERS,
    }).notNull(),
    defaultResultCount: integer("default_result_count").notNull(),
    maxResultCount: integer("max_result_count").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("search_setting_user_unique").on(table.userId),
    index("search_setting_user_id_idx").on(table.userId),
  ],
);

export const searchSettingsRelations = relations(searchSettings, ({ one }) => ({
  user: one(users, {
    fields: [searchSettings.userId],
    references: [users.id],
  }),
}));

export const memorySettings = sqliteTable(
  "memory_setting",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    autoSaveEnabled: integer("auto_save_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    defaultScope: text("default_scope").notNull().default("global"),
    retrievalLimit: integer("retrieval_limit").notNull().default(6),
    autoSavePerTurnLimit: integer("auto_save_per_turn_limit")
      .notNull()
      .default(3),
    memoryProvider: text("memory_provider", { enum: AI_PROVIDERS })
      .notNull()
      .default("openai"),
    memoryModel: text("memory_model")
      .notNull()
      .default("text-embedding-3-small"),
    memoryDimensions: integer("memory_dimensions").notNull().default(1536),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("memory_setting_user_unique").on(table.userId),
    index("memory_setting_user_id_idx").on(table.userId),
  ],
);

export const memorySettingsRelations = relations(memorySettings, ({ one }) => ({
  user: one(users, {
    fields: [memorySettings.userId],
    references: [users.id],
  }),
}));

export const toolApprovalPolicies = sqliteTable(
  "tool_approval_policy",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    toolName: text("tool_name").notNull(),
    requireApproval: integer("require_approval", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("tool_approval_policy_user_tool_unique").on(
      table.userId,
      table.toolName,
    ),
    index("tool_approval_policy_user_id_idx").on(table.userId),
  ],
);

export const toolApprovalPoliciesRelations = relations(
  toolApprovalPolicies,
  ({ one }) => ({
    user: one(users, {
      fields: [toolApprovalPolicies.userId],
      references: [users.id],
    }),
  }),
);

export const modelPreferences = sqliteTable(
  "model_preference",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    provider: text("provider", { enum: AI_PROVIDERS }).notNull(),
    modelId: text("model_id").notNull(),
    isCustom: integer("is_custom", { mode: "boolean" })
      .notNull()
      .default(false),
    isEnabled: integer("is_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("model_preference_user_provider_model_unique").on(
      table.userId,
      table.provider,
      table.modelId,
    ),
    index("model_preference_user_id_idx").on(table.userId),
  ],
);

export const modelPreferencesRelations = relations(
  modelPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [modelPreferences.userId],
      references: [users.id],
    }),
  }),
);

export const automations = sqliteTable(
  "automation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    workspaceId: text("workspace_id"),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    chatEngine: text("chat_engine", { enum: CHAT_ENGINES })
      .notNull()
      .default("sentinel"),
    status: text("status", { enum: AUTOMATION_STATUSES })
      .notNull()
      .default("paused"),
    scheduleType: text("schedule_type", { enum: AUTOMATION_SCHEDULE_TYPES })
      .notNull()
      .default("daily"),
    scheduleDayOfWeek: integer("schedule_day_of_week"),
    scheduleTime: text("schedule_time"),
    scheduleCron: text("schedule_cron"),
    modelId: text("model_id"),
    reasoningEffort: text("reasoning_effort", {
      enum: AUTOMATION_REASONING_EFFORTS,
    }),
    lastRanAt: integer("last_ran_at", { mode: "timestamp" }),
    nextRunAt: integer("next_run_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("automation_user_id_idx").on(table.userId),
    index("automation_user_status_idx").on(table.userId, table.status),
    index("automation_next_run_idx").on(table.nextRunAt),
  ],
);

export const automationsRelations = relations(automations, ({ one, many }) => ({
  user: one(users, {
    fields: [automations.userId],
    references: [users.id],
  }),
  workspace: one(workspaces, {
    fields: [automations.workspaceId],
    references: [workspaces.id],
  }),
  runs: many(automationRuns),
}));

export const automationRuns = sqliteTable(
  "automation_run",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    automationId: text("automation_id")
      .notNull()
      .references(() => automations.id),
    threadId: text("thread_id").references(() => threads.id),
    status: text("status", { enum: AUTOMATION_RUN_STATUSES })
      .notNull()
      .default("pending"),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => [
    index("automation_run_automation_id_idx").on(table.automationId),
    index("automation_run_automation_started_idx").on(
      table.automationId,
      table.startedAt,
    ),
    index("automation_run_thread_id_idx").on(table.threadId),
  ],
);

export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
  automation: one(automations, {
    fields: [automationRuns.automationId],
    references: [automations.id],
  }),
  thread: one(threads, {
    fields: [automationRuns.threadId],
    references: [threads.id],
  }),
}));

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export const integrations = sqliteTable(
  "integration",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    provider: text("provider", { enum: INTEGRATION_PROVIDERS }).notNull(),
    authType: text("auth_type", { enum: INTEGRATION_AUTH_TYPES })
      .notNull()
      .default("oauth"),
    isEnabled: integer("is_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("integration_user_provider_unique").on(
      table.userId,
      table.provider,
    ),
    index("integration_user_id_idx").on(table.userId),
    index("integration_user_enabled_idx").on(table.userId, table.isEnabled),
  ],
);

export const integrationsRelations = relations(
  integrations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [integrations.userId],
      references: [users.id],
    }),
    oauthTokens: many(integrationOAuthTokens),
    databaseConfigs: many(integrationDatabaseConfigs),
  }),
);

export const integrationOAuthTokens = sqliteTable(
  "integration_oauth_token",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    integrationId: text("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenType: text("token_type").notNull().default("Bearer"),
    scope: text("scope"),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("integration_oauth_token_integration_idx").on(table.integrationId),
  ],
);

export const integrationOAuthTokensRelations = relations(
  integrationOAuthTokens,
  ({ one }) => ({
    integration: one(integrations, {
      fields: [integrationOAuthTokens.integrationId],
      references: [integrations.id],
    }),
  }),
);

export const integrationOAuthApps = sqliteTable(
  "integration_oauth_app",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    provider: text("provider", { enum: INTEGRATION_PROVIDERS }).notNull(),
    encryptedClientId: text("encrypted_client_id").notNull(),
    encryptedClientSecret: text("encrypted_client_secret").notNull(),
    redirectUri: text("redirect_uri"),
    scopes: text("scopes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("integration_oauth_app_user_provider_unique").on(
      table.userId,
      table.provider,
    ),
    index("integration_oauth_app_user_id_idx").on(table.userId),
  ],
);

export const integrationOAuthAppsRelations = relations(
  integrationOAuthApps,
  ({ one }) => ({
    user: one(users, {
      fields: [integrationOAuthApps.userId],
      references: [users.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Integration Database Configs
// ---------------------------------------------------------------------------

export const integrationDatabaseConfigs = sqliteTable(
  "integration_database_config",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    integrationId: text("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    encryptedHost: text("encrypted_host").notNull(),
    encryptedPort: text("encrypted_port").notNull(),
    encryptedDatabase: text("encrypted_database"),
    encryptedUsername: text("encrypted_username").notNull(),
    encryptedPassword: text("encrypted_password").notNull(),
    encryptedConnectionUrl: text("encrypted_connection_url"),
    useConnectionUrl: integer("use_connection_url", { mode: "boolean" })
      .notNull()
      .default(false),
    ssl: integer("ssl", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("integration_db_config_integration_idx").on(table.integrationId),
  ],
);

export const integrationDatabaseConfigsRelations = relations(
  integrationDatabaseConfigs,
  ({ one }) => ({
    integration: one(integrations, {
      fields: [integrationDatabaseConfigs.integrationId],
      references: [integrations.id],
    }),
  }),
);
