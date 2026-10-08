import { z } from "zod";

import { REASONING_EFFORTS } from "@/lib/ai/providers/models";

import { threadStateSessionMeta } from "./session";

/**
 * Thread state for every ACP-backed driver (cursor, grok, antigravity and
 * registry agents). A superset of the original Cursor state
 * ({sessionId, cwd, modelId, reasoningEffort}), so existing rows parse.
 */
export const acpThreadStateSchema = z.object({
  ...threadStateSessionMeta,
  agentId: z.string().nullish(),
  agentVersion: z.string().nullish(),
  /** Mode to restore after leaving plan mode. */
  buildModeId: z.string().nullish(),
  configValues: z
    .record(z.string(), z.union([z.string(), z.boolean()]))
    .nullish(),
  cwd: z.string().nullish(),
  /** The transcript is already inside the agent's session. */
  historyDelivered: z.boolean().nullish(),
  modeId: z.string().nullish(),
  modelId: z.string().nullish(),
  protocolVersion: z.number().int().nullish(),
  reasoningEffort: z.enum(REASONING_EFFORTS).nullish(),
  sessionId: z.string(),
  /**
   * The last thread message the agent's session holds (the assistant
   * message of its latest turn). Turns after it reached the thread some
   * other way (another engine, a failed turn) and are sent next turn; a
   * thread without it (an edit, a checkpoint restore) needs a new session.
   */
  syncedMessageId: z.string().nullish(),
});

export type AcpThreadState = z.infer<typeof acpThreadStateSchema>;
