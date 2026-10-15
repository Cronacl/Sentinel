import { z } from "zod";

import { threadStateSessionMeta } from "./session";

export const piThreadStateSchema = z.object({
  ...threadStateSessionMeta,
  cwd: z.string().nullish(),
  /** The session holds every turn up to `syncedMessageId` (history.ts). */
  historyDelivered: z.boolean().nullish(),
  /** `provider/id`, or "default" (Pi's own settings). */
  modelId: z.string().nullish(),
  /** Pi's session file; Pi resumes by path. */
  sessionPath: z.string(),
  /**
   * The last thread message Pi's session holds (the assistant message of
   * its latest turn); later turns are sent with the next prompt, and a
   * thread without it needs a new session (runtime/acp/history.ts).
   */
  syncedMessageId: z.string().nullish(),
  thinkingLevel: z.string().nullish(),
});

export type PiThreadState = z.infer<typeof piThreadStateSchema>;
