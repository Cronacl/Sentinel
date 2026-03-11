import { z } from "zod";

import { TOOL_APPROVAL_TOOL_NAMES } from "@/lib/ai/chat/tool-approval-policy";

export const toolApprovalNameSchema = z.enum(TOOL_APPROVAL_TOOL_NAMES);

export const toolApprovalUpdateItemSchema = z.object({
  requireApproval: z.boolean(),
  toolName: toolApprovalNameSchema,
});

export const approvalsUpdateSchema = z.union([
  toolApprovalUpdateItemSchema,
  z.object({
    policies: z
      .array(toolApprovalUpdateItemSchema)
      .min(1)
      .max(TOOL_APPROVAL_TOOL_NAMES.length),
  }),
]);

export type ToolApprovalUpdateInput = z.infer<typeof approvalsUpdateSchema>;
