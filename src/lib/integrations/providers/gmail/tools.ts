import { tool } from "ai";
import { z } from "zod";
import { withToolApproval } from "@/lib/ai/chat/tools/approval";

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
    gmail_search: withToolApproval(
      tool({
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
      () => approvalFn("gmail_search"),
    ),

    gmail_get_email: withToolApproval(
      tool({
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
      () => approvalFn("gmail_get_email"),
    ),

    gmail_send: withToolApproval(
      tool({
        description:
          "Send a new email. Requires recipient, subject, and HTML body.",
        inputSchema: z.object({
          to: z
            .string()
            .describe("Recipient email address(es), comma-separated."),
          subject: z.string().describe("Email subject line."),
          body: z.string().describe("Email body in HTML format."),
          cc: z.string().optional().describe("CC recipients, comma-separated."),
          bcc: z
            .string()
            .optional()
            .describe("BCC recipients, comma-separated."),
        }),
        outputSchema: z.object({
          messageId: z.string(),
          threadId: z.string(),
          status: z.literal("sent"),
        }),
        execute: async (input) => {
          const service = getGmailService(context);
          const result = await service.sendEmail(input);
          return { ...result, status: "sent" as const };
        },
      }),
      () => approvalFn("gmail_send"),
    ),

    gmail_reply: withToolApproval(
      tool({
        description:
          "Reply to an existing email thread. The reply is sent to the original sender.",
        inputSchema: z.object({
          messageId: z.string().describe("The message ID to reply to."),
          body: z.string().describe("Reply body in HTML format."),
          cc: z.string().optional().describe("CC recipients, comma-separated."),
          bcc: z
            .string()
            .optional()
            .describe("BCC recipients, comma-separated."),
        }),
        outputSchema: z.object({
          messageId: z.string(),
          threadId: z.string(),
          status: z.literal("sent"),
        }),
        execute: async (input) => {
          const service = getGmailService(context);
          const result = await service.replyToEmail(input);
          return { ...result, status: "sent" as const };
        },
      }),
      () => approvalFn("gmail_reply"),
    ),

    gmail_create_draft: withToolApproval(
      tool({
        description: "Create a draft email without sending it.",
        inputSchema: z.object({
          to: z
            .string()
            .describe("Recipient email address(es), comma-separated."),
          subject: z.string().describe("Email subject line."),
          body: z.string().describe("Email body in HTML format."),
          cc: z.string().optional().describe("CC recipients, comma-separated."),
          bcc: z
            .string()
            .optional()
            .describe("BCC recipients, comma-separated."),
        }),
        outputSchema: z.object({
          draftId: z.string(),
          messageId: z.string(),
          status: z.literal("drafted"),
        }),
        execute: async (input) => {
          const service = getGmailService(context);
          const result = await service.createDraft(input);
          return { ...result, status: "drafted" as const };
        },
      }),
      () => approvalFn("gmail_create_draft"),
    ),

    gmail_list_labels: withToolApproval(
      tool({
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
        execute: async () => {
          const service = getGmailService(context);
          const labels = await service.listLabels();
          return { labels };
        },
      }),
      () => approvalFn("gmail_list_labels"),
    ),

    gmail_manage_labels: withToolApproval(
      tool({
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
        execute: async (input) => {
          const service = getGmailService(context);
          return service.manageLabels(input);
        },
      }),
      () => approvalFn("gmail_manage_labels"),
    ),

    gmail_archive: withToolApproval(
      tool({
        description: "Archive an email by removing it from the inbox.",
        inputSchema: z.object({
          messageId: z.string().describe("The message ID to archive."),
        }),
        outputSchema: z.object({ status: z.literal("archived") }),
        execute: async (input) => {
          const service = getGmailService(context);
          await service.archiveEmail(input.messageId);
          return { status: "archived" as const };
        },
      }),
      () => approvalFn("gmail_archive"),
    ),

    gmail_trash: withToolApproval(
      tool({
        description: "Move an email to trash.",
        inputSchema: z.object({
          messageId: z.string().describe("The message ID to trash."),
        }),
        outputSchema: z.object({ status: z.literal("trashed") }),
        execute: async (input) => {
          const service = getGmailService(context);
          await service.trashEmail(input.messageId);
          return { status: "trashed" as const };
        },
      }),
      () => approvalFn("gmail_trash"),
    ),

    gmail_star: withToolApproval(
      tool({
        description: "Star an email to mark it as important.",
        inputSchema: z.object({
          messageId: z.string().describe("The message ID to star."),
        }),
        outputSchema: z.object({ status: z.literal("starred") }),
        execute: async (input) => {
          const service = getGmailService(context);
          await service.starEmail(input.messageId);
          return { status: "starred" as const };
        },
      }),
      () => approvalFn("gmail_star"),
    ),

    gmail_unstar: withToolApproval(
      tool({
        description: "Remove the star from an email.",
        inputSchema: z.object({
          messageId: z.string().describe("The message ID to unstar."),
        }),
        outputSchema: z.object({ status: z.literal("unstarred") }),
        execute: async (input) => {
          const service = getGmailService(context);
          await service.unstarEmail(input.messageId);
          return { status: "unstarred" as const };
        },
      }),
      () => approvalFn("gmail_unstar"),
    ),

    gmail_mark_read: withToolApproval(
      tool({
        description: "Mark an email as read.",
        inputSchema: z.object({
          messageId: z.string().describe("The message ID to mark as read."),
        }),
        outputSchema: z.object({ status: z.literal("read") }),
        execute: async (input) => {
          const service = getGmailService(context);
          await service.markAsRead(input.messageId);
          return { status: "read" as const };
        },
      }),
      () => approvalFn("gmail_mark_read"),
    ),

    gmail_mark_unread: withToolApproval(
      tool({
        description: "Mark an email as unread.",
        inputSchema: z.object({
          messageId: z.string().describe("The message ID to mark as unread."),
        }),
        outputSchema: z.object({ status: z.literal("unread") }),
        execute: async (input) => {
          const service = getGmailService(context);
          await service.markAsUnread(input.messageId);
          return { status: "unread" as const };
        },
      }),
      () => approvalFn("gmail_mark_unread"),
    ),

    gmail_forward: withToolApproval(
      tool({
        description:
          "Forward an email to another recipient. Optionally add a message above the forwarded content.",
        inputSchema: z.object({
          messageId: z.string().describe("The message ID to forward."),
          to: z
            .string()
            .describe("Recipient email address(es), comma-separated."),
          additionalBody: z
            .string()
            .optional()
            .describe("Optional message to include above the forwarded email."),
        }),
        outputSchema: z.object({
          messageId: z.string(),
          threadId: z.string(),
          status: z.literal("forwarded"),
        }),
        execute: async (input) => {
          const service = getGmailService(context);
          const result = await service.forwardEmail(input);
          return { ...result, status: "forwarded" as const };
        },
      }),
      () => approvalFn("gmail_forward"),
    ),

    gmail_get_thread: withToolApproval(
      tool({
        description:
          "Get all messages in an email thread/conversation by thread ID.",
        inputSchema: z.object({
          threadId: z.string().describe("The thread ID to retrieve."),
        }),
        outputSchema: z.object({
          threadId: z.string(),
          messageCount: z.number(),
          messages: z.array(
            z.object({
              id: z.string(),
              from: z.string(),
              to: z.string(),
              subject: z.string(),
              snippet: z.string(),
              date: z.string(),
              isUnread: z.boolean(),
            }),
          ),
        }),
        toModelOutput: ({ output }) => ({
          type: "json" as const,
          value: {
            threadId: output.threadId,
            messageCount: output.messageCount,
            messages: output.messages.map((m) => ({
              id: m.id,
              from: m.from,
              subject: m.subject,
              snippet: m.snippet,
              date: m.date,
              isUnread: m.isUnread,
            })),
          },
        }),
        execute: async (input) => {
          const service = getGmailService(context);
          const thread = await service.getThread(input.threadId);
          return {
            threadId: thread.threadId,
            messageCount: thread.messages.length,
            messages: thread.messages.map((m) => ({
              id: m.id,
              from: m.from,
              to: m.to,
              subject: m.subject,
              snippet: m.snippet,
              date: m.date,
              isUnread: m.isUnread,
            })),
          };
        },
      }),
      () => approvalFn("gmail_get_thread"),
    ),

    gmail_bulk_action: withToolApproval(
      tool({
        description:
          "Perform a bulk action on multiple emails at once. Supports archive, trash, star, unstar, mark as read, and mark as unread.",
        inputSchema: z.object({
          messageIds: z
            .array(z.string())
            .min(1)
            .max(50)
            .describe("Message IDs to act on."),
          action: z
            .enum([
              "archive",
              "trash",
              "star",
              "unstar",
              "mark_read",
              "mark_unread",
            ])
            .describe("The action to perform on all messages."),
        }),
        outputSchema: z.object({
          action: z.string(),
          modifiedCount: z.number(),
        }),
        execute: async (input) => {
          const service = getGmailService(context);
          const result = await service.bulkModify(
            input.messageIds,
            input.action,
          );
          return { action: input.action, ...result };
        },
      }),
      () => approvalFn("gmail_bulk_action"),
    ),
  };
}
