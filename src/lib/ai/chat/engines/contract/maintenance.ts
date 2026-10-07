import { z } from "zod";

export const engineVersionAdvisorySchema = z.object({
  canUpdate: z.boolean(),
  checkedAt: z.string().nullable(),
  currentVersion: z.string().nullable(),
  latestVersion: z.string().nullable(),
  status: z.enum(["unknown", "current", "behind_latest"]),
  updateCommand: z.string().nullable(),
});

export const engineCompatibilityAdvisorySchema = z.object({
  message: z.string().nullable(),
  recommendedRange: z.string().nullable(),
  recommendedVersion: z.string().nullable(),
  status: z.enum(["unknown", "supported", "graceful", "unsupported", "broken"]),
});

export const engineUpdateStateSchema = z.object({
  finishedAt: z.string().nullable(),
  message: z.string().nullable(),
  /** Captured command output, capped by the update runner. */
  output: z.string().nullable(),
  startedAt: z.string().nullable(),
  status: z.enum([
    "idle",
    "queued",
    "running",
    "succeeded",
    "failed",
    "unchanged",
  ]),
});

export const engineInstallStateSchema = z.object({
  downloadedBytes: z.number().int().min(0),
  message: z.string().nullable(),
  phase: z.enum([
    "idle",
    "downloading",
    "extracting",
    "verifying",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  totalBytes: z.number().int().min(0).nullable(),
});

export const engineSetupSchema = z.object({
  canAuthenticate: z.boolean(),
  canInstall: z.boolean(),
  canUpdate: z.boolean(),
  docsUrl: z.string().nullable(),
  installHint: z.string().nullable(),
});

export type EngineVersionAdvisory = z.infer<typeof engineVersionAdvisorySchema>;
export type EngineCompatibilityAdvisory = z.infer<
  typeof engineCompatibilityAdvisorySchema
>;
export type EngineUpdateState = z.infer<typeof engineUpdateStateSchema>;
export type EngineInstallState = z.infer<typeof engineInstallStateSchema>;
export type EngineSetup = z.infer<typeof engineSetupSchema>;
