import { tool } from "ai";
import { z } from "zod";
import { withToolApproval } from "@/lib/ai/chat/tools/approval";

import type { IntegrationContext } from "../../types";
import { PostgreSQLService } from "./service";

function getService(context: IntegrationContext): PostgreSQLService {
  const config = context.databases.postgresql;
  if (!config) {
    throw new Error(
      "PostgreSQL is not connected. Connect it in Settings > Integrations.",
    );
  }
  return new PostgreSQLService(config);
}

export function buildPostgresTools(
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  return {
    pg_list_databases: withToolApproval(
      tool({
        description: "List all databases on the connected PostgreSQL server.",
        inputSchema: z.object({}),
        outputSchema: z.object({
          databases: z.array(z.object({ name: z.string() })),
        }),
        execute: async () => {
          const service = getService(context);
          const databases = await service.listDatabases();
          return { databases };
        },
      }),
      () => approvalFn("pg_list_databases"),
    ),

    pg_list_schemas: withToolApproval(
      tool({
        description:
          "List schemas in a PostgreSQL database. Excludes system schemas.",
        inputSchema: z.object({
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          schemas: z.array(z.object({ name: z.string() })),
        }),
        execute: async ({ database }) => {
          const service = getService(context);
          const schemas = await service.listSchemas(database);
          return { schemas };
        },
      }),
      () => approvalFn("pg_list_schemas"),
    ),

    pg_list_tables: withToolApproval(
      tool({
        description:
          "List tables in a PostgreSQL schema. Returns table names and estimated row counts.",
        inputSchema: z.object({
          schema: z
            .string()
            .optional()
            .describe('Schema name. Defaults to "public".'),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          tables: z.array(
            z.object({
              name: z.string(),
              schema: z.string(),
              rowEstimate: z.number(),
            }),
          ),
        }),
        execute: async ({ schema, database }) => {
          const service = getService(context);
          const tables = await service.listTables(schema, database);
          return { tables };
        },
      }),
      () => approvalFn("pg_list_tables"),
    ),

    pg_describe_table: withToolApproval(
      tool({
        description:
          "Describe a PostgreSQL table's structure: columns with types, indexes, and foreign keys.",
        inputSchema: z.object({
          table: z.string().describe("Table name to describe."),
          schema: z
            .string()
            .optional()
            .describe('Schema name. Defaults to "public".'),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          columns: z.array(
            z.object({
              name: z.string(),
              type: z.string(),
              nullable: z.boolean(),
              default: z.string().nullable(),
              isPrimaryKey: z.boolean(),
            }),
          ),
          indexes: z.array(
            z.object({
              name: z.string(),
              columns: z.array(z.string()),
              unique: z.boolean(),
            }),
          ),
          foreignKeys: z.array(
            z.object({
              column: z.string(),
              referencesTable: z.string(),
              referencesColumn: z.string(),
            }),
          ),
        }),
        execute: async ({ table, schema, database }) => {
          const service = getService(context);
          return service.describeTable(table, schema, database);
        },
      }),
      () => approvalFn("pg_describe_table"),
    ),

    pg_query: withToolApproval(
      tool({
        description:
          "Execute a read-only SQL query (SELECT) on PostgreSQL. Results are limited to 500 rows.",
        inputSchema: z.object({
          sql: z.string().describe("SQL SELECT query to execute."),
          params: z
            .array(z.unknown())
            .optional()
            .describe("Parameterized query values ($1, $2, ...)."),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          rows: z.array(z.record(z.string(), z.unknown())),
          rowCount: z.number(),
          fields: z.array(z.object({ name: z.string(), dataType: z.string() })),
        }),
        execute: async ({ sql, params, database }) => {
          const service = getService(context);
          return service.query(sql, params, database);
        },
      }),
      () => approvalFn("pg_query"),
    ),

    pg_execute: withToolApproval(
      tool({
        description:
          "Execute a mutation SQL statement (INSERT, UPDATE, DELETE, DDL) on PostgreSQL. Returns the number of affected rows.",
        inputSchema: z.object({
          sql: z.string().describe("SQL statement to execute."),
          params: z
            .array(z.unknown())
            .optional()
            .describe("Parameterized query values ($1, $2, ...)."),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          affectedRows: z.number(),
          command: z.string(),
        }),
        execute: async ({ sql, params, database }) => {
          const service = getService(context);
          return service.execute(sql, params, database);
        },
      }),
      () => true,
    ),
  };
}
