import { z } from "zod";

import { PERMISSION_MODES } from "@/server/db/enums";

export const enginePlanModeSupportSchema = z.union([
  z.literal(false),
  z.enum(["native", "acp-mode", "agent-select", "prompt"]),
]);

export const engineResumeSupportSchema = z.union([
  z.literal(false),
  z.enum(["native", "replay"]),
]);

export const engineMessageActionsSchema = z.object({
  edit: z.boolean(),
  planAnswers: z.boolean(),
  regenerate: z.boolean(),
  retry: z.boolean(),
});

/**
 * What a driver can do. Drivers declare a static set; a probe may narrow it
 * (an ACP agent without loadSession resumes by replay). Every per-engine
 * `chatEngine === "x"` check in the UI and runtime should become one of
 * these flags.
 */
export const engineCapabilitiesSchema = z.object({
  messageActions: engineMessageActionsSchema,
  permissionModes: z.array(z.enum(PERMISSION_MODES)).readonly(),
  planModeChangeRequiresNewSession: z.boolean(),
  reportsContextWindow: z.boolean(),
  reportsNativeSkills: z.boolean(),
  reportsSlashCommands: z.boolean(),
  reportsUsageLimits: z.boolean(),
  supportsApprovals: z.boolean(),
  supportsConversationRollback: z.boolean(),
  supportsCustomModels: z.boolean(),
  supportsFork: z.boolean(),
  supportsImages: z.boolean(),
  supportsMcpInjection: z.boolean(),
  supportsMultipleInstances: z.boolean(),
  supportsPlanMode: enginePlanModeSupportSchema,
  supportsResume: engineResumeSupportSchema,
  supportsSteer: z.boolean(),
  supportsTextGeneration: z.boolean(),
  supportsUnattendedTools: z.boolean(),
  supportsUserInput: z.boolean(),
});

export type EnginePlanModeSupport = z.infer<typeof enginePlanModeSupportSchema>;
export type EngineResumeSupport = z.infer<typeof engineResumeSupportSchema>;
export type EngineMessageActions = z.infer<typeof engineMessageActionsSchema>;
export type EngineCapabilities = z.infer<typeof engineCapabilitiesSchema>;
