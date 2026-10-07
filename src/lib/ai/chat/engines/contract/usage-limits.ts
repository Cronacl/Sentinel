import { z } from "zod";

export const engineUsageWindowSchema = z.object({
  /** Stable per window; sparse updates merge by this id. */
  id: z.string().min(1),
  kind: z.enum(["session", "weekly", "monthly", "other"]),
  label: z.string(),
  resetsAt: z.string().optional(),
  usedPercent: z.number().min(0),
  windowDurationMins: z.number().positive().optional(),
});

export const engineUsageLimitsSchema = z.object({
  checkedAt: z.string(),
  credentialFingerprint: z.string().optional(),
  externalUsage: z.object({ label: z.string(), url: z.string() }).optional(),
  unavailable: z
    .object({
      message: z.string().optional(),
      reason: z.enum(["unsupported", "probeFailed"]),
    })
    .optional(),
  windows: z.array(engineUsageWindowSchema),
});

export type EngineUsageWindow = z.infer<typeof engineUsageWindowSchema>;
export type EngineUsageLimits = z.infer<typeof engineUsageLimitsSchema>;

/**
 * Sparse merge: windows in `update` replace the window with the same id and
 * the rest are kept, so a live `rate_limit_event` for one window does not
 * erase the others read by the last full probe.
 */
export function mergeEngineUsageWindows(
  current: readonly EngineUsageWindow[],
  update: readonly EngineUsageWindow[],
): EngineUsageWindow[] {
  const byId = new Map(current.map((window) => [window.id, window]));
  for (const window of update) {
    byId.set(window.id, window);
  }
  return [...byId.values()];
}
