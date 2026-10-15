import { z } from "zod";

/**
 * Stamped on every driver's thread state when it is written through an
 * instance. A thread only continues its native session when the stamp
 * matches the instance it runs on; legacy state (no stamp) is accepted for
 * the default instance only.
 */
export const threadStateSessionMeta = {
  continuationKey: z.string().nullish(),
  instanceId: z.string().nullish(),
};

export type ThreadStateSessionMeta = {
  continuationKey?: string | null;
  instanceId?: string | null;
};
