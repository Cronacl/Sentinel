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
  PERSONALITY_PRESETS,
  THEME_PREFERENCES,
  THREAD_LIST_ORGANIZE_BY,
  THREAD_LIST_SORT_BY,
  THREAD_MESSAGE_ROLES,
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
    themePreference: text("theme_preference", { enum: THEME_PREFERENCES })
      .notNull()
      .default("system"),
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
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    pinnedAt: integer("pinned_at", { mode: "timestamp" }),
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
