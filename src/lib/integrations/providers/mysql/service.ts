import mysql from "mysql2/promise";

import type { DatabaseConnectionConfig } from "../../types";

const MAX_ROWS = 500;
const CONNECT_TIMEOUT_MS = 10_000;

export class MySQLService {
  constructor(private config: DatabaseConnectionConfig) {}

  private buildConnectionOptions(
    database?: string,
  ): mysql.ConnectionOptions {
    if (this.config.useConnectionUrl && this.config.connectionUrl) {
      return {
        uri: this.config.connectionUrl,
        connectTimeout: CONNECT_TIMEOUT_MS,
      };
    }

    return {
      host: this.config.host,
      port: this.config.port,
      database: database ?? this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      connectTimeout: CONNECT_TIMEOUT_MS,
    };
  }

  private async withConnection<T>(
    fn: (conn: mysql.Connection) => Promise<T>,
    database?: string,
  ): Promise<T> {
    const conn = await mysql.createConnection(
      this.buildConnectionOptions(database),
    );
    try {
      return await fn(conn);
    } finally {
      await conn.end().catch(() => {});
    }
  }

  async testConnection(): Promise<{
    success: boolean;
    version?: string;
    error?: string;
  }> {
    try {
      return await this.withConnection(async (conn) => {
        const [rows] = await conn.query("SELECT VERSION() AS version");
        const version = (rows as Record<string, string>[])[0]?.version;
        return { success: true, version };
      });
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async listDatabases(): Promise<{ name: string }[]> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query("SHOW DATABASES");
      return (rows as Record<string, string>[]).map((r) => ({
        name: r.Database!,
      }));
    });
  }

  async listTables(
    database?: string,
  ): Promise<{ name: string; rowEstimate: number }[]> {
    const db = database ?? this.config.database;
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        `SELECT TABLE_NAME AS name, TABLE_ROWS AS rowEstimate
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`,
        [db],
      );
      return (rows as { name: string; rowEstimate: number }[]).map((r) => ({
        name: r.name,
        rowEstimate: Number(r.rowEstimate ?? 0),
      }));
    }, database);
  }

  async describeTable(
    table: string,
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
    const db = database ?? this.config.database;
    return this.withConnection(async (conn) => {
      const [colRows] = await conn.query(
        `SELECT
           COLUMN_NAME AS name,
           COLUMN_TYPE AS type,
           IS_NULLABLE = 'YES' AS nullable,
           COLUMN_DEFAULT AS \`default\`,
           COLUMN_KEY = 'PRI' AS isPrimaryKey
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [db, table],
      );

      const [idxRows] = await conn.query(
        `SELECT
           INDEX_NAME AS name,
           GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols,
           NOT NON_UNIQUE AS \`unique\`
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         GROUP BY INDEX_NAME, NON_UNIQUE
         ORDER BY INDEX_NAME`,
        [db, table],
      );

      const [fkRows] = await conn.query(
        `SELECT
           COLUMN_NAME AS \`column\`,
           REFERENCED_TABLE_NAME AS referencesTable,
           REFERENCED_COLUMN_NAME AS referencesColumn
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [db, table],
      );

      return {
        columns: colRows as {
          name: string;
          type: string;
          nullable: boolean;
          default: string | null;
          isPrimaryKey: boolean;
        }[],
        indexes: (idxRows as { name: string; cols: string; unique: boolean }[]).map(
          (r) => ({
            name: r.name,
            columns: r.cols ? r.cols.split(",") : [],
            unique: Boolean(r.unique),
          }),
        ),
        foreignKeys: fkRows as {
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
    return this.withConnection(async (conn) => {
      const limited = sql.trimEnd().replace(/;$/, "");
      const hasLimit = /\blimit\b/i.test(limited);
      const finalSql = hasLimit ? limited : `${limited} LIMIT ${MAX_ROWS}`;
      const [rows, fields] = await conn.query(finalSql, params ?? []);
      const resultRows = rows as Record<string, unknown>[];
      return {
        rows: resultRows,
        rowCount: resultRows.length,
        fields: (fields as mysql.FieldPacket[]).map((f) => ({
          name: f.name,
          dataType: String(f.type),
        })),
      };
    }, database);
  }

  async execute(
    sql: string,
    params?: unknown[],
    database?: string,
  ): Promise<{ affectedRows: number; command: string }> {
    return this.withConnection(async (conn) => {
      const [result] = await conn.execute(
        sql,
        (params ?? []) as (string | number | boolean | null)[],
      );
      const info = result as mysql.ResultSetHeader;
      const command = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "UNKNOWN";
      return {
        affectedRows: info.affectedRows ?? 0,
        command,
      };
    }, database);
  }
}
