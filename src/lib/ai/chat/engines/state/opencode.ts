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
});

export type OpenCodeThreadState = z.infer<typeof openCodeThreadStateSchema>;
