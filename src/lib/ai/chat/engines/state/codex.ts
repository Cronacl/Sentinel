import { z } from "zod";

import { REASONING_EFFORTS } from "@/lib/ai/providers/models";

import { threadStateSessionMeta } from "./session";

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
  ...threadStateSessionMeta,
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

export type CodexApprovalPolicy = z.infer<typeof codexApprovalPolicySchema>;
export type CodexSandboxMode = z.infer<typeof codexSandboxModeSchema>;
export type CodexThreadState = z.infer<typeof codexThreadStateSchema>;
