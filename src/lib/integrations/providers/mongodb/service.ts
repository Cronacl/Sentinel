import { MongoClient, type Document, ObjectId } from "mongodb";

import type { DatabaseConnectionConfig } from "../../types";

const MAX_DOCS = 500;
const CONNECT_TIMEOUT_MS = 10_000;

function serializeDoc(doc: Document): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (value instanceof ObjectId) {
      result[key] = value.toHexString();
    } else if (value instanceof Date) {
      result[key] = value.toISOString();
    } else if (Buffer.isBuffer(value)) {
      result[key] = `<Buffer ${value.length} bytes>`;
    } else if (typeof value === "bigint") {
      result[key] = Number(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) =>
        typeof v === "object" && v !== null ? serializeDoc(v) : v,
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = serializeDoc(value as Document);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class MongoDBService {
  constructor(private config: DatabaseConnectionConfig) {}

  private buildUri(): string {
    if (this.config.useConnectionUrl && this.config.connectionUrl) {
      return this.config.connectionUrl;
    }
    const auth = `${encodeURIComponent(this.config.username)}:${encodeURIComponent(this.config.password)}`;
    const host = `${this.config.host}:${this.config.port}`;
    const db = this.config.database ?? "";
    const params = this.config.ssl
      ? "?tls=true&tlsAllowInvalidCertificates=true"
      : "";
    return `mongodb://${auth}@${host}/${db}${params}`;
  }

  private async withClient<T>(
    fn: (client: MongoClient) => Promise<T>,
  ): Promise<T> {
    const client = new MongoClient(this.buildUri(), {
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    });
    try {
      await client.connect();
      return await fn(client);
    } finally {
      await client.close().catch(() => {});
    }
  }

  private getDb(client: MongoClient, database?: string) {
    return client.db(database ?? this.config.database ?? undefined);
  }

  async testConnection(): Promise<{
    success: boolean;
    version?: string;
    error?: string;
  }> {
    try {
      return await this.withClient(async (client) => {
        const admin = client.db().admin();
        const info = await admin.serverInfo();
        return { success: true, version: info.version };
      });
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async listDatabases(): Promise<{ name: string; sizeOnDisk: number }[]> {
    return this.withClient(async (client) => {
      const result = await client.db().admin().listDatabases();
      return result.databases.map((d) => ({
        name: d.name,
        sizeOnDisk: d.sizeOnDisk ?? 0,
      }));
    });
  }

  async listCollections(
    database?: string,
  ): Promise<{ name: string; type: string }[]> {
    return this.withClient(async (client) => {
      const db = this.getDb(client, database);
      const collections = await db.listCollections().toArray();
      return collections.map((c) => ({
        name: c.name,
        type: c.type ?? "collection",
      }));
    });
  }

  async find(
    collection: string,
    query?: object,
    options?: {
      limit?: number;
      skip?: number;
      sort?: object;
      projection?: object;
    },
    database?: string,
  ): Promise<{ documents: Record<string, unknown>[]; count: number }> {
    return this.withClient(async (client) => {
      const db = this.getDb(client, database);
      const limit = Math.min(options?.limit ?? MAX_DOCS, MAX_DOCS);
      let cursor = db
        .collection(collection)
        .find(query ?? {})
        .limit(limit);

      if (options?.skip) cursor = cursor.skip(options.skip);
      if (options?.sort) cursor = cursor.sort(options.sort as Document);
      if (options?.projection)
        cursor = cursor.project(options.projection as Document);

      const docs = await cursor.toArray();
      return {
        documents: docs.map(serializeDoc),
        count: docs.length,
      };
    });
  }

  async findOne(
    collection: string,
    query?: object,
    database?: string,
  ): Promise<Record<string, unknown> | null> {
    return this.withClient(async (client) => {
      const db = this.getDb(client, database);
      const doc = await db.collection(collection).findOne(query ?? {});
      return doc ? serializeDoc(doc) : null;
    });
  }

  async insertOne(
    collection: string,
    document: object,
    database?: string,
  ): Promise<{ insertedId: string }> {
    return this.withClient(async (client) => {
      const db = this.getDb(client, database);
      const result = await db
        .collection(collection)
        .insertOne(document as Document);
      return { insertedId: result.insertedId.toHexString() };
    });
  }

  async insertMany(
    collection: string,
    documents: object[],
    database?: string,
  ): Promise<{ insertedCount: number; insertedIds: string[] }> {
    return this.withClient(async (client) => {
      const db = this.getDb(client, database);
      const result = await db
        .collection(collection)
        .insertMany(documents as Document[]);
      return {
        insertedCount: result.insertedCount,
        insertedIds: Object.values(result.insertedIds).map((id) =>
          id.toHexString(),
        ),
      };
    });
  }

  async updateOne(
    collection: string,
    filter: object,
    update: object,
    options?: object,
    database?: string,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    return this.withClient(async (client) => {
      const db = this.getDb(client, database);
      const result = await db
        .collection(collection)
        .updateOne(filter as Document, update as Document, options);
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    });
  }

  async updateMany(
    collection: string,
    filter: object,
    update: object,
    options?: object,
    database?: string,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    return this.withClient(async (client) => {
      const db = this.getDb(client, database);
      const result = await db
        .collection(collection)
        .updateMany(filter as Document, update as Document, options);
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    });
  }

  async aggregate(
    collection: string,
    pipeline: object[],
    options?: object,
    database?: string,
  ): Promise<{ documents: Record<string, unknown>[] }> {
    return this.withClient(async (client) => {
      const db = this.getDb(client, database);
      const docs = await db
        .collection(collection)
        .aggregate(pipeline as Document[], options)
        .toArray();
      return { documents: docs.map(serializeDoc) };
    });
  }

  async count(
    collection: string,
    query?: object,
    database?: string,
  ): Promise<{ count: number }> {
    return this.withClient(async (client) => {
      const db = this.getDb(client, database);
      const count = await db.collection(collection).countDocuments(query ?? {});
      return { count };
    });
  }

  async distinct(
    collection: string,
    field: string,
    query?: object,
    database?: string,
  ): Promise<{ values: unknown[] }> {
    return this.withClient(async (client) => {
      const db = this.getDb(client, database);
      const values = await db
        .collection(collection)
        .distinct(field, query ?? {});
      return { values };
    });
  }
}
