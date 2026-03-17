import pg from "pg";

import type { DatabaseConnectionConfig } from "../../types";

const MAX_ROWS = 500;
const CONNECT_TIMEOUT_MS = 10_000;

export class PostgreSQLService {
  constructor(private config: DatabaseConnectionConfig) {}

  private buildClientConfig(database?: string): pg.ClientConfig {
    if (this.config.useConnectionUrl && this.config.connectionUrl) {
      return {
        connectionString: this.config.connectionUrl,
        ssl: this.config.ssl
          ? { rejectUnauthorized: this.config.sslRejectUnauthorized ?? true }
          : undefined,
        connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      };
    }

    return {
      host: this.config.host,
      port: this.config.port,
      database: database ?? this.config.database ?? "postgres",
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl
        ? { rejectUnauthorized: this.config.sslRejectUnauthorized ?? true }
        : undefined,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    };
  }

  private async withClient<T>(
    fn: (client: pg.Client) => Promise<T>,
    database?: string,
  ): Promise<T> {
    const client = new pg.Client(this.buildClientConfig(database));
    try {
      await client.connect();
      return await fn(client);
    } finally {
      await client.end().catch(() => {});
    }
  }

  async testConnection(): Promise<{
    success: boolean;
    version?: string;
    error?: string;
  }> {
    try {
      return await this.withClient(async (client) => {
        const res = await client.query("SELECT version()");
        return {
          success: true,
          version: (res.rows[0] as Record<string, string>)?.version,
        };
      });
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  async listDatabases(): Promise<{ name: string }[]> {
    return this.withClient(async (client) => {
      const res = await client.query(
        "SELECT datname AS name FROM pg_database WHERE datistemplate = false ORDER BY datname",
      );
      return res.rows as { name: string }[];
    });
  }

  async listSchemas(database?: string): Promise<{ name: string }[]> {
    return this.withClient(async (client) => {
      const res = await client.query(
        "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') ORDER BY schema_name",
      );
      return res.rows as { name: string }[];
    }, database);
  }

  async listTables(
    schema?: string,
    database?: string,
  ): Promise<{ name: string; schema: string; rowEstimate: number }[]> {
    const schemaFilter = schema ?? "public";
    return this.withClient(async (client) => {
      const res = await client.query(
        `SELECT
           c.relname AS name,
           n.nspname AS schema,
           c.reltuples::bigint AS "rowEstimate"
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind IN ('r', 'p')
           AND n.nspname = $1
         ORDER BY c.relname`,
        [schemaFilter],
      );
      return res.rows as { name: string; schema: string; rowEstimate: number }[];
    }, database);
  }

  async describeTable(
    table: string,
    schema?: string,
    database?: string,
  ): Promise<{
    columns: {
      name: string;
      type: string;
      nullable: boolean;
      default: string | null;
      isPrimaryKey: boolean;
    }[];
    indexes: { name: string; columns: string[]; unique: boolean }[];
    foreignKeys: {
      column: string;
      referencesTable: string;
      referencesColumn: string;
    }[];
  }> {
    const schemaFilter = schema ?? "public";
    return this.withClient(async (client) => {
      const colRes = await client.query(
        `SELECT
           c.column_name AS name,
           c.data_type AS type,
           c.is_nullable = 'YES' AS nullable,
           c.column_default AS "default",
           COALESCE(pk.is_pk, false) AS "isPrimaryKey"
         FROM information_schema.columns c
         LEFT JOIN (
           SELECT kcu.column_name, true AS is_pk
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
           WHERE tc.constraint_type = 'PRIMARY KEY'
             AND tc.table_name = $1
             AND tc.table_schema = $2
         ) pk ON pk.column_name = c.column_name
         WHERE c.table_name = $1 AND c.table_schema = $2
         ORDER BY c.ordinal_position`,
        [table, schemaFilter],
      );

      const idxRes = await client.query(
        `SELECT
           i.relname AS name,
           array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns,
           ix.indisunique AS unique
         FROM pg_index ix
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
         WHERE t.relname = $1 AND n.nspname = $2
         GROUP BY i.relname, ix.indisunique
         ORDER BY i.relname`,
        [table, schemaFilter],
      );

      const fkRes = await client.query(
        `SELECT
           kcu.column_name AS column,
           ccu.table_name AS "referencesTable",
           ccu.column_name AS "referencesColumn"
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_name = $1
           AND tc.table_schema = $2`,
        [table, schemaFilter],
      );

      return {
        columns: colRes.rows as {
          name: string;
          type: string;
          nullable: boolean;
          default: string | null;
          isPrimaryKey: boolean;
        }[],
        indexes: (
          idxRes.rows as {
            name: string;
            columns: string[] | string;
            unique: boolean;
          }[]
        ).map((row) => ({
          name: row.name,
          columns: Array.isArray(row.columns)
            ? row.columns
            : typeof row.columns === "string"
              ? row.columns.replace(/^\{|\}$/g, "").split(",").filter(Boolean)
              : [],
          unique: row.unique,
        })),
        foreignKeys: fkRes.rows as {
          column: string;
          referencesTable: string;
          referencesColumn: string;
        }[],
      };
    }, database);
  }

  async query(
    sql: string,
    params?: unknown[],
    database?: string,
  ): Promise<{
    rows: Record<string, unknown>[];
    rowCount: number;
    fields: { name: string; dataType: string }[];
  }> {
    return this.withClient(async (client) => {
      const limited = sql.trimEnd().replace(/;$/, "");
      const hasLimit = /\blimit\b/i.test(limited);
      const finalSql = hasLimit ? limited : `${limited} LIMIT ${MAX_ROWS}`;
      const res = await client.query(finalSql, params ?? []);
      return {
        rows: res.rows as Record<string, unknown>[],
        rowCount: res.rowCount ?? res.rows.length,
        fields: res.fields.map((f) => ({
          name: f.name,
          dataType: String(f.dataTypeID),
        })),
      };
    }, database);
  }

  async execute(
    sql: string,
    params?: unknown[],
    database?: string,
  ): Promise<{ affectedRows: number; command: string }> {
    return this.withClient(async (client) => {
      const res = await client.query(sql, params ?? []);
      return {
        affectedRows: res.rowCount ?? 0,
        command: res.command,
      };
    }, database);
  }
}
