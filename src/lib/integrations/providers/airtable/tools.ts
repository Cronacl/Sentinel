import { tool } from "ai";
import { z } from "zod";
import { withToolApproval } from "@/lib/ai/chat/tools/approval";

import type { IntegrationContext } from "../../types";
import { AirtableService } from "./service";

function getAirtableService(context: IntegrationContext): AirtableService {
  const token = context.tokens.airtable;
  if (!token) throw new Error("Airtable is not connected.");
  return new AirtableService(token);
}

const baseSchema = z.object({
  id: z.string(),
  name: z.string(),
  permissionLevel: z.string(),
});

const fieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

const viewSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
});

const tableSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  fields: z.array(fieldSchema),
  views: z.array(viewSchema),
  primaryFieldId: z.string().optional(),
});

const recordSchema = z.object({
  id: z.string(),
  createdTime: z.string(),
  fields: z.record(z.string(), z.unknown()),
});

const commentSchema = z.object({
  id: z.string(),
  text: z.string(),
  author: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().optional(),
  }),
  createdTime: z.string(),
});

const userSchema = z.object({
  id: z.string(),
  email: z.string().optional(),
});

export function buildAirtableTools(
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  return {
    airtable_list_bases: withToolApproval(
      tool({
        description:
          "List all Airtable bases the user has access to. Returns base names, IDs, and permission levels.",
        inputSchema: z.object({}),
        outputSchema: z.object({
          bases: z.array(baseSchema),
          totalCount: z.number(),
        }),
        execute: async () => {
          const svc = getAirtableService(context);
          return svc.listBases();
        },
      }),
      () => approvalFn("airtable_list_bases"),
    ),

    airtable_list_tables: withToolApproval(
      tool({
        description:
          "List all tables in an Airtable base, including their fields and views. Use this to explore a base's schema.",
        inputSchema: z.object({
          baseId: z
            .string()
            .min(1)
            .describe("The Airtable base ID (e.g. appXXXXXXXXXXXXXX)"),
        }),
        outputSchema: z.object({
          tables: z.array(tableSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.listTables(input);
        },
      }),
      () => approvalFn("airtable_list_tables"),
    ),

    airtable_get_table: withToolApproval(
      tool({
        description:
          "Get detailed schema of a specific table in an Airtable base, including all fields, views, and the primary field.",
        inputSchema: z.object({
          baseId: z.string().min(1).describe("The Airtable base ID"),
          tableIdOrName: z.string().min(1).describe("The table ID or name"),
        }),
        outputSchema: tableSchema,
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.getTable(input);
        },
      }),
      () => approvalFn("airtable_get_table"),
    ),

    airtable_create_table: withToolApproval(
      tool({
        description:
          "Create a new table in an Airtable base with initial fields. Requires at least one field.",
        inputSchema: z.object({
          baseId: z.string().min(1).describe("The Airtable base ID"),
          name: z.string().min(1).describe("Name for the new table"),
          description: z.string().optional().describe("Optional description"),
          fields: z
            .array(
              z.object({
                name: z.string().min(1),
                type: z
                  .string()
                  .min(1)
                  .describe(
                    "Field type (e.g. singleLineText, number, singleSelect)",
                  ),
                description: z.string().optional(),
                options: z.record(z.string(), z.unknown()).optional(),
              }),
            )
            .min(1)
            .describe("Initial fields for the table"),
        }),
        outputSchema: tableSchema,
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.createTable(input);
        },
      }),
      () => approvalFn("airtable_create_table"),
    ),

    airtable_create_field: withToolApproval(
      tool({
        description:
          'Add a new field (column) to an existing Airtable table. IMPORTANT: For singleSelect and multipleSelects types, you MUST provide options with a choices array, e.g. options: { choices: [{ name: "Option A" }, { name: "Option B" }] }. For number fields, options.precision sets decimal places.',
        inputSchema: z.object({
          baseId: z.string().min(1).describe("The Airtable base ID"),
          tableIdOrName: z
            .string()
            .min(1)
            .describe("The table ID or name (name will be resolved to ID)"),
          name: z.string().min(1).describe("Name for the new field"),
          type: z
            .string()
            .min(1)
            .describe(
              "Field type: singleLineText, multilineText, number, singleSelect, multipleSelects, date, dateTime, checkbox, email, url, phoneNumber, currency, percent, rating",
            ),
          description: z.string().optional().describe("Optional description"),
          options: z
            .record(z.string(), z.unknown())
            .optional()
            .describe(
              'REQUIRED for singleSelect/multipleSelects: { choices: [{ name: "Value" }] }. For number: { precision: 0 }. For currency: { precision: 2, symbol: "$" }',
            ),
        }),
        outputSchema: fieldSchema,
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.createField(input);
        },
      }),
      () => approvalFn("airtable_create_field"),
    ),

    airtable_update_field: withToolApproval(
      tool({
        description:
          "Update the name or description of an existing field in an Airtable table. Use the field ID (fldXXX) for best results.",
        inputSchema: z.object({
          baseId: z.string().min(1).describe("The Airtable base ID"),
          tableIdOrName: z
            .string()
            .min(1)
            .describe("The table ID or name (name will be resolved to ID)"),
          fieldIdOrName: z
            .string()
            .min(1)
            .describe("The field ID (e.g. fldXXXXXXXXXXXXXX)"),
          name: z.string().optional().describe("New name for the field"),
          description: z.string().optional().describe("New description"),
        }),
        outputSchema: fieldSchema,
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.updateField(input);
        },
      }),
      () => approvalFn("airtable_update_field"),
    ),

    airtable_list_records: withToolApproval(
      tool({
        description:
          "List records in an Airtable table. Supports filtering with formulas, sorting, field selection, and view filtering.",
        inputSchema: z.object({
          baseId: z.string().min(1).describe("The Airtable base ID"),
          tableIdOrName: z.string().min(1).describe("The table ID or name"),
          view: z.string().optional().describe("View name or ID to filter by"),
          fields: z
            .array(z.string())
            .optional()
            .describe("Specific field names to return"),
          filterByFormula: z
            .string()
            .optional()
            .describe(
              "Airtable formula to filter records (e.g. {Status}='Done')",
            ),
          sort: z
            .array(
              z.object({
                field: z.string(),
                direction: z.enum(["asc", "desc"]).optional(),
              }),
            )
            .optional()
            .describe("Sort configuration"),
          maxRecords: z
            .number()
            .optional()
            .describe("Maximum number of records to return"),
          pageSize: z
            .number()
            .optional()
            .describe("Number of records per page (max 100)"),
        }),
        outputSchema: z.object({
          records: z.array(recordSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.listRecords(input);
        },
      }),
      () => approvalFn("airtable_list_records"),
    ),

    airtable_get_record: withToolApproval(
      tool({
        description:
          "Get a single record from an Airtable table by its record ID.",
        inputSchema: z.object({
          baseId: z.string().min(1).describe("The Airtable base ID"),
          tableIdOrName: z.string().min(1).describe("The table ID or name"),
          recordId: z
            .string()
            .min(1)
            .describe("The record ID (e.g. recXXXXXXXXXXXXXX)"),
        }),
        outputSchema: recordSchema,
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.getRecord(input);
        },
      }),
      () => approvalFn("airtable_get_record"),
    ),

    airtable_create_records: withToolApproval(
      tool({
        description:
          "Create one or more records in an Airtable table. Up to 10 records can be created at once.",
        inputSchema: z.object({
          baseId: z.string().min(1).describe("The Airtable base ID"),
          tableIdOrName: z.string().min(1).describe("The table ID or name"),
          records: z
            .array(
              z.object({
                fields: z
                  .record(z.string(), z.unknown())
                  .describe("Field values for the record"),
              }),
            )
            .min(1)
            .max(10)
            .describe("Records to create (max 10)"),
        }),
        outputSchema: z.object({
          records: z.array(recordSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.createRecords(input);
        },
      }),
      () => approvalFn("airtable_create_records"),
    ),

    airtable_update_records: withToolApproval(
      tool({
        description:
          "Update one or more existing records in an Airtable table. Up to 10 records can be updated at once. Only specified fields are updated.",
        inputSchema: z.object({
          baseId: z.string().min(1).describe("The Airtable base ID"),
          tableIdOrName: z.string().min(1).describe("The table ID or name"),
          records: z
            .array(
              z.object({
                id: z.string().min(1).describe("The record ID to update"),
                fields: z
                  .record(z.string(), z.unknown())
                  .describe("Field values to update"),
              }),
            )
            .min(1)
            .max(10)
            .describe("Records to update (max 10)"),
        }),
        outputSchema: z.object({
          records: z.array(recordSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.updateRecords(input);
        },
      }),
      () => approvalFn("airtable_update_records"),
    ),

    airtable_delete_records: withToolApproval(
      tool({
        description:
          "Delete one or more records from an Airtable table. Up to 10 records can be deleted at once.",
        inputSchema: z.object({
          baseId: z.string().min(1).describe("The Airtable base ID"),
          tableIdOrName: z.string().min(1).describe("The table ID or name"),
          recordIds: z
            .array(z.string().min(1))
            .min(1)
            .max(10)
            .describe("Record IDs to delete (max 10)"),
        }),
        outputSchema: z.object({
          deletedIds: z.array(z.string()),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.deleteRecords(input);
        },
      }),
      () => approvalFn("airtable_delete_records"),
    ),

    airtable_list_comments: withToolApproval(
      tool({
        description:
          "List comments on a specific record in an Airtable table. Returns comment text, author, and timestamp.",
        inputSchema: z.object({
          baseId: z.string().min(1).describe("The Airtable base ID"),
          tableIdOrName: z.string().min(1).describe("The table ID or name"),
          recordId: z.string().min(1).describe("The record ID"),
        }),
        outputSchema: z.object({
          comments: z.array(commentSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.listComments(input);
        },
      }),
      () => approvalFn("airtable_list_comments"),
    ),

    airtable_create_comment: withToolApproval(
      tool({
        description: "Add a comment to a specific record in an Airtable table.",
        inputSchema: z.object({
          baseId: z.string().min(1).describe("The Airtable base ID"),
          tableIdOrName: z.string().min(1).describe("The table ID or name"),
          recordId: z.string().min(1).describe("The record ID"),
          text: z.string().min(1).describe("The comment text"),
        }),
        outputSchema: commentSchema,
        execute: async (input) => {
          const svc = getAirtableService(context);
          return svc.createComment(input);
        },
      }),
      () => approvalFn("airtable_create_comment"),
    ),

    airtable_get_user: withToolApproval(
      tool({
        description:
          "Get the currently authenticated Airtable user's identity, including their ID and email address.",
        inputSchema: z.object({}),
        outputSchema: userSchema,
        execute: async () => {
          const svc = getAirtableService(context);
          return svc.getUser();
        },
      }),
      () => approvalFn("airtable_get_user"),
    ),
  };
}
