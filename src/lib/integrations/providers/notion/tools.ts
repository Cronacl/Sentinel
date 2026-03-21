import { tool } from "ai";
import { z } from "zod";

import type { IntegrationContext } from "../../types";
import { NotionService } from "./service";

function getNotionService(context: IntegrationContext): NotionService {
  const token = context.tokens.notion;
  if (!token)
    throw new Error(
      "Notion is not connected. Please connect it in Settings > Integrations.",
    );
  return new NotionService(token);
}

const pageSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  icon: z.string().nullable(),
  cover: z.string().nullable(),
  parentType: z.string(),
  parentId: z.string().nullable(),
  archived: z.boolean(),
  properties: z.record(z.string()),
  createdTime: z.string(),
  lastEditedTime: z.string(),
  createdBy: z.string(),
  lastEditedBy: z.string(),
});

const databaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  icon: z.string().nullable(),
  archived: z.boolean(),
  propertyNames: z.array(z.string()),
  createdTime: z.string(),
  lastEditedTime: z.string(),
});

const blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  hasChildren: z.boolean(),
  archived: z.boolean(),
  text: z.string(),
  createdTime: z.string(),
  lastEditedTime: z.string(),
});

const commentSchema = z.object({
  id: z.string(),
  richText: z.string(),
  createdTime: z.string(),
  createdBy: z.string(),
  parentType: z.string(),
});

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  avatarUrl: z.string().nullable(),
  email: z.string().nullable(),
});

export function buildNotionTools(
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  return {
    notion_search: tool({
      description:
        "Search Notion pages and databases by query text. Optionally filter by page or data_source (databases).",
      inputSchema: z.object({
        query: z.string().min(1).describe("Search query text"),
        filter: z
          .enum(["page", "data_source"])
          .optional()
          .describe("Restrict to pages or databases (data_source)"),
        maxResults: z.number().optional().describe("Max results (default 20)"),
      }),
      outputSchema: z.object({
        results: z.array(z.union([pageSchema, databaseSchema])),
        totalCount: z.number(),
      }),
      needsApproval: () => approvalFn("notion_search"),
      execute: async (input) => {
        const svc = getNotionService(context);
        return svc.search(input);
      },
    }),

    notion_get_page: tool({
      description: "Get a Notion page by ID, including its properties.",
      inputSchema: z.object({
        pageId: z.string().describe("The Notion page ID"),
      }),
      outputSchema: pageSchema,
      needsApproval: () => approvalFn("notion_get_page"),
      execute: async (input) => {
        const svc = getNotionService(context);
        return svc.getPage(input.pageId);
      },
    }),

    notion_create_page: tool({
      description:
        "Create a new Notion page. Specify either parentPageId (for a sub-page) or parentDatabaseId (for a database entry).",
      inputSchema: z.object({
        title: z.string().describe("Page title"),
        parentPageId: z
          .string()
          .optional()
          .describe("Parent page ID (for sub-page)"),
        parentDatabaseId: z
          .string()
          .optional()
          .describe("Parent database ID (for database entry)"),
        children: z
          .array(
            z.object({
              type: z
                .string()
                .describe(
                  "Block type: paragraph, heading_1, heading_2, heading_3, bulleted_list_item, numbered_list_item, to_do, toggle, callout, quote, divider, code",
                ),
              content: z.string().describe("Text content of the block"),
            }),
          )
          .optional()
          .describe("Initial content blocks"),
      }),
      outputSchema: pageSchema,
      needsApproval: () => approvalFn("notion_create_page"),
      execute: async (input) => {
        const svc = getNotionService(context);
        return svc.createPage(input);
      },
    }),

    notion_update_page: tool({
      description: "Update a Notion page's properties, icon, or cover image.",
      inputSchema: z.object({
        pageId: z.string().describe("The page ID to update"),
        properties: z
          .record(z.unknown())
          .optional()
          .describe("Properties to update (Notion property format)"),
        icon: z.string().optional().describe("Emoji icon for the page"),
        cover: z.string().optional().describe("Cover image URL"),
        archived: z.boolean().optional().describe("Set to true to archive"),
      }),
      outputSchema: pageSchema,
      needsApproval: () => approvalFn("notion_update_page"),
      execute: async (input) => {
        const svc = getNotionService(context);
        const { pageId, ...params } = input;
        return svc.updatePage(pageId, params);
      },
    }),

    notion_archive_page: tool({
      description: "Archive (soft delete) a Notion page.",
      inputSchema: z.object({
        pageId: z.string().describe("The page ID to archive"),
      }),
      outputSchema: pageSchema,
      needsApproval: () => approvalFn("notion_archive_page"),
      execute: async (input) => {
        const svc = getNotionService(context);
        return svc.archivePage(input.pageId);
      },
    }),

    notion_list_databases: tool({
      description: "List accessible Notion databases in the workspace.",
      inputSchema: z.object({
        maxResults: z.number().optional().describe("Max results (default 25)"),
      }),
      outputSchema: z.object({ databases: z.array(databaseSchema) }),
      needsApproval: () => approvalFn("notion_list_databases"),
      execute: async (input) => {
        const svc = getNotionService(context);
        const databases = await svc.listDatabases(input);
        return { databases };
      },
    }),

    notion_query_database: tool({
      description:
        "Query a Notion database with optional filters and sorts. Returns pages (entries) from the database.",
      inputSchema: z.object({
        databaseId: z.string().describe("The database ID to query"),
        filter: z
          .record(z.unknown())
          .optional()
          .describe("Notion filter object"),
        sorts: z
          .array(
            z.object({
              property: z.string(),
              direction: z.enum(["ascending", "descending"]),
            }),
          )
          .optional()
          .describe("Sort criteria"),
        maxResults: z.number().optional().describe("Max results (default 25)"),
      }),
      outputSchema: z.object({
        entries: z.array(pageSchema),
        hasMore: z.boolean(),
      }),
      needsApproval: () => approvalFn("notion_query_database"),
      execute: async (input) => {
        const svc = getNotionService(context);
        return svc.queryDatabase(input);
      },
    }),

    notion_create_database_entry: tool({
      description: "Create a new entry (row) in a Notion database.",
      inputSchema: z.object({
        databaseId: z.string().describe("The database ID"),
        properties: z
          .record(z.unknown())
          .describe("Properties for the new entry (Notion property format)"),
        children: z
          .array(
            z.object({
              type: z.string().describe("Block type"),
              content: z.string().describe("Text content"),
            }),
          )
          .optional()
          .describe("Page content blocks"),
      }),
      outputSchema: pageSchema,
      needsApproval: () => approvalFn("notion_create_database_entry"),
      execute: async (input) => {
        const svc = getNotionService(context);
        return svc.createDatabaseEntry(input);
      },
    }),

    notion_update_database_entry: tool({
      description: "Update an existing database entry's properties.",
      inputSchema: z.object({
        pageId: z.string().describe("The entry (page) ID to update"),
        properties: z.record(z.unknown()).describe("Properties to update"),
      }),
      outputSchema: pageSchema,
      needsApproval: () => approvalFn("notion_update_database_entry"),
      execute: async (input) => {
        const svc = getNotionService(context);
        return svc.updateDatabaseEntry(input.pageId, {
          properties: input.properties,
        });
      },
    }),

    notion_get_blocks: tool({
      description: "Get child blocks (content) of a Notion page or block.",
      inputSchema: z.object({
        blockId: z.string().describe("Page ID or block ID"),
        maxResults: z
          .number()
          .optional()
          .describe("Max blocks to return (default 50)"),
      }),
      outputSchema: z.object({ blocks: z.array(blockSchema) }),
      needsApproval: () => approvalFn("notion_get_blocks"),
      execute: async (input) => {
        const svc = getNotionService(context);
        const blocks = await svc.getBlocks(input);
        return { blocks };
      },
    }),

    notion_append_blocks: tool({
      description: "Append new content blocks to a Notion page or block.",
      inputSchema: z.object({
        blockId: z.string().describe("Page ID or block ID to append to"),
        children: z
          .array(
            z.object({
              type: z
                .string()
                .describe(
                  "Block type: paragraph, heading_1, heading_2, heading_3, bulleted_list_item, numbered_list_item, to_do, toggle, callout, quote, divider, code",
                ),
              content: z.string().describe("Text content of the block"),
            }),
          )
          .describe("Blocks to append"),
      }),
      outputSchema: z.object({ blocks: z.array(blockSchema) }),
      needsApproval: () => approvalFn("notion_append_blocks"),
      execute: async (input) => {
        const svc = getNotionService(context);
        const blocks = await svc.appendBlocks(input);
        return { blocks };
      },
    }),

    notion_list_comments: tool({
      description: "List comments on a Notion page or discussion thread.",
      inputSchema: z.object({
        blockId: z.string().describe("Page ID or block ID"),
        maxResults: z.number().optional().describe("Max comments (default 50)"),
      }),
      outputSchema: z.object({ comments: z.array(commentSchema) }),
      needsApproval: () => approvalFn("notion_list_comments"),
      execute: async (input) => {
        const svc = getNotionService(context);
        const comments = await svc.listComments(input);
        return { comments };
      },
    }),

    notion_create_comment: tool({
      description:
        "Create a new comment on a Notion page or in a discussion thread.",
      inputSchema: z.object({
        pageId: z.string().describe("The page ID to comment on"),
        richText: z.string().describe("Comment text"),
        discussionId: z
          .string()
          .optional()
          .describe("Discussion thread ID (for replies)"),
      }),
      outputSchema: commentSchema,
      needsApproval: () => approvalFn("notion_create_comment"),
      execute: async (input) => {
        const svc = getNotionService(context);
        return svc.createComment(input);
      },
    }),

    notion_list_users: tool({
      description: "List workspace members in Notion.",
      inputSchema: z.object({
        maxResults: z.number().optional().describe("Max users (default 50)"),
      }),
      outputSchema: z.object({ users: z.array(userSchema) }),
      needsApproval: () => approvalFn("notion_list_users"),
      execute: async (input) => {
        const svc = getNotionService(context);
        const users = await svc.listUsers(input);
        return { users };
      },
    }),

    notion_get_user: tool({
      description: "Get a specific Notion user by ID.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
      }),
      outputSchema: userSchema,
      needsApproval: () => approvalFn("notion_get_user"),
      execute: async (input) => {
        const svc = getNotionService(context);
        return svc.getUser(input.userId);
      },
    }),
  };
}
