import { z } from "zod";

import { CHAT_ENGINES, type ChatEngine } from "@/server/db/enums";
import { REASONING_EFFORTS } from "@/lib/ai/providers/models";

export const chatEngineSchema = z.enum(CHAT_ENGINES);

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

export const threadChatEngineStateSchema = z
  .object({
    codex: codexThreadStateSchema.nullish(),
  })
  .partial();

export type CodexApprovalPolicy = z.infer<typeof codexApprovalPolicySchema>;
export type CodexSandboxMode = z.infer<typeof codexSandboxModeSchema>;
export type CodexThreadState = z.infer<typeof codexThreadStateSchema>;
export type ThreadChatEngineState = z.infer<typeof threadChatEngineStateSchema>;

export function parseThreadChatEngineState(
  value: unknown,
): ThreadChatEngineState | null {
  const parsed = threadChatEngineStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function getCodexThreadState(
  value: unknown,
): CodexThreadState | null {
  return parseThreadChatEngineState(value)?.codex ?? null;
}

export function buildThreadChatEngineState(
  engine: ChatEngine,
  value: CodexThreadState | null,
): ThreadChatEngineState | null {
  if (engine !== "codex" || !value) {
    return null;
  }

  return { codex: value };
}
