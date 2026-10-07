import { z } from "zod";

// Model ids that come from configuration (custom models, the remote manifest)
// reach CLI argv, and Cursor/OpenCode spawn through a shell on Windows, so
// they are limited to a conservative character set. Live ids reported by an
// engine are taken as they come.
export const ENGINE_MODEL_ID_PATTERN = /^[A-Za-z0-9._:/[\]@-]{1,128}$/;

export const engineOptionChoiceSchema = z.object({
  description: z.string().optional(),
  id: z.string().min(1),
  isDefault: z.boolean().optional(),
  label: z.string(),
});

export const engineSelectOptionDescriptorSchema = z.object({
  choices: z.array(engineOptionChoiceSchema),
  description: z.string().optional(),
  id: z.string().min(1),
  label: z.string(),
  /** Choices that the driver injects into the prompt (Claude "ultrathink"). */
  promptInjectedValues: z.array(z.string()).optional(),
  role: z
    .enum(["reasoning", "agent", "variant", "context", "mode", "other"])
    .optional(),
  type: z.literal("select"),
});

export const engineBooleanOptionDescriptorSchema = z.object({
  defaultValue: z.boolean().optional(),
  description: z.string().optional(),
  id: z.string().min(1),
  label: z.string(),
  role: z.enum(["fast", "thinking", "other"]).optional(),
  type: z.literal("boolean"),
});

export const engineOptionDescriptorSchema = z.discriminatedUnion("type", [
  engineSelectOptionDescriptorSchema,
  engineBooleanOptionDescriptorSchema,
]);

/** One chosen option value, as carried by requests, follow-ups and automations. */
export const engineOptionSelectionSchema = z.object({
  id: z.string().min(1),
  value: z.union([z.string(), z.boolean()]),
});

export const engineModelInputModalitySchema = z.enum([
  "text",
  "image",
  "audio",
  "pdf",
]);

export const engineModelSchema = z.object({
  aliases: z.array(z.string()).optional(),
  badge: z.literal("new").optional(),
  contextWindow: z.number().int().positive().optional(),
  description: z.string().optional(),
  disabledReason: z.string().optional(),
  /** Selection key, unique per instance. */
  id: z.string().min(1),
  inputModalities: z.array(engineModelInputModalitySchema),
  isCustom: z.boolean(),
  isDefault: z.boolean().optional(),
  isLegacy: z.boolean().optional(),
  minRuntimeVersion: z.string().optional(),
  name: z.string(),
  options: z.array(engineOptionDescriptorSchema),
  /** Value sent on the wire when it differs from `id`. */
  runtimeId: z.string().optional(),
  shortName: z.string().optional(),
  source: z.enum(["live", "manifest", "custom"]),
  /** OpenCode providerID, Pi provider. */
  subProvider: z.string().optional(),
});

/** A model the user added to one instance (engine_instance.custom_models). */
export const customEngineModelSchema = z.object({
  id: z.string().regex(ENGINE_MODEL_ID_PATTERN),
  name: z.string().trim().min(1).max(200).optional(),
  options: z.array(engineOptionDescriptorSchema).optional(),
});

export const engineSlashCommandSchema = z.object({
  description: z.string().optional(),
  inputHint: z.string().optional(),
  name: z.string().min(1),
  source: z.enum(["native", "sentinel"]),
});

export const engineSkillSchema = z.object({
  description: z.string().optional(),
  enabled: z.boolean(),
  name: z.string().min(1),
  path: z.string(),
  scope: z.string().optional(),
  userInvocable: z.boolean().optional(),
  userInvocationOnly: z.boolean().optional(),
});

export type EngineOptionChoice = z.infer<typeof engineOptionChoiceSchema>;
export type EngineSelectOptionDescriptor = z.infer<
  typeof engineSelectOptionDescriptorSchema
>;
export type EngineBooleanOptionDescriptor = z.infer<
  typeof engineBooleanOptionDescriptorSchema
>;
export type EngineOptionDescriptor = z.infer<
  typeof engineOptionDescriptorSchema
>;
export type EngineOptionSelection = z.infer<typeof engineOptionSelectionSchema>;
export type EngineModelInputModality = z.infer<
  typeof engineModelInputModalitySchema
>;
export type EngineModel = z.infer<typeof engineModelSchema>;
export type CustomEngineModel = z.infer<typeof customEngineModelSchema>;
export type EngineSlashCommand = z.infer<typeof engineSlashCommandSchema>;
export type EngineSkill = z.infer<typeof engineSkillSchema>;
