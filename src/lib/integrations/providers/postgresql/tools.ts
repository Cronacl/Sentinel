import { tool } from "ai";
import { z } from "zod";

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
    pg_list_databases: tool({
      description: "List all databases on the connected PostgreSQL server.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        databases: z.array(z.object({ name: z.string() })),
      }),
      needsApproval: () => approvalFn("pg_list_databases"),
      execute: async () => {
        const service = getService(context);
        const databases = await service.listDatabases();
        return { databases };
      },
    }),

    pg_list_schemas: tool({
      description:
        "List schemas in a PostgreSQL database. Excludes system schemas.",
      inputSchema: z.object({
        database: z
          .string()
          .optional()
          .describe("Target database. Uses the configured default if omitted."),
      }),
      outputSchema: z.object({
        schemas: z.array(z.object({ name: z.string() })),
      }),
      needsApproval: () => approvalFn("pg_list_schemas"),
      execute: async ({ database }) => {
        const service = getService(context);
        const schemas = await service.listSchemas(database);
        return { schemas };
      },
    }),

    pg_list_tables: tool({
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
          .describe("Target database. Uses the configured default if omitted."),
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
      needsApproval: () => approvalFn("pg_list_tables"),
      execute: async ({ schema, database }) => {
        const service = getService(context);
        const tables = await service.listTables(schema, database);
        return { tables };
      },
    }),

    pg_describe_table: tool({
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
          .describe("Target database. Uses the configured default if omitted."),
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
      needsApproval: () => approvalFn("pg_describe_table"),
      execute: async ({ table, schema, database }) => {
        const service = getService(context);
        return service.describeTable(table, schema, database);
      },
    }),

    pg_query: tool({
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
          .describe("Target database. Uses the configured default if omitted."),
      }),
      outputSchema: z.object({
        rows: z.array(z.record(z.unknown())),
        rowCount: z.number(),
        fields: z.array(
          z.object({ name: z.string(), dataType: z.string() }),
        ),
      }),
      needsApproval: () => approvalFn("pg_query"),
      execute: async ({ sql, params, database }) => {
        const service = getService(context);
        return service.query(sql, params, database);
      },
    }),

    pg_execute: tool({
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
          .describe("Target database. Uses the configured default if omitted."),
      }),
      outputSchema: z.object({
        affectedRows: z.number(),
        command: z.string(),
      }),
      needsApproval: () => true,
      execute: async ({ sql, params, database }) => {
        const service = getService(context);
        return service.execute(sql, params, database);
      },
    }),
  };
}
