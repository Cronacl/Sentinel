import { z } from "zod";

export const engineAuthMethodSchema = z.object({
  description: z.string().optional(),
  id: z.string().min(1),
  label: z.string(),
  type: z.enum([
    "browser",
    "device-code",
    "terminal-command",
    "credentials",
    "agent",
  ]),
});

export const engineAuthCredentialFieldSchema = z.object({
  label: z.string(),
  name: z.string().min(1),
  secret: z.boolean(),
});

export const engineAuthInteractionSchema = z.discriminatedUnion("type", [
  z.object({
    /** Antigravity-style paste-back of the redirect URL. */
    acceptsCallback: z.boolean().optional(),
    id: z.string(),
    type: z.literal("browser"),
    url: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("device-code"),
    url: z.string(),
    userCode: z.string(),
  }),
  z.object({
    args: z.array(z.string()),
    command: z.string(),
    env: z.record(z.string(), z.string()),
    id: z.string(),
    type: z.literal("terminal-command"),
  }),
  z.object({
    fields: z.array(engineAuthCredentialFieldSchema),
    id: z.string(),
    type: z.literal("credentials"),
  }),
]);

export const engineAuthFlowPhaseSchema = z.enum([
  "idle",
  "starting",
  "waiting",
  "verifying",
  "succeeded",
  "failed",
  "cancelled",
]);

export const engineAuthFlowStateSchema = z.object({
  expiresAt: z.string().nullable(),
  flowId: z.string().nullable(),
  instanceId: z.string(),
  interaction: engineAuthInteractionSchema.nullable(),
  message: z.string().nullable(),
  phase: engineAuthFlowPhaseSchema,
});

export const engineAuthResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("credentials"),
    values: z.record(z.string(), z.string()),
  }),
  z.object({
    action: z.enum(["accept", "decline"]),
    type: z.literal("browser"),
  }),
]);

export type EngineAuthMethod = z.infer<typeof engineAuthMethodSchema>;
export type EngineAuthCredentialField = z.infer<
  typeof engineAuthCredentialFieldSchema
>;
export type EngineAuthInteraction = z.infer<typeof engineAuthInteractionSchema>;
export type EngineAuthFlowPhase = z.infer<typeof engineAuthFlowPhaseSchema>;
export type EngineAuthFlowState = z.infer<typeof engineAuthFlowStateSchema>;
export type EngineAuthResponse = z.infer<typeof engineAuthResponseSchema>;

export function idleEngineAuthFlowState(
  instanceId: string,
  message: string | null = null,
): EngineAuthFlowState {
  return {
    expiresAt: null,
    flowId: null,
    instanceId,
    interaction: null,
    message,
    phase: "idle",
  };
}
