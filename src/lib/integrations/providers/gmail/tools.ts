import { tool } from "ai";
import { z } from "zod";

import type { IntegrationContext } from "../../types";
import { GmailService } from "./service";

function getGmailService(context: IntegrationContext): GmailService {
  const token = context.tokens.gmail;
  if (!token) {
    throw new Error(
      "Gmail is not connected. Connect it in Settings > Integrations.",
    );
  }
  return new GmailService(token);
}

const MAX_BODY_LENGTH_FOR_MODEL = 2000;

function truncateBody(body: string): string {
  if (body.length <= MAX_BODY_LENGTH_FOR_MODEL) return body;
  return body.slice(0, MAX_BODY_LENGTH_FOR_MODEL) + "\n...[truncated]";
}

export function buildGmailTools(
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  return {
    gmail_search: tool({
      description:
        "Search Gmail emails by query, label, or date. Uses Gmail search syntax (e.g. 'from:user@example.com', 'subject:meeting', 'is:unread').",
      inputSchema: z.object({
        query: z.string().describe("Gmail search query string."),
        maxResults: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe("Maximum number of results to return."),
      }),
      outputSchema: z.object({
        emails: z.array(
          z.object({
            id: z.string(),
            threadId: z.string(),
            from: z.string(),
            to: z.string(),
            subject: z.string(),
            snippet: z.string(),
            date: z.string(),
            isUnread: z.boolean(),
            isStarred: z.boolean(),
            labelIds: z.array(z.string()),
            attachmentCount: z.number(),
          }),
        ),
        totalResults: z.number(),
      }),
      needsApproval: () => approvalFn("gmail_search"),
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value: {
          totalResults: output.totalResults,
          emails: output.emails.map((e) => ({
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: e.snippet,
            date: e.date,
            isUnread: e.isUnread,
          })),
        },
      }),
      execute: async (input) => {
        const service = getGmailService(context);
        const result = await service.searchEmails({
          query: input.query,
          maxResults: input.maxResults,
        });
        return {
          emails: result.emails.map((e) => ({
            id: e.id,
            threadId: e.threadId,
            from: e.from,
            to: e.to,
            subject: e.subject,
            snippet: e.snippet,
            date: e.date,
            isUnread: e.isUnread,
            isStarred: e.isStarred,
            labelIds: e.labelIds,
            attachmentCount: e.attachments.length,
          })),
          totalResults: result.emails.length,
        };
      },
    }),

    gmail_get_email: tool({
      description:
        "Get full email content by message ID, including body, headers, and attachment info.",
      inputSchema: z.object({
        messageId: z.string().describe("The Gmail message ID to retrieve."),
      }),
      outputSchema: z.object({
        id: z.string(),
        threadId: z.string(),
        from: z.string(),
        to: z.string(),
        cc: z.string(),
        bcc: z.string(),
        subject: z.string(),
        body: z.string(),
        date: z.string(),
        isUnread: z.boolean(),
        isStarred: z.boolean(),
        labelIds: z.array(z.string()),
        attachments: z.array(
          z.object({
            filename: z.string(),
            mimeType: z.string(),
            size: z.number(),
          }),
        ),
      }),
      needsApproval: () => approvalFn("gmail_get_email"),
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value: {
          id: output.id,
          from: output.from,
          to: output.to,
          cc: output.cc,
          subject: output.subject,
          body: truncateBody(output.body),
          date: output.date,
          attachments: output.attachments,
        },
      }),
      execute: async (input) => {
        const service = getGmailService(context);
        return service.getEmail(input.messageId);
      },
    }),

    gmail_send: tool({
      description:
        "Send a new email. Requires recipient, subject, and HTML body.",
      inputSchema: z.object({
        to: z
          .string()
          .describe("Recipient email address(es), comma-separated."),
        subject: z.string().describe("Email subject line."),
        body: z.string().describe("Email body in HTML format."),
        cc: z.string().optional().describe("CC recipients, comma-separated."),
        bcc: z.string().optional().describe("BCC recipients, comma-separated."),
      }),
      outputSchema: z.object({
        messageId: z.string(),
        threadId: z.string(),
        status: z.literal("sent"),
      }),
      needsApproval: () => approvalFn("gmail_send"),
      execute: async (input) => {
        const service = getGmailService(context);
        const result = await service.sendEmail(input);
        return { ...result, status: "sent" as const };
      },
    }),

    gmail_reply: tool({
      description:
        "Reply to an existing email thread. The reply is sent to the original sender.",
      inputSchema: z.object({
        messageId: z.string().describe("The message ID to reply to."),
        body: z.string().describe("Reply body in HTML format."),
        cc: z.string().optional().describe("CC recipients, comma-separated."),
        bcc: z.string().optional().describe("BCC recipients, comma-separated."),
      }),
      outputSchema: z.object({
        messageId: z.string(),
        threadId: z.string(),
        status: z.literal("sent"),
      }),
      needsApproval: () => approvalFn("gmail_reply"),
      execute: async (input) => {
        const service = getGmailService(context);
        const result = await service.replyToEmail(input);
        return { ...result, status: "sent" as const };
      },
    }),

    gmail_create_draft: tool({
      description: "Create a draft email without sending it.",
      inputSchema: z.object({
        to: z
          .string()
          .describe("Recipient email address(es), comma-separated."),
        subject: z.string().describe("Email subject line."),
        body: z.string().describe("Email body in HTML format."),
        cc: z.string().optional().describe("CC recipients, comma-separated."),
        bcc: z.string().optional().describe("BCC recipients, comma-separated."),
      }),
      outputSchema: z.object({
        draftId: z.string(),
        messageId: z.string(),
        status: z.literal("drafted"),
      }),
      needsApproval: () => approvalFn("gmail_create_draft"),
      execute: async (input) => {
        const service = getGmailService(context);
        const result = await service.createDraft(input);
        return { ...result, status: "drafted" as const };
      },
    }),

    gmail_list_labels: tool({
      description: "List all Gmail labels for the connected account.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        labels: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
          }),
        ),
      }),
      needsApproval: () => approvalFn("gmail_list_labels"),
      execute: async () => {
        const service = getGmailService(context);
        const labels = await service.listLabels();
        return { labels };
      },
    }),

    gmail_manage_labels: tool({
      description: "Add or remove labels from one or more emails.",
      inputSchema: z.object({
        messageIds: z
          .array(z.string())
          .min(1)
          .describe("Message IDs to modify."),
        addLabelIds: z
          .array(z.string())
          .optional()
          .describe("Label IDs to add."),
        removeLabelIds: z
          .array(z.string())
          .optional()
          .describe("Label IDs to remove."),
      }),
      outputSchema: z.object({
        modifiedCount: z.number(),
      }),
      needsApproval: () => approvalFn("gmail_manage_labels"),
      execute: async (input) => {
        const service = getGmailService(context);
        return service.manageLabels(input);
      },
    }),

    gmail_archive: tool({
      description: "Archive an email by removing it from the inbox.",
      inputSchema: z.object({
        messageId: z.string().describe("The message ID to archive."),
      }),
      outputSchema: z.object({ status: z.literal("archived") }),
      needsApproval: () => approvalFn("gmail_archive"),
      execute: async (input) => {
        const service = getGmailService(context);
        await service.archiveEmail(input.messageId);
        return { status: "archived" as const };
      },
    }),

    gmail_trash: tool({
      description: "Move an email to trash.",
      inputSchema: z.object({
        messageId: z.string().describe("The message ID to trash."),
      }),
      outputSchema: z.object({ status: z.literal("trashed") }),
      needsApproval: () => approvalFn("gmail_trash"),
      execute: async (input) => {
        const service = getGmailService(context);
        await service.trashEmail(input.messageId);
        return { status: "trashed" as const };
      },
    }),
  };
}
