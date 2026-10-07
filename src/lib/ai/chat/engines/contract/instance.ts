import { z } from "zod";

import { driverKindSchema, engineInstanceIdSchema } from "./ids";
import type { DriverKind, EngineInstanceId } from "./ids";
import { customEngineModelSchema, type CustomEngineModel } from "./models";

export const ENGINE_ENV_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
export const ENGINE_ACCENT_COLOR = /^#[0-9a-fA-F]{6}$/;
export const MAX_ENGINE_ENV_VARS = 64;
export const MAX_ENGINE_CUSTOM_MODELS = 200;

/**
 * Config keys every driver understands. Driver config schemas extend this
 * and keep unknown keys, so config written by a newer build round-trips.
 */
export const baseInstanceConfigSchema = z.looseObject({
  binaryPath: z.string().trim().min(1).max(4096).optional(),
  homePath: z.string().trim().min(1).max(4096).optional(),
  launchArgs: z.array(z.string().max(4096)).max(64).optional(),
});

export type BaseInstanceConfig = z.infer<typeof baseInstanceConfigSchema>;

export const engineEnvVarNameSchema = z.string().regex(ENGINE_ENV_VAR_NAME);

/** What the settings UI sends. */
export const engineEnvVarInputSchema = z.object({
  name: engineEnvVarNameSchema,
  sensitive: z.boolean().default(false),
  value: z.string().max(32_768).default(""),
  /**
   * The UI echoes a redacted secret back as `valueRedacted: true` with no
   * value: keep the stored value for this name.
   */
  valueRedacted: z.boolean().optional(),
});

/** engine_instance.environment entries; sensitive values are encrypted. */
export const storedEngineEnvVarSchema = z.object({
  encrypted: z.boolean(),
  name: engineEnvVarNameSchema,
  sensitive: z.boolean(),
  value: z.string(),
});

/** What leaves the server: sensitive values are never sent back. */
export const redactedEngineEnvVarSchema = z.object({
  name: z.string(),
  sensitive: z.boolean(),
  value: z.string(),
  valueRedacted: z.boolean(),
});

export const engineInstanceLabelSchema = z.string().trim().min(1).max(64);
export const engineAccentColorSchema = z.string().regex(ENGINE_ACCENT_COLOR);

export const ENGINE_INSTANCE_UNAVAILABLE_REASONS = [
  "missing",
  "disabled",
  "driver-unknown",
  "driver-planned",
  "driver-mismatch",
  "config-invalid",
  "no-default-instance",
] as const;

export type EngineInstanceUnavailableReason =
  (typeof ENGINE_INSTANCE_UNAVAILABLE_REASONS)[number];

/** Router output for one instance (Settings → Engines). */
export const engineInstanceSummarySchema = z.object({
  accentColor: z.string().nullable(),
  availability: z.enum(["available", "unavailable"]),
  config: z.unknown(),
  customModels: z.array(customEngineModelSchema),
  driver: driverKindSchema,
  enabled: z.boolean(),
  environment: z.array(redactedEngineEnvVarSchema),
  id: engineInstanceIdSchema,
  isDefault: z.boolean(),
  label: z.string(),
  /** False for a synthesized default instance that has no row yet. */
  persisted: z.boolean(),
  sortOrder: z.number().int(),
  unavailableReason: z.enum(ENGINE_INSTANCE_UNAVAILABLE_REASONS).nullable(),
});

const engineInstanceConfigInputSchema = z.record(z.string(), z.unknown());

/**
 * Settings → Engines "add instance" input. Shapes only: the server registry
 * also validates `config` with the driver's schema and allocates the id.
 */
export const createEngineInstanceInputSchema = z.object({
  accentColor: engineAccentColorSchema.nullish(),
  config: engineInstanceConfigInputSchema.optional(),
  customModels: z
    .array(customEngineModelSchema)
    .max(MAX_ENGINE_CUSTOM_MODELS)
    .optional(),
  driver: driverKindSchema,
  enabled: z.boolean().optional(),
  environment: z
    .array(engineEnvVarInputSchema)
    .max(MAX_ENGINE_ENV_VARS)
    .optional(),
  /** Omit to derive `${driver}-${slug(label)}`. */
  id: engineInstanceIdSchema.optional(),
  label: engineInstanceLabelSchema.optional(),
});

/** A partial update; `config` and `environment` replace the stored values. */
export const updateEngineInstanceInputSchema = z.object({
  accentColor: engineAccentColorSchema.nullish(),
  config: engineInstanceConfigInputSchema.optional(),
  customModels: z
    .array(customEngineModelSchema)
    .max(MAX_ENGINE_CUSTOM_MODELS)
    .optional(),
  enabled: z.boolean().optional(),
  environment: z
    .array(engineEnvVarInputSchema)
    .max(MAX_ENGINE_ENV_VARS)
    .optional(),
  label: engineInstanceLabelSchema.optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

export type CreateEngineInstanceInput = z.input<
  typeof createEngineInstanceInputSchema
>;
export type UpdateEngineInstanceInput = z.input<
  typeof updateEngineInstanceInputSchema
>;
export type EngineEnvVarInput = z.input<typeof engineEnvVarInputSchema>;
export type StoredEngineEnvVar = z.infer<typeof storedEngineEnvVarSchema>;
export type RedactedEngineEnvVar = z.infer<typeof redactedEngineEnvVarSchema>;
export type EngineInstanceSummary = z.infer<typeof engineInstanceSummarySchema>;

/**
 * An instance ready to run: decoded config, the environment its processes
 * get, and where it keeps state. Server code builds it; drivers consume it.
 */
export type ResolvedEngineInstance<
  C extends BaseInstanceConfig = BaseInstanceConfig,
> = {
  accentColor: string | null;
  config: C;
  /** Native sessions are only continued under the same key. */
  continuationKey: string;
  customModels: CustomEngineModel[];
  driver: DriverKind;
  enabled: boolean;
  /** process.env → managed PATH → home env → instance env (wins). */
  env: Record<string, string | undefined>;
  id: EngineInstanceId;
  isDefault: boolean;
  label: string;
  sortOrder: number;
  /** <state root>/engines/<instanceId>. */
  stateDir: string;
};

export type UnavailableEngineInstance = {
  driver: DriverKind;
  id: EngineInstanceId;
  label: string;
  message: string;
  reason: EngineInstanceUnavailableReason;
};
