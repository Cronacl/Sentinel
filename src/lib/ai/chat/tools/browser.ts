import { z } from "zod";

import {
  browserAutomationCommandResultSchema,
  type BrowserAutomationCommandInput,
  type BrowserAutomationCommandResult,
} from "@/lib/browser/automation-types";
import { dispatchBrowserCommand } from "@/lib/browser/automation-server";

const tabIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("Optional browser tab id. Defaults to the active browser tab.");

export const browserTabsInputSchema = z.object({});
export const browserOpenInputSchema = z.object({
  url: z
    .string()
    .min(1)
    .optional()
    .describe("URL or search text to open in a new Sentinel browser tab."),
});
export const browserNavigateInputSchema = z.object({
  tabId: tabIdSchema,
  url: z.string().min(1).describe("URL or search text to navigate to."),
});
export const browserTabActionInputSchema = z.object({
  tabId: tabIdSchema,
});
export const browserScreenshotInputSchema = z.object({
  fullPage: z
    .boolean()
    .optional()
    .describe("Reserved for future support. V1 captures the visible viewport."),
  tabId: tabIdSchema,
});
export const browserClickInputSchema = z
  .object({
    selector: z
      .string()
      .min(1)
      .optional()
      .describe("CSS selector from browser_snapshot. Prefer this over x/y."),
    tabId: tabIdSchema,
    x: z.number().finite().optional().describe("Viewport x coordinate."),
    y: z.number().finite().optional().describe("Viewport y coordinate."),
  })
  .superRefine((value, ctx) => {
    if (!value.selector && (value.x === undefined || value.y === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either selector or x/y coordinates.",
        path: ["selector"],
      });
    }
  });
export const browserFillInputSchema = z.object({
  selector: z.string().min(1).describe("CSS selector from browser_snapshot."),
  tabId: tabIdSchema,
  value: z.string().describe("Text to place in the field."),
});
export const browserPressInputSchema = z.object({
  key: z.string().min(1).describe("Key to press, such as Enter or Escape."),
  selector: z
    .string()
    .min(1)
    .optional()
    .describe("Optional CSS selector to focus before pressing the key."),
  tabId: tabIdSchema,
});
export const browserConsoleLogsInputSchema = z.object({
  levels: z
    .array(z.enum(["debug", "info", "log", "warn", "error"]))
    .max(5)
    .optional()
    .describe("Optional console levels to include."),
  limit: z.number().int().min(1).max(200).optional().default(50),
  tabId: tabIdSchema,
});

export const browserToolOutputSchema = browserAutomationCommandResultSchema;
export type BrowserToolOutput = z.infer<typeof browserToolOutputSchema>;

export async function executeBrowserTool({
  abortSignal,
  command,
  userId,
}: {
  abortSignal?: AbortSignal;
  command: BrowserAutomationCommandInput;
  userId: string;
}): Promise<BrowserAutomationCommandResult> {
  return dispatchBrowserCommand({
    abortSignal,
    command,
    userId,
  });
}

export function browserToolModelOutput(output: BrowserAutomationCommandResult) {
  if (output.type === "screenshot") {
    return {
      type: "json" as const,
      value: {
        tab: output.tab,
        type: output.type,
        dataUrl:
          "[omitted from model output; screenshot preview is available in the UI]",
      },
    };
  }

  return { type: "json" as const, value: output };
}
