import { z } from "zod";
import { REASONING_EFFORTS } from "@/lib/ai/providers/models";
import { THREAD_MODES } from "@/lib/plan";
import { permissionModeSchema } from "@/schemas/security.schema";
import { CHAT_ENGINES } from "@/server/db/enums";

export const threadListOrganizeBySchema = z.enum([
  "workspace",
  "chronological",
]);

export const threadListSortBySchema = z.enum(["created", "updated"]);
export const chatEngineSchema = z.enum(CHAT_ENGINES);

export const threadMessageRoleSchema = z.enum(["system", "user", "assistant"]);

const jsonValueSchema: z.ZodType<
  string | number | boolean | null | Record<string, unknown> | unknown[]
> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

const uiMessagePartSchema = z
  .object({ type: z.string().min(1) })
  .catchall(jsonValueSchema);

export const threadUIMessageSchema = z.object({
  id: z.string().min(1, "Message id is required."),
  metadata: jsonValueSchema.optional(),
  parts: z.array(uiMessagePartSchema).min(1, "Message parts are required."),
  role: threadMessageRoleSchema,
});

function isAbsolutePath(value: string) {
  return (
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("\\\\")
  );
}

const optionalAbsolutePathSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z
    .string()
    .refine((value) => isAbsolutePath(value), "Enter an absolute path.")
    .optional(),
);

const optionalText = (max: number) => z.string().trim().max(max);

export const workspaceCreateSchema = z.object({
  description: optionalText(500).optional().default(""),
  name: z.string().trim().min(1, "Workspace name is required.").max(120),
  rootPath: optionalAbsolutePathSchema,
});

export const workspaceUpdateSchema = workspaceCreateSchema.extend({
  workspaceId: z.string().min(1),
});

export const workspaceArchiveSchema = z.object({
  workspaceId: z.string().min(1),
});

export const workspaceSelectSchema = z.object({
  workspaceId: z.string().min(1),
});

export const workspacePermissionOverrideSchema = z.object({
  permissionModeOverride: permissionModeSchema.nullable(),
  workspaceId: z.string().min(1),
});

export const threadListPreferencesSchema = z.object({
  organizeBy: threadListOrganizeBySchema,
  sortBy: threadListSortBySchema,
});

export const threadListSchema = z
  .object({
    organizeBy: threadListOrganizeBySchema.optional(),
    sortBy: threadListSortBySchema.optional(),
    workspaceId: z.string().min(1).optional(),
  })
  .optional();

export const threadCreateSchema = z.object({
  engine: chatEngineSchema.optional().default("sentinel"),
  mode: z.enum(THREAD_MODES).optional().default("chat"),
  summary: optionalText(500).optional().default(""),
  threadId: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Thread title is required.").max(200),
  workspaceId: z.string().min(1).optional(),
});

export const threadGetSchema = z.object({
  threadId: z.string().min(1),
});

export const threadRenameSchema = z.object({
  threadId: z.string().min(1),
  title: z.string().trim().min(1, "Thread title is required.").max(200),
});

export const threadUpdateMetaSchema = z.object({
  summary: optionalText(500).optional(),
  threadId: z.string().min(1),
});

const reasoningEffortSchema = z.enum(REASONING_EFFORTS);

export const threadSettingsSchema = z
  .object({
    engine: chatEngineSchema.optional(),
    mode: z.enum(THREAD_MODES).optional(),
    modelId: z.string().trim().min(1).optional(),
    reasoningEffort: reasoningEffortSchema.nullish(),
    threadId: z.string().min(1),
  })
  .refine(
    (value) =>
      value.engine !== undefined ||
      value.mode !== undefined ||
      value.modelId !== undefined ||
      value.reasoningEffort !== undefined,
    {
      message: "At least one setting must be provided.",
      path: ["threadId"],
    },
  );

export const threadArchiveSchema = z.object({
  threadId: z.string().min(1),
});

export const threadTogglePinSchema = z.object({
  pinned: z.boolean(),
  threadId: z.string().min(1),
});

export const threadSearchSchema = z.object({
  query: z.string().trim().min(1),
  workspaceId: z.string().min(1).optional(),
});

export const threadSetActiveBranchSchema = z.object({
  messageId: z.string().min(1),
  threadId: z.string().min(1),
});

export const threadQueuedFollowUpActionSchema = z.object({
  followUpId: z.string().min(1),
  threadId: z.string().min(1),
});

export const threadMessageAppendSchema = z.object({
  message: threadUIMessageSchema,
  threadId: z.string().min(1),
});

export const threadMessagesReplaceSchema = z.object({
  messages: z.array(threadUIMessageSchema),
  threadId: z.string().min(1),
});

export const threadMessageListSchema = z.object({
  threadId: z.string().min(1),
});

export type ThreadListInput = z.infer<typeof threadListSchema>;
