import { z } from "zod";

import {
  computerAutomationActionSchema,
  computerAutomationCommandResultSchema,
  computerAxActionNameSchema,
  computerAxQuerySchema,
  type ComputerAutomationCommandInput,
  type ComputerAutomationCommandResult,
} from "@/lib/computer/automation-types";
import { dispatchComputerCommand } from "@/lib/computer/automation-server";

export const computerStatusInputSchema = z.object({});
export const computerScreenshotInputSchema = z.object({
  appName: z
    .string()
    .min(1)
    .max(160)
    .optional()
    .describe(
      "Optional macOS app name to refocus immediately before capture, useful after approval brings Sentinel to the front.",
    ),
  bundleId: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Optional macOS bundle id to refocus immediately before capture.",
    ),
  displayId: z
    .number()
    .int()
    .optional()
    .describe("Optional display id from computer_status. Defaults to primary."),
});
export const computerActionInputSchema = z.object({
  actions: z
    .array(computerAutomationActionSchema)
    .min(1)
    .max(25)
    .describe("Ordered desktop actions to perform in one conservative batch."),
  appName: z
    .string()
    .min(1)
    .max(160)
    .optional()
    .describe(
      "Optional macOS app name to refocus immediately before executing the action batch.",
    ),
  bundleId: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Optional macOS bundle id to refocus immediately before executing the action batch.",
    ),
});
export const computerAppsInputSchema = z.object({});
export const computerAppInputSchema = z
  .object({
    appName: z
      .string()
      .min(1)
      .max(160)
      .optional()
      .describe("macOS application name, such as Safari or Finder."),
    bundleId: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("macOS bundle identifier, such as com.apple.Safari."),
    mode: z
      .enum(["open", "focus"])
      .describe("Open the app if needed, or focus an already available app."),
  })
  .superRefine((value, ctx) => {
    if (!value.appName && !value.bundleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide appName or bundleId.",
        path: ["appName"],
      });
    }
  });
export const computerClipboardInputSchema = z.object({
  text: z
    .string()
    .max(100_000)
    .describe("Text to write to the macOS clipboard for a later paste action."),
});
export const computerAxTreeInputSchema = z.object({
  appName: z
    .string()
    .min(1)
    .max(160)
    .optional()
    .describe("Optional macOS app name to inspect. Defaults to frontmost app."),
  bundleId: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Optional macOS bundle id to inspect. Defaults to frontmost app.",
    ),
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(8)
    .optional()
    .describe("Maximum AX tree depth to return. Defaults to 4."),
  maxNodes: z
    .number()
    .int()
    .min(1)
    .max(1_000)
    .optional()
    .describe("Maximum AX nodes to return. Defaults to 250."),
});
export const computerAxFindInputSchema = z.object({
  appName: z
    .string()
    .min(1)
    .max(160)
    .optional()
    .describe("Optional macOS app name to inspect. Defaults to frontmost app."),
  bundleId: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Optional macOS bundle id to inspect. Defaults to frontmost app.",
    ),
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Maximum AX tree depth to search. Defaults to 8."),
  maxMatches: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum matching elements to return. Defaults to 25."),
  maxNodes: z
    .number()
    .int()
    .min(1)
    .max(2_000)
    .optional()
    .describe("Maximum AX nodes to inspect. Defaults to 750."),
  query: computerAxQuerySchema.describe(
    "Element query. Fields are case-insensitive substring matches.",
  ),
});
export const computerAxActionInputSchema = z.object({
  action: computerAxActionNameSchema.describe(
    "Accessibility action to perform on the matched element.",
  ),
  appName: z
    .string()
    .min(1)
    .max(160)
    .optional()
    .describe("Optional macOS app name to target. Defaults to frontmost app."),
  axPath: z
    .string()
    .min(1)
    .max(400)
    .optional()
    .describe("AX path returned by computer_ax_tree or computer_ax_find."),
  bundleId: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Optional macOS bundle id to target. Defaults to frontmost app."),
  query: computerAxQuerySchema
    .optional()
    .describe("Fallback element query when axPath is not available."),
  value: z
    .string()
    .max(100_000)
    .optional()
    .describe("Value to set when action is setValue."),
});

export const computerToolOutputSchema = computerAutomationCommandResultSchema;
export type ComputerToolOutput = z.infer<typeof computerToolOutputSchema>;

export async function executeComputerTool({
  abortSignal,
  command,
  threadId,
  userId,
}: {
  abortSignal?: AbortSignal;
  command: ComputerAutomationCommandInput;
  threadId: string;
  userId: string;
}): Promise<ComputerAutomationCommandResult> {
  return dispatchComputerCommand({
    abortSignal,
    command,
    threadId,
    userId,
  });
}

export function computerToolModelOutput(
  output: ComputerAutomationCommandResult,
) {
  if (output.type === "screenshot" || output.type === "action") {
    const value =
      output.type === "action"
        ? {
            ...output,
            actions: output.actions.map((action) =>
              action.screenshot?.dataUrl
                ? {
                    ...action,
                    screenshot: {
                      ...action.screenshot,
                      dataUrl:
                        "[omitted from model output; screenshot preview is available in the UI]",
                    },
                  }
                : action,
            ),
          }
        : {
            ...output,
            dataUrl: output.dataUrl
              ? "[omitted from model output; screenshot preview is available in the UI]"
              : null,
          };

    return {
      type: "json" as const,
      value,
    };
  }

  return { type: "json" as const, value: output };
}
