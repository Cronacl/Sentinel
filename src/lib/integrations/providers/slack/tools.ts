import { tool } from "ai";
import { z } from "zod";
import { withToolApproval } from "@/lib/ai/chat/tools/approval";

import type { IntegrationContext } from "../../types";
import { SlackService } from "./service";

function getSlackService(context: IntegrationContext): SlackService {
  const token = context.tokens.slack;
  if (!token)
    throw new Error(
      "Slack is not connected. Please connect Slack in Settings > Integrations.",
    );
  return new SlackService(token);
}

const channelSchema = z.object({
  id: z.string(),
  name: z.string(),
  topic: z.string(),
  purpose: z.string(),
  isPrivate: z.boolean(),
  isArchived: z.boolean(),
  memberCount: z.number(),
  createdAt: z.string(),
});

const messageSchema = z.object({
  ts: z.string(),
  text: z.string(),
  userId: z.string(),
  username: z.string(),
  channelId: z.string(),
  channelName: z.string(),
  threadTs: z.string().nullable(),
  replyCount: z.number(),
  timestamp: z.string(),
  permalink: z.string().nullable(),
});

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  realName: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  isAdmin: z.boolean(),
  isBot: z.boolean(),
  isActive: z.boolean(),
  avatar: z.string().nullable(),
  timezone: z.string().nullable(),
});

export function buildSlackTools(
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  return {
    slack_list_channels: withToolApproval(
      tool({
        description:
          "List Slack channels in the workspace. Can filter by public/private channels and exclude archived ones.",
        inputSchema: z.object({
          types: z
            .string()
            .optional()
            .describe(
              "Channel types to list, e.g. 'public_channel,private_channel'. Defaults to both.",
            ),
          limit: z
            .number()
            .optional()
            .describe("Max channels to return (default 100)"),
          excludeArchived: z
            .boolean()
            .optional()
            .describe("Exclude archived channels (default true)"),
        }),
        outputSchema: z.object({
          channels: z.array(channelSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.listChannels(input);
        },
      }),
      () => approvalFn("slack_list_channels"),
    ),

    slack_get_channel: withToolApproval(
      tool({
        description:
          "Get detailed information about a specific Slack channel by its ID, including topic, purpose, and member count.",
        inputSchema: z.object({
          channelId: z
            .string()
            .min(1)
            .describe("The Slack channel ID (e.g. C01ABCDEF)"),
        }),
        outputSchema: channelSchema,
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.getChannel(input.channelId);
        },
      }),
      () => approvalFn("slack_get_channel"),
    ),

    slack_create_channel: withToolApproval(
      tool({
        description:
          "Create a new Slack channel. Can create public or private channels.",
        inputSchema: z.object({
          name: z
            .string()
            .min(1)
            .describe("Channel name (lowercase, no spaces, max 80 chars)"),
          isPrivate: z
            .boolean()
            .optional()
            .describe("Create as private channel (default false)"),
        }),
        outputSchema: channelSchema,
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.createChannel(input);
        },
      }),
      () => approvalFn("slack_create_channel"),
    ),

    slack_archive_channel: withToolApproval(
      tool({
        description:
          "Archive a Slack channel. Archived channels are read-only.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID to archive"),
        }),
        outputSchema: z.object({ success: z.boolean() }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.archiveChannel(input.channelId);
        },
      }),
      () => approvalFn("slack_archive_channel"),
    ),

    slack_invite_to_channel: withToolApproval(
      tool({
        description: "Invite one or more users to a Slack channel.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          userIds: z
            .array(z.string().min(1))
            .min(1)
            .describe("User IDs to invite"),
        }),
        outputSchema: z.object({ success: z.boolean() }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.inviteToChannel(input);
        },
      }),
      () => approvalFn("slack_invite_to_channel"),
    ),

    slack_kick_from_channel: withToolApproval(
      tool({
        description: "Remove a user from a Slack channel.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          userId: z.string().min(1).describe("The user ID to remove"),
        }),
        outputSchema: z.object({ success: z.boolean() }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.kickFromChannel(input);
        },
      }),
      () => approvalFn("slack_kick_from_channel"),
    ),

    slack_set_topic: withToolApproval(
      tool({
        description: "Set or update the topic of a Slack channel.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          topic: z.string().describe("The new channel topic text"),
        }),
        outputSchema: z.object({ topic: z.string() }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.setTopic(input);
        },
      }),
      () => approvalFn("slack_set_topic"),
    ),

    slack_set_purpose: withToolApproval(
      tool({
        description: "Set or update the purpose of a Slack channel.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          purpose: z.string().describe("The new channel purpose text"),
        }),
        outputSchema: z.object({ purpose: z.string() }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.setPurpose(input);
        },
      }),
      () => approvalFn("slack_set_purpose"),
    ),

    slack_search_messages: withToolApproval(
      tool({
        description:
          "Search Slack messages across the workspace by query text. Supports Slack search modifiers like from:, in:, before:, after:, etc.",
        inputSchema: z.object({
          query: z
            .string()
            .min(1)
            .describe("Search query text (at least 1 character)"),
          count: z
            .number()
            .optional()
            .describe("Max results to return (default 20)"),
          sortBy: z
            .enum(["timestamp", "score"])
            .optional()
            .describe("Sort by timestamp or relevance score"),
          sortDir: z
            .enum(["asc", "desc"])
            .optional()
            .describe("Sort direction"),
        }),
        outputSchema: z.object({
          messages: z.array(messageSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.searchMessages(input);
        },
      }),
      () => approvalFn("slack_search_messages"),
    ),

    slack_post_message: withToolApproval(
      tool({
        description:
          "Post a new message to a Slack channel. Supports Slack markdown formatting (mrkdwn).",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID to post to"),
          text: z
            .string()
            .min(1)
            .describe("Message text (supports Slack mrkdwn)"),
        }),
        outputSchema: messageSchema,
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.postMessage(input);
        },
      }),
      () => approvalFn("slack_post_message"),
    ),

    slack_reply_to_thread: withToolApproval(
      tool({
        description: "Reply to an existing message thread in a Slack channel.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          threadTs: z
            .string()
            .min(1)
            .describe("The timestamp (ts) of the parent message"),
          text: z.string().min(1).describe("Reply text"),
        }),
        outputSchema: messageSchema,
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.replyToThread(input);
        },
      }),
      () => approvalFn("slack_reply_to_thread"),
    ),

    slack_update_message: withToolApproval(
      tool({
        description: "Update an existing Slack message.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          ts: z
            .string()
            .min(1)
            .describe("The timestamp (ts) of the message to update"),
          text: z.string().min(1).describe("New message text"),
        }),
        outputSchema: messageSchema,
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.updateMessage(input);
        },
      }),
      () => approvalFn("slack_update_message"),
    ),

    slack_delete_message: withToolApproval(
      tool({
        description: "Delete a Slack message.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          ts: z
            .string()
            .min(1)
            .describe("The timestamp (ts) of the message to delete"),
        }),
        outputSchema: z.object({ success: z.boolean() }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.deleteMessage(input);
        },
      }),
      () => approvalFn("slack_delete_message"),
    ),

    slack_add_reaction: withToolApproval(
      tool({
        description:
          "Add an emoji reaction to a Slack message. Use the emoji name without colons (e.g. 'thumbsup' not ':thumbsup:').",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          ts: z.string().min(1).describe("The timestamp (ts) of the message"),
          emoji: z
            .string()
            .min(1)
            .describe("Emoji name without colons (e.g. 'thumbsup')"),
        }),
        outputSchema: z.object({ success: z.boolean() }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.addReaction(input);
        },
      }),
      () => approvalFn("slack_add_reaction"),
    ),

    slack_schedule_message: withToolApproval(
      tool({
        description:
          "Schedule a message to be posted to a Slack channel at a future time.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          text: z.string().min(1).describe("Message text"),
          postAt: z
            .number()
            .describe("Unix timestamp for when to send the message"),
        }),
        outputSchema: z.object({
          scheduledMessageId: z.string(),
          postAt: z.number(),
        }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.scheduleMessage(input);
        },
      }),
      () => approvalFn("slack_schedule_message"),
    ),

    slack_pin_message: withToolApproval(
      tool({
        description: "Pin a message in a Slack channel.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          ts: z
            .string()
            .min(1)
            .describe("The timestamp (ts) of the message to pin"),
        }),
        outputSchema: z.object({ success: z.boolean() }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.pinMessage(input);
        },
      }),
      () => approvalFn("slack_pin_message"),
    ),

    slack_unpin_message: withToolApproval(
      tool({
        description: "Unpin a message in a Slack channel.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          ts: z
            .string()
            .min(1)
            .describe("The timestamp (ts) of the message to unpin"),
        }),
        outputSchema: z.object({ success: z.boolean() }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.unpinMessage(input);
        },
      }),
      () => approvalFn("slack_unpin_message"),
    ),

    slack_get_thread: withToolApproval(
      tool({
        description:
          "Get all replies in a Slack message thread, including the parent message.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          threadTs: z
            .string()
            .min(1)
            .describe("The timestamp (ts) of the parent message"),
          limit: z
            .number()
            .optional()
            .describe("Max replies to return (default 50)"),
        }),
        outputSchema: z.object({
          messages: z.array(messageSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.getThread(input);
        },
      }),
      () => approvalFn("slack_get_thread"),
    ),

    slack_list_users: withToolApproval(
      tool({
        description:
          "List members of the Slack workspace. Excludes bots and Slackbot.",
        inputSchema: z.object({
          limit: z
            .number()
            .optional()
            .describe("Max users to return (default 200)"),
        }),
        outputSchema: z.object({
          users: z.array(userSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.listUsers(input);
        },
      }),
      () => approvalFn("slack_list_users"),
    ),

    slack_get_user: withToolApproval(
      tool({
        description:
          "Get detailed information about a specific Slack user by their user ID.",
        inputSchema: z.object({
          userId: z
            .string()
            .min(1)
            .describe("The Slack user ID (e.g. U01ABCDEF)"),
        }),
        outputSchema: userSchema,
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.getUser(input.userId);
        },
      }),
      () => approvalFn("slack_get_user"),
    ),

    slack_get_history: withToolApproval(
      tool({
        description:
          "Get recent message history from a Slack channel. Returns messages in reverse chronological order.",
        inputSchema: z.object({
          channelId: z.string().min(1).describe("The channel ID"),
          limit: z
            .number()
            .optional()
            .describe("Max messages to return (default 30)"),
          oldest: z
            .string()
            .optional()
            .describe("Only messages after this Unix timestamp"),
          latest: z
            .string()
            .optional()
            .describe("Only messages before this Unix timestamp"),
        }),
        outputSchema: z.object({
          messages: z.array(messageSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getSlackService(context);
          return svc.getHistory(input);
        },
      }),
      () => approvalFn("slack_get_history"),
    ),
  };
}
