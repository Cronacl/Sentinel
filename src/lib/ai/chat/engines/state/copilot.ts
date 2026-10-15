import { z } from "zod";

import { REASONING_EFFORTS } from "@/lib/ai/providers/models";

import { threadStateSessionMeta } from "./session";

export const copilotThreadStateSchema = z.object({
  ...threadStateSessionMeta,
  cwd: z.string().nullish(),
  modelId: z.string().nullish(),
  reasoningEffort: z.enum(REASONING_EFFORTS).nullish(),
  sessionId: z.string(),
});

export type CopilotThreadState = z.infer<typeof copilotThreadStateSchema>;
