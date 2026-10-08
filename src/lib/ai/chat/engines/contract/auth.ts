import { z } from "zod";

// Sign-in flows per engine instance (Settings → Engines). A flow moves
// through `phase` (starting → waiting → verifying → succeeded | failed |
// cancelled); while it waits, `interaction` says what the user has to do:
// open a browser page, enter a device code, run a terminal command or enter
// credentials. Credentials go to the server once and never come back: no
// state, event or snapshot carries them.

export const ENGINE_AUTH_FLOW_PURPOSES = ["login", "logout"] as const;
export type EngineAuthFlowPurpose = (typeof ENGINE_AUTH_FLOW_PURPOSES)[number];

/** Launch tickets are 32 random bytes, hex. */
export const ENGINE_AUTH_TICKET_PATTERN = /^[a-f0-9]{64}$/;

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
  /** The environment variable (or driver field) the value is stored as. */
  name: z.string().min(1),
  secret: z.boolean(),
});

/**
 * Lets the desktop app run a terminal-command interaction in an embedded
 * terminal: Electron main redeems the ticket with the server, once, and only
 * spawns the command the server has on record for it.
 */
export const engineAuthTerminalLaunchSchema = z.object({
  expiresAt: z.string(),
  ticket: z.string().regex(ENGINE_AUTH_TICKET_PATTERN),
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
    /** Working directory of the command. */
    cwd: z.string().optional(),
    /** The command line to copy into a terminal when none can be embedded. */
    displayCommand: z.string().optional(),
    /** Variables the command runs with; never secrets. */
    env: z.record(z.string(), z.string()),
    id: z.string(),
    /**
     * Set when the client said it can embed a terminal (desktop); null in
     * a browser, which shows `displayCommand` instead.
     */
    launch: engineAuthTerminalLaunchSchema.nullable().optional(),
    title: z.string().optional(),
    type: z.literal("terminal-command"),
    /** Windows: `args` are one pre-quoted command line (cmd.exe shims). */
    windowsVerbatimArguments: z.boolean().optional(),
  }),
  z.object({
    description: z.string().optional(),
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
  /** The sign-in method the flow runs (null for a sign-out). */
  methodId: z.string().nullable().optional(),
  phase: engineAuthFlowPhaseSchema,
  purpose: z.enum(ENGINE_AUTH_FLOW_PURPOSES).optional(),
});

export const MAX_ENGINE_AUTH_CREDENTIAL_LENGTH = 16_384;
export const MAX_ENGINE_AUTH_CREDENTIAL_FIELDS = 16;

export const engineAuthResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("credentials"),
    values: z
      .record(
        z.string().max(128),
        z.string().max(MAX_ENGINE_AUTH_CREDENTIAL_LENGTH),
      )
      .refine(
        (values) =>
          Object.keys(values).length <= MAX_ENGINE_AUTH_CREDENTIAL_FIELDS,
        { message: "Too many credential fields." },
      ),
  }),
  z.object({
    action: z.enum(["accept", "decline"]),
    type: z.literal("browser"),
  }),
  z.object({
    /**
     * The embedded terminal's exit code, or null when the user ran the
     * command elsewhere and says it finished.
     */
    exitCode: z.number().int().nullable(),
    type: z.literal("terminal"),
  }),
]);

export type EngineAuthMethod = z.infer<typeof engineAuthMethodSchema>;
export type EngineAuthCredentialField = z.infer<
  typeof engineAuthCredentialFieldSchema
>;
export type EngineAuthInteraction = z.infer<typeof engineAuthInteractionSchema>;
export type EngineAuthTerminalInteraction = Extract<
  EngineAuthInteraction,
  { type: "terminal-command" }
>;
export type EngineAuthTerminalLaunch = z.infer<
  typeof engineAuthTerminalLaunchSchema
>;
export type EngineAuthFlowPhase = z.infer<typeof engineAuthFlowPhaseSchema>;
export type EngineAuthFlowState = z.infer<typeof engineAuthFlowStateSchema>;
export type EngineAuthResponse = z.infer<typeof engineAuthResponseSchema>;

/** Phases in which a flow is still running (it can be answered or cancelled). */
export const ACTIVE_ENGINE_AUTH_FLOW_PHASES: readonly EngineAuthFlowPhase[] = [
  "starting",
  "waiting",
  "verifying",
];

export function isEngineAuthFlowActive(
  state: Pick<EngineAuthFlowState, "phase"> | null | undefined,
) {
  return state ? ACTIVE_ENGINE_AUTH_FLOW_PHASES.includes(state.phase) : false;
}

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
