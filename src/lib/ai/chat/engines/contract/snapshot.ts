import { z } from "zod";

import { engineCapabilitiesSchema } from "./capabilities";
import {
  engineCompatibilityAdvisorySchema,
  engineInstallStateSchema,
  engineSetupSchema,
  engineUpdateStateSchema,
  engineVersionAdvisorySchema,
} from "./maintenance";
import {
  engineModelSchema,
  engineSkillSchema,
  engineSlashCommandSchema,
} from "./models";
import { engineUsageLimitsSchema } from "./usage-limits";

export const ENGINE_INSTALL_SOURCES = [
  "config",
  "env",
  "managed-path",
  "login-shell",
  "managed-install",
  "sdk-bundled",
] as const;

export const engineInstallSchema = z.object({
  installed: z.boolean(),
  path: z.string().nullable(),
  source: z.enum(ENGINE_INSTALL_SOURCES).nullable(),
  version: z.string().nullable(),
});

export const engineAuthSummarySchema = z.object({
  canLogin: z.boolean(),
  canLogout: z.boolean(),
  email: z.string().nullable(),
  label: z.string().nullable(),
  method: z.string().nullable(),
  plan: z.string().nullable(),
  status: z.enum(["authenticated", "unauthenticated", "unknown"]),
});

export const ENGINE_SNAPSHOT_STATUSES = [
  "checking",
  "ready",
  "warning",
  "error",
  "disabled",
] as const;

/**
 * Everything the UI knows about one engine instance. Snapshots never carry
 * environment values or credentials; a redaction test enforces it.
 */
export const engineSnapshotSchema = z.object({
  accentColor: z.string().nullable(),
  auth: engineAuthSummarySchema,
  availability: z.enum(["available", "unavailable"]),
  badgeLabel: z.string().nullable(),
  capabilities: engineCapabilitiesSchema,
  checkedAt: z.string().nullable(),
  compatibilityAdvisory: engineCompatibilityAdvisorySchema.nullable(),
  defaultModelId: z.string().nullable(),
  description: z.string(),
  driver: z.string(),
  enabled: z.boolean(),
  iconUrl: z.string().nullable(),
  install: engineInstallSchema,
  installState: engineInstallStateSchema.nullable(),
  instanceId: z.string(),
  isDefaultInstance: z.boolean(),
  label: z.string(),
  lastSuccessfulProbeAt: z.string().nullable(),
  message: z.string().nullable(),
  models: z.array(engineModelSchema),
  runtimePaths: z.object({ homePath: z.string().nullable() }).nullable(),
  setup: engineSetupSchema,
  skills: z.array(engineSkillSchema),
  slashCommands: z.array(engineSlashCommandSchema),
  /** Served from cache after a probe timed out. */
  stale: z.boolean(),
  status: z.enum(ENGINE_SNAPSHOT_STATUSES),
  unavailableReason: z.string().nullable(),
  updateState: engineUpdateStateSchema.nullable(),
  usable: z.boolean(),
  usageLimits: engineUsageLimitsSchema.nullable(),
  versionAdvisory: engineVersionAdvisorySchema.nullable(),
});

/**
 * What a driver's probe returns. The platform adds identity, caching,
 * manifest/custom models and advisories to turn it into a snapshot.
 */
export const engineProbeResultSchema = z.object({
  auth: engineAuthSummarySchema,
  capabilityOverrides: engineCapabilitiesSchema.partial().optional(),
  defaultModelId: z.string().nullable().optional(),
  iconUrl: z.string().optional(),
  install: engineInstallSchema,
  labelHint: z.string().optional(),
  message: z.string().optional(),
  models: z.array(engineModelSchema),
  skills: z.array(engineSkillSchema).optional(),
  slashCommands: z.array(engineSlashCommandSchema).optional(),
  status: z.enum(["ready", "warning", "error"]),
  usageLimits: engineUsageLimitsSchema.optional(),
});

/** Cheap: resolve the binary and read its version. Full: talk to it. */
export const ENGINE_PROBE_DEPTHS = ["cheap", "full"] as const;

export const ENGINE_PROBE_REASONS = [
  "startup",
  "interval",
  "user",
  "focus",
  "config-change",
  "auth",
  "update",
  "run-error",
] as const;

export type EngineInstall = z.infer<typeof engineInstallSchema>;
export type EngineInstallSource = (typeof ENGINE_INSTALL_SOURCES)[number];
export type EngineAuthSummary = z.infer<typeof engineAuthSummarySchema>;
export type EngineSnapshotStatus = (typeof ENGINE_SNAPSHOT_STATUSES)[number];
export type EngineSnapshot = z.infer<typeof engineSnapshotSchema>;
export type EngineProbeResult = z.infer<typeof engineProbeResultSchema>;
export type EngineProbeDepth = (typeof ENGINE_PROBE_DEPTHS)[number];
export type EngineProbeReason = (typeof ENGINE_PROBE_REASONS)[number];

/**
 * The only availability predicate for the composer, settings, automations
 * and skills. Replaces the per-engine isXEngineAvailable functions, which
 * disagreed about timeouts and missing auth.
 */
export function computeEngineSnapshotUsable(
  snapshot: Pick<
    EngineSnapshot,
    | "auth"
    | "availability"
    | "compatibilityAdvisory"
    | "enabled"
    | "install"
    | "status"
  >,
) {
  return (
    snapshot.availability === "available" &&
    snapshot.enabled &&
    snapshot.install.installed &&
    (snapshot.status === "ready" || snapshot.status === "warning") &&
    snapshot.auth.status !== "unauthenticated" &&
    snapshot.compatibilityAdvisory?.status !== "broken"
  );
}

/** Parses a persisted snapshot; anything that no longer validates is dropped. */
export function parseEngineSnapshot(value: unknown): EngineSnapshot | null {
  const parsed = engineSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
