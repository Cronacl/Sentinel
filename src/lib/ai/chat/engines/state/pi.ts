import { z } from "zod";

import { threadStateSessionMeta } from "./session";

export const piThreadStateSchema = z.object({
  ...threadStateSessionMeta,
  cwd: z.string().nullish(),
  /** `provider/id`. */
  modelId: z.string().nullish(),
  /** Pi's session file; Pi resumes by path. */
  sessionPath: z.string(),
  thinkingLevel: z.string().nullish(),
});

export type PiThreadState = z.infer<typeof piThreadStateSchema>;
