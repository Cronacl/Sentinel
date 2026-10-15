import { z } from "zod";

import { threadStateSessionMeta } from "./session";

export const openCodeThreadStateSchema = z.object({
  ...threadStateSessionMeta,
  cwd: z.string().nullish(),
  /** Server protocol generation the session was created on. */
  generation: z.enum(["v1", "v2"]).nullish(),
  modelId: z.string().nullish(),
  selectedAgent: z.string().nullish(),
  selectedVariant: z.string().nullish(),
  sessionId: z.string(),
  /**
   * The last thread message the session holds (its last answered turn).
   * Turns after it are sent with the next prompt; a thread that no longer
   * contains it has diverged and gets a new session. Absent on state from
   * builds that made a new session every turn: such a session is not
   * continued.
   */
  syncedMessageId: z.string().nullish(),
});

export type OpenCodeThreadState = z.infer<typeof openCodeThreadStateSchema>;
