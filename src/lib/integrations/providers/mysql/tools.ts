import { tool } from "ai";
import { z } from "zod";
import { withToolApproval } from "@/lib/ai/chat/tools/approval";

import type { IntegrationContext } from "../../types";
import { MySQLService } from "./service";

function getService(context: IntegrationContext): MySQLService {
  const config = context.databases.mysql;
  if (!config) {
    throw new Error(
      "MySQL is not connected. Connect it in Settings > Integrations.",
    );
  }
  return new MySQLService(config);
}

export function buildMySQLTools(
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  return {
    mysql_list_databases: withToolApproval(
      tool({
        description: "List all databases on the connected MySQL server.",
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
      () => approvalFn("mysql_list_databases"),
    ),

    mysql_list_tables: withToolApproval(
      tool({
        description:
          "List tables in a MySQL database. Returns table names and estimated row counts.",
        inputSchema: z.object({
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          tables: z.array(
            z.object({ name: z.string(), rowEstimate: z.number() }),
          ),
        }),
        execute: async ({ database }) => {
          const service = getService(context);
          const tables = await service.listTables(database);
          return { tables };
        },
      }),
      () => approvalFn("mysql_list_tables"),
    ),

    mysql_describe_table: withToolApproval(
      tool({
        description:
          "Describe a MySQL table's structure: columns with types, indexes, and foreign keys.",
        inputSchema: z.object({
          table: z.string().describe("Table name to describe."),
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
        execute: async ({ table, database }) => {
          const service = getService(context);
          return service.describeTable(table, database);
        },
      }),
      () => approvalFn("mysql_describe_table"),
    ),

    mysql_query: withToolApproval(
      tool({
        description:
          "Execute a read-only SQL query (SELECT) on MySQL. Results are limited to 500 rows.",
        inputSchema: z.object({
          sql: z.string().describe("SQL SELECT query to execute."),
          params: z
            .array(z.unknown())
            .optional()
            .describe("Parameterized query values (?, ?, ...)."),
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
      () => approvalFn("mysql_query"),
    ),

    mysql_execute: withToolApproval(
      tool({
        description:
          "Execute a mutation SQL statement (INSERT, UPDATE, DELETE, DDL) on MySQL. Returns the number of affected rows.",
        inputSchema: z.object({
          sql: z.string().describe("SQL statement to execute."),
          params: z
            .array(z.unknown())
            .optional()
            .describe("Parameterized query values (?, ?, ...)."),
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
