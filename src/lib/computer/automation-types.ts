import { z } from "zod";

export const computerAutomationToolNames = [
  "computer_status",
  "computer_screenshot",
  "computer_action",
  "computer_apps",
  "computer_app",
  "computer_clipboard",
  "computer_ax_tree",
  "computer_ax_find",
  "computer_ax_action",
] as const;

export type ComputerAutomationToolName =
  (typeof computerAutomationToolNames)[number];

export const computerAutomationCommandTypeSchema = z.enum([
  "status",
  "screenshot",
  "action",
  "apps",
  "app",
  "clipboard",
  "ax_tree",
  "ax_find",
  "ax_action",
]);

export const computerButtonSchema = z.enum(["left", "right", "middle"]);
export const computerModifierSchema = z.enum([
  "command",
  "control",
  "option",
  "shift",
]);
export const computerPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
export const computerAxActionNameSchema = z.enum([
  "press",
  "focus",
  "setValue",
  "increment",
  "decrement",
  "showMenu",
]);
export const computerAxQuerySchema = z.object({
  description: z.string().min(1).max(300).optional(),
  role: z.string().min(1).max(120).optional(),
  subrole: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(300).optional(),
  value: z.string().min(1).max(1_000).optional(),
});

export const computerAutomationActionSchema = z.discriminatedUnion("type", [
  z.object({
    displayId: z.number().int().optional(),
    type: z.literal("screenshot"),
  }),
  z.object({
    durationMs: z.number().int().min(0).max(10_000).optional(),
    type: z.literal("wait"),
  }),
  z.object({
    durationMs: z.number().int().min(0).max(2_000).optional(),
    modifiers: z.array(computerModifierSchema).max(4).optional(),
    type: z.literal("move"),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    button: computerButtonSchema.optional().default("left"),
    clickCount: z.number().int().min(1).max(3).optional().default(1),
    modifiers: z.array(computerModifierSchema).max(4).optional(),
    type: z.literal("click"),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    button: computerButtonSchema.optional().default("left"),
    durationMs: z.number().int().min(0).max(5_000).optional(),
    modifiers: z.array(computerModifierSchema).max(4).optional(),
    path: z.array(computerPointSchema).min(2).max(50),
    type: z.literal("drag"),
  }),
  z.object({
    deltaX: z.number().finite().optional().default(0),
    deltaY: z.number().finite(),
    modifiers: z.array(computerModifierSchema).max(4).optional(),
    type: z.literal("scroll"),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
  }),
  z.object({
    text: z.string().min(1).max(10_000),
    type: z.literal("type"),
  }),
  z.object({
    key: z.string().min(1).max(40),
    modifiers: z.array(computerModifierSchema).max(4).optional(),
    type: z.literal("keypress"),
  }),
]);

export const computerAutomationCommandInputSchema = z.union([
  z.object({ type: z.literal("status") }),
  z.object({
    appName: z.string().min(1).max(160).optional(),
    bundleId: z.string().min(1).max(200).optional(),
    displayId: z.number().int().optional(),
    type: z.literal("screenshot"),
  }),
  z.object({
    actions: z.array(computerAutomationActionSchema).min(1).max(25),
    appName: z.string().min(1).max(160).optional(),
    bundleId: z.string().min(1).max(200).optional(),
    type: z.literal("action"),
  }),
  z.object({
    type: z.literal("apps"),
  }),
  z
    .object({
      appName: z.string().min(1).max(160).optional(),
      bundleId: z.string().min(1).max(200).optional(),
      mode: z.enum(["open", "focus"]),
      type: z.literal("app"),
    })
    .refine((value) => Boolean(value.appName || value.bundleId), {
      message: "Provide appName or bundleId.",
      path: ["appName"],
    }),
  z.object({
    text: z.string().max(100_000),
    type: z.literal("clipboard"),
  }),
  z.object({
    appName: z.string().min(1).max(160).optional(),
    bundleId: z.string().min(1).max(200).optional(),
    maxDepth: z.number().int().min(1).max(8).optional(),
    maxNodes: z.number().int().min(1).max(1_000).optional(),
    type: z.literal("ax_tree"),
  }),
  z.object({
    appName: z.string().min(1).max(160).optional(),
    bundleId: z.string().min(1).max(200).optional(),
    maxDepth: z.number().int().min(1).max(10).optional(),
    maxMatches: z.number().int().min(1).max(100).optional(),
    maxNodes: z.number().int().min(1).max(2_000).optional(),
    query: computerAxQuerySchema,
    type: z.literal("ax_find"),
  }),
  z.object({
    action: computerAxActionNameSchema,
    appName: z.string().min(1).max(160).optional(),
    axPath: z.string().min(1).max(400).optional(),
    bundleId: z.string().min(1).max(200).optional(),
    query: computerAxQuerySchema.optional(),
    type: z.literal("ax_action"),
    value: z.string().max(100_000).optional(),
  }),
]);

export const computerAutomationCommandEnvelopeSchema = z.object({
  command: computerAutomationCommandInputSchema,
  id: z.string().min(1),
  threadId: z.string().min(1),
});

export const computerDisplayBoundsSchema = z.object({
  height: z.number().positive(),
  width: z.number().positive(),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const computerDisplaySchema = z.object({
  bounds: computerDisplayBoundsSchema,
  id: z.number(),
  primary: z.boolean(),
  scaleFactor: z.number().nullable().optional(),
});

export const computerCursorSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const computerAutomationActionResultSchema = z.object({
  index: z.number().int().min(0),
  message: z.string().optional(),
  ok: z.boolean(),
  screenshot: z
    .object({
      bounds: computerDisplayBoundsSchema.nullable().optional(),
      dataUrl: z.string().nullable(),
      displayId: z.number().nullable().optional(),
    })
    .optional(),
  type: z.string(),
});

export const computerAppInfoSchema = z.object({
  bundleId: z.string().nullable().optional(),
  name: z.string(),
});
export type ComputerAxNode = {
  actions?: string[];
  axPath: string;
  bounds?: z.infer<typeof computerDisplayBoundsSchema> | null;
  children?: ComputerAxNode[];
  description?: string | null;
  enabled?: boolean | null;
  focused?: boolean | null;
  id?: string | null;
  role?: string | null;
  subrole?: string | null;
  title?: string | null;
  value?: string | null;
};
export const computerAxNodeSchema: z.ZodType<ComputerAxNode> = z.object({
  actions: z.array(z.string()).optional(),
  axPath: z.string(),
  bounds: computerDisplayBoundsSchema.nullable().optional(),
  children: z.lazy(() => z.array(computerAxNodeSchema)).optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().nullable().optional(),
  focused: z.boolean().nullable().optional(),
  id: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  subrole: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  value: z.string().nullable().optional(),
});

const platformSchema = z.enum(["darwin", "linux", "win32"]);

export const computerAutomationCommandResultSchema = z.discriminatedUnion(
  "type",
  [
    z.object({
      accessibilityTrusted: z.boolean().nullable(),
      cursor: computerCursorSchema.nullable(),
      displays: z.array(computerDisplaySchema),
      message: z.string().optional(),
      platform: platformSchema,
      screenCaptureTrusted: z.boolean().nullable(),
      supported: z.boolean(),
      type: z.literal("status"),
    }),
    z.object({
      bounds: computerDisplayBoundsSchema.nullable().optional(),
      dataUrl: z.string().nullable(),
      displayId: z.number().nullable().optional(),
      message: z.string().optional(),
      platform: platformSchema,
      supported: z.boolean(),
      type: z.literal("screenshot"),
    }),
    z.object({
      actions: z.array(computerAutomationActionResultSchema),
      cursor: computerCursorSchema.nullable(),
      message: z.string().optional(),
      platform: platformSchema,
      supported: z.boolean(),
      type: z.literal("action"),
    }),
    z.object({
      apps: z.array(computerAppInfoSchema),
      frontmostApp: computerAppInfoSchema.nullable(),
      message: z.string().optional(),
      platform: platformSchema,
      supported: z.boolean(),
      type: z.literal("apps"),
    }),
    z.object({
      app: computerAppInfoSchema.nullable(),
      message: z.string().optional(),
      mode: z.enum(["open", "focus"]),
      platform: platformSchema,
      supported: z.boolean(),
      type: z.literal("app"),
    }),
    z.object({
      message: z.string().optional(),
      platform: platformSchema,
      supported: z.boolean(),
      textLength: z.number().int().min(0),
      type: z.literal("clipboard"),
    }),
    z.object({
      frontmostApp: computerAppInfoSchema.nullable(),
      message: z.string().optional(),
      nodeCount: z.number().int().min(0),
      platform: platformSchema,
      root: computerAxNodeSchema.nullable(),
      supported: z.boolean(),
      type: z.literal("ax_tree"),
    }),
    z.object({
      frontmostApp: computerAppInfoSchema.nullable(),
      matches: z.array(computerAxNodeSchema),
      message: z.string().optional(),
      nodeCount: z.number().int().min(0),
      platform: platformSchema,
      supported: z.boolean(),
      type: z.literal("ax_find"),
    }),
    z.object({
      action: computerAxActionNameSchema,
      element: computerAxNodeSchema.nullable(),
      message: z.string().optional(),
      ok: z.boolean(),
      platform: platformSchema,
      supported: z.boolean(),
      type: z.literal("ax_action"),
    }),
  ],
);

export const computerAutomationResultEnvelopeSchema = z.discriminatedUnion(
  "ok",
  [
    z.object({
      commandId: z.string().min(1),
      ok: z.literal(true),
      result: computerAutomationCommandResultSchema,
      threadId: z.string().min(1),
    }),
    z.object({
      commandId: z.string().min(1),
      error: z.string().min(1),
      ok: z.literal(false),
      threadId: z.string().min(1),
    }),
  ],
);

export type ComputerAutomationAction = z.infer<
  typeof computerAutomationActionSchema
>;
export type ComputerAutomationCommandInput = z.infer<
  typeof computerAutomationCommandInputSchema
>;
export type ComputerAutomationCommandEnvelope = z.infer<
  typeof computerAutomationCommandEnvelopeSchema
>;
export type ComputerAutomationCommandResult = z.infer<
  typeof computerAutomationCommandResultSchema
>;
export type ComputerAutomationResultEnvelope = z.infer<
  typeof computerAutomationResultEnvelopeSchema
>;
