import { z } from "zod";

export const browserAutomationToolNames = [
  "browser_tabs",
  "browser_open",
  "browser_navigate",
  "browser_back",
  "browser_forward",
  "browser_reload",
  "browser_snapshot",
  "browser_screenshot",
  "browser_click",
  "browser_fill",
  "browser_press",
  "browser_console_logs",
] as const;

export type BrowserAutomationToolName =
  (typeof browserAutomationToolNames)[number];

export const browserAutomationCommandTypeSchema = z.enum([
  "tabs",
  "open",
  "navigate",
  "back",
  "forward",
  "reload",
  "snapshot",
  "screenshot",
  "click",
  "fill",
  "press",
  "console_logs",
]);

const tabTargetSchema = z.object({
  tabId: z.string().min(1).optional(),
});

export const browserAutomationCommandInputSchema = z
  .union([
    z.object({ type: z.literal("tabs") }),
    z.object({
      type: z.literal("open"),
      url: z.string().min(1).optional(),
    }),
    tabTargetSchema.extend({
      type: z.literal("navigate"),
      url: z.string().min(1),
    }),
    tabTargetSchema.extend({ type: z.literal("back") }),
    tabTargetSchema.extend({ type: z.literal("forward") }),
    tabTargetSchema.extend({ type: z.literal("reload") }),
    tabTargetSchema.extend({ type: z.literal("snapshot") }),
    tabTargetSchema.extend({
      fullPage: z.boolean().optional(),
      type: z.literal("screenshot"),
    }),
    tabTargetSchema.extend({
      selector: z.string().min(1).optional(),
      type: z.literal("click"),
      x: z.number().finite().optional(),
      y: z.number().finite().optional(),
    }),
    tabTargetSchema.extend({
      selector: z.string().min(1),
      type: z.literal("fill"),
      value: z.string(),
    }),
    tabTargetSchema.extend({
      key: z.string().min(1),
      selector: z.string().min(1).optional(),
      type: z.literal("press"),
    }),
    tabTargetSchema.extend({
      levels: z
        .array(z.enum(["debug", "info", "log", "warn", "error"]))
        .max(5)
        .optional(),
      limit: z.number().int().min(1).max(200).optional(),
      type: z.literal("console_logs"),
    }),
  ])
  .superRefine((value, ctx) => {
    if (
      value.type === "click" &&
      !value.selector &&
      (value.x === undefined || value.y === undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either selector or x/y coordinates.",
        path: ["selector"],
      });
    }
  });

export const browserAutomationCommandEnvelopeSchema = z.object({
  command: browserAutomationCommandInputSchema,
  id: z.string().min(1),
  threadId: z.string().min(1),
});

export const browserAutomationTabSchema = z.object({
  active: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  id: z.string(),
  isLoading: z.boolean(),
  title: z.string(),
  url: z.string(),
});

export const browserAutomationConsoleLogSchema = z.object({
  level: z.enum(["debug", "info", "log", "warn", "error"]),
  message: z.string(),
  timestamp: z.string(),
  url: z.string().nullable(),
});

export const browserAutomationCommandResultSchema = z.discriminatedUnion(
  "type",
  [
    z.object({
      activeTabId: z.string().nullable(),
      tabs: z.array(browserAutomationTabSchema),
      type: z.literal("tabs"),
    }),
    z.object({
      tab: browserAutomationTabSchema,
      type: z.literal("tab"),
    }),
    z.object({
      activeTabId: z.string().nullable(),
      content: z.string(),
      tab: browserAutomationTabSchema,
      title: z.string().nullable(),
      type: z.literal("snapshot"),
      url: z.string(),
    }),
    z.object({
      dataUrl: z.string(),
      tab: browserAutomationTabSchema,
      type: z.literal("screenshot"),
    }),
    z.object({
      logs: z.array(browserAutomationConsoleLogSchema),
      tab: browserAutomationTabSchema,
      type: z.literal("console_logs"),
    }),
    z.object({
      message: z.string(),
      tab: browserAutomationTabSchema.optional(),
      type: z.literal("ok"),
    }),
  ],
);

export const browserAutomationResultEnvelopeSchema = z.discriminatedUnion(
  "ok",
  [
    z.object({
      commandId: z.string().min(1),
      ok: z.literal(true),
      result: browserAutomationCommandResultSchema,
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

export type BrowserAutomationCommandInput = z.infer<
  typeof browserAutomationCommandInputSchema
>;
export type BrowserAutomationCommandEnvelope = z.infer<
  typeof browserAutomationCommandEnvelopeSchema
>;
export type BrowserAutomationCommandResult = z.infer<
  typeof browserAutomationCommandResultSchema
>;
export type BrowserAutomationResultEnvelope = z.infer<
  typeof browserAutomationResultEnvelopeSchema
>;
export type BrowserAutomationTab = z.infer<typeof browserAutomationTabSchema>;
export type BrowserAutomationConsoleLog = z.infer<
  typeof browserAutomationConsoleLogSchema
>;
