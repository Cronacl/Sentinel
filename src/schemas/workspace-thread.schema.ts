import { z } from "zod";

export const threadListOrganizeBySchema = z.enum([
  "workspace",
  "chronological",
]);

export const threadListSortBySchema = z.enum(["created", "updated"]);

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

export const threadArchiveSchema = z.object({
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
