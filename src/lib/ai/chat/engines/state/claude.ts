import { z } from "zod";

import { threadStateSessionMeta } from "./session";

export const claudePermissionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "dontAsk",
]);

export const claudeThreadStateSchema = z.object({
  ...threadStateSessionMeta,
  cwd: z.string().nullish(),
  modelId: z.string().nullish(),
  permissionMode: claudePermissionModeSchema.nullish(),
  sessionId: z.string(),
});

export type ClaudePermissionMode = z.infer<typeof claudePermissionModeSchema>;
export type ClaudeThreadState = z.infer<typeof claudeThreadStateSchema>;
