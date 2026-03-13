import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

import {
  AI_PROVIDERS,
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
} from "./enums";

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
    webFetchBatchEnabled: integer("webfetch_batch_enabled", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    webFetchBatchLimit: integer("webfetch_batch_limit").notNull().default(10),
    themePreference: text("theme_preference", { enum: THEME_PREFERENCES })
      .notNull()
      .default("system"),
    defaultChatModelId: text("default_chat_model_id"),
    defaultChatMode: text("default_chat_mode", { enum: THREAD_MODES }),
    defaultChatReasoningEffort: text("default_chat_reasoning_effort"),
    selectedWorkspaceId: text("selected_workspace_id"),
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
  modelPreferences: many(modelPreferences),
  searchProviderConfigs: many(searchProviderConfigs),
  searchSettings: many(searchSettings),
  memorySettings: many(memorySettings),
  toolApprovalPolicies: many(toolApprovalPolicies),
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
    isArchived: integer("is_archived", { mode: "boolean" })
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
}));

export const threads = sqliteTable(
  "thread",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    mode: text("mode", { enum: THREAD_MODES }).notNull().default("chat"),
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
  messages: many(threadMessages),
  plans: many(threadPlans),
  planQuestions: many(threadPlanQuestions),
}));

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

export const threadPlanTasksRelations = relations(threadPlanTasks, ({ one }) => ({
  plan: one(threadPlans, {
    fields: [threadPlanTasks.planId],
    references: [threadPlans.id],
  }),
}));

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
    memoryModel: text("memory_model").notNull().default("text-embedding-3-small"),
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
