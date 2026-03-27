import { z } from "zod";

import { CHAT_ENGINES, type ChatEngine } from "@/server/db/enums";
import { REASONING_EFFORTS } from "@/lib/ai/providers/models";

export const chatEngineSchema = z.enum(CHAT_ENGINES);
export const claudePermissionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "dontAsk",
]);

export const codexApprovalPolicySchema = z.enum([
  "untrusted",
  "on-failure",
  "on-request",
  "never",
]);

export const codexSandboxModeSchema = z.enum([
  "read-only",
  "workspace-write",
  "danger-full-access",
]);

export const codexThreadStateSchema = z.object({
  approvalPolicy: codexApprovalPolicySchema.nullish(),
  cliVersion: z.string().nullish(),
  codexThreadId: z.string(),
  cwd: z.string().nullish(),
  modelId: z.string().nullish(),
  modelProvider: z.string().nullish(),
  pendingTurnId: z.string().nullish(),
  reasoningEffort: z.enum(REASONING_EFFORTS).nullish(),
  sandboxMode: codexSandboxModeSchema.nullish(),
});

export const claudeThreadStateSchema = z.object({
  cwd: z.string().nullish(),
  modelId: z.string().nullish(),
  permissionMode: claudePermissionModeSchema.nullish(),
  sessionId: z.string(),
});

export const threadChatEngineStateSchema = z
  .object({
    claude: claudeThreadStateSchema.nullish(),
    codex: codexThreadStateSchema.nullish(),
  })
  .partial();

type ThreadChatEngineStateMap = {
  claude: z.infer<typeof claudeThreadStateSchema>;
  codex: z.infer<typeof codexThreadStateSchema>;
};

type ExternalChatEngine = Exclude<ChatEngine, "sentinel">;

export type ClaudePermissionMode = z.infer<typeof claudePermissionModeSchema>;
export type CodexApprovalPolicy = z.infer<typeof codexApprovalPolicySchema>;
export type CodexSandboxMode = z.infer<typeof codexSandboxModeSchema>;
export type CodexThreadState = z.infer<typeof codexThreadStateSchema>;
export type ClaudeThreadState = z.infer<typeof claudeThreadStateSchema>;
export type ThreadChatEngineState = z.infer<typeof threadChatEngineStateSchema>;

export function parseThreadChatEngineState(
  value: unknown,
): ThreadChatEngineState | null {
  const parsed = threadChatEngineStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function getCodexThreadState(value: unknown): CodexThreadState | null {
  return parseThreadChatEngineState(value)?.codex ?? null;
}

export function getClaudeThreadState(value: unknown): ClaudeThreadState | null {
  return parseThreadChatEngineState(value)?.claude ?? null;
}

export function buildThreadChatEngineState(
  engine: ExternalChatEngine,
  value: ThreadChatEngineStateMap[ExternalChatEngine] | null,
): ThreadChatEngineState | null {
  if (!value) {
    return null;
  }

  return engine === "codex"
    ? { codex: value as CodexThreadState }
    : { claude: value as ClaudeThreadState };
}
