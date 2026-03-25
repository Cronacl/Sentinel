import { z } from "zod";

import { buildDocumentModelText, loadDocument } from "@/lib/documents/loader";
import type { PermissionMode } from "@/lib/security";

export const loadDocumentInputSchema = z
  .object({
    attachmentIndex: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "1-based index used to disambiguate duplicate filenames on the same message.",
      ),
    filename: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Filename of the attachment to load when source is message_attachment.",
      ),
    maxChars: z
      .number()
      .int()
      .min(1)
      .max(120_000)
      .optional()
      .describe("Optional maximum character count for normalized output."),
    messageId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Optional source message id. Defaults to the current source message when loading attachments.",
      ),
    path: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Workspace file path to load when source is workspace_path. In default permissions mode this must stay inside the selected workspace root or discovered skill directories.",
      ),
    source: z.enum(["workspace_path", "message_attachment"]),
  })
  .superRefine((value, ctx) => {
    if (value.source === "workspace_path" && !value.path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "path is required when source is workspace_path.",
        path: ["path"],
      });
    }

    if (value.source === "message_attachment" && !value.filename) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "filename is required when source is message_attachment.",
        path: ["filename"],
      });
    }
  });

export const loadDocumentOutputSchema = z.object({
  content: z.string(),
  filename: z.string(),
  format: z.string(),
  mediaType: z.string(),
  requestedSource: z.enum(["workspace_path", "message_attachment"]),
  resolvedFromMessageId: z.string().nullable().optional(),
  sheetNames: z.array(z.string()).optional(),
  slideCount: z.number().int().min(0).optional(),
  sourceKind: z.enum(["workspace_path", "message_attachment"]),
  truncated: z.boolean(),
  warnings: z.array(z.string()),
});

export type LoadDocumentInput = z.infer<typeof loadDocumentInputSchema>;
export type LoadDocumentOutput = z.infer<typeof loadDocumentOutputSchema>;

export async function executeLoadDocument({
  defaultDirectory,
  extraAllowedRoots,
  input,
  permissionMode,
  sourceMessageId,
  threadId,
}: {
  defaultDirectory: string;
  extraAllowedRoots?: readonly string[];
  input: LoadDocumentInput;
  permissionMode: PermissionMode;
  sourceMessageId?: string | null;
  threadId: string;
}): Promise<LoadDocumentOutput> {
  const result =
    input.source === "workspace_path"
      ? await loadDocument(
          {
            path: input.path!,
            source: "workspace_path",
          },
          {
            defaultDirectory,
            ...(extraAllowedRoots ? { extraAllowedRoots } : {}),
            permissionMode,
            sourceMessageId,
            threadId,
          },
          input.maxChars,
        )
      : await loadDocument(
          {
            ...(input.attachmentIndex
              ? { attachmentIndex: input.attachmentIndex }
              : {}),
            filename: input.filename!,
            ...(input.messageId ? { messageId: input.messageId } : {}),
            source: "message_attachment",
          },
          {
            defaultDirectory,
            ...(extraAllowedRoots ? { extraAllowedRoots } : {}),
            permissionMode,
            sourceMessageId,
            threadId,
          },
          input.maxChars,
        );

  return {
    ...result,
    requestedSource: input.source,
    ...(input.source === "message_attachment"
      ? { resolvedFromMessageId: input.messageId ?? sourceMessageId ?? null }
      : {}),
  };
}

export function toLoadDocumentModelOutput(output: LoadDocumentOutput) {
  return {
    type: "text" as const,
    value: buildDocumentModelText(output),
  };
}
