import { tool } from "ai";
import { z } from "zod";
import { withToolApproval } from "@/lib/ai/chat/tools/approval";

import type { IntegrationContext } from "../../types";
import { MongoDBService } from "./service";

function getService(context: IntegrationContext): MongoDBService {
  const config = context.databases.mongodb;
  if (!config) {
    throw new Error(
      "MongoDB is not connected. Connect it in Settings > Integrations.",
    );
  }
  return new MongoDBService(config);
}

const jsonObject = z.record(z.string(), z.unknown()).describe("A JSON object.");

export function buildMongoDBTools(
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  return {
    mongo_list_databases: withToolApproval(
      tool({
        description:
          "List all databases on the connected MongoDB server with sizes.",
        inputSchema: z.object({}),
        outputSchema: z.object({
          databases: z.array(
            z.object({ name: z.string(), sizeOnDisk: z.number() }),
          ),
        }),
        execute: async () => {
          const service = getService(context);
          const databases = await service.listDatabases();
          return { databases };
        },
      }),
      () => approvalFn("mongo_list_databases"),
    ),

    mongo_list_collections: withToolApproval(
      tool({
        description: "List collections in a MongoDB database.",
        inputSchema: z.object({
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          collections: z.array(
            z.object({ name: z.string(), type: z.string() }),
          ),
        }),
        execute: async ({ database }) => {
          const service = getService(context);
          const collections = await service.listCollections(database);
          return { collections };
        },
      }),
      () => approvalFn("mongo_list_collections"),
    ),

    mongo_find: withToolApproval(
      tool({
        description:
          "Find documents in a MongoDB collection. Supports query filters, sort, skip, limit, and projection. Results capped at 500 documents.",
        inputSchema: z.object({
          collection: z.string().describe("Collection name."),
          query: jsonObject.optional().describe("MongoDB query filter."),
          sort: jsonObject.optional().describe("Sort specification."),
          projection: jsonObject
            .optional()
            .describe("Projection to include/exclude fields."),
          limit: z
            .number()
            .optional()
            .describe("Maximum documents to return (max 500)."),
          skip: z.number().optional().describe("Number of documents to skip."),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          documents: z.array(z.record(z.string(), z.unknown())),
          count: z.number(),
        }),
        execute: async ({
          collection,
          query,
          sort,
          projection,
          limit,
          skip,
          database,
        }) => {
          const service = getService(context);
          return service.find(
            collection,
            query,
            { limit, skip, sort, projection },
            database,
          );
        },
      }),
      () => approvalFn("mongo_find"),
    ),

    mongo_find_one: withToolApproval(
      tool({
        description: "Find a single document in a MongoDB collection.",
        inputSchema: z.object({
          collection: z.string().describe("Collection name."),
          query: jsonObject.optional().describe("MongoDB query filter."),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          document: z.record(z.string(), z.unknown()).nullable(),
        }),
        execute: async ({ collection, query, database }) => {
          const service = getService(context);
          const document = await service.findOne(collection, query, database);
          return { document };
        },
      }),
      () => approvalFn("mongo_find_one"),
    ),

    mongo_insert_one: withToolApproval(
      tool({
        description: "Insert a single document into a MongoDB collection.",
        inputSchema: z.object({
          collection: z.string().describe("Collection name."),
          document: jsonObject.describe("Document to insert."),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({ insertedId: z.string() }),
        execute: async ({ collection, document, database }) => {
          const service = getService(context);
          return service.insertOne(collection, document, database);
        },
      }),
      () => true,
    ),

    mongo_insert_many: withToolApproval(
      tool({
        description: "Insert multiple documents into a MongoDB collection.",
        inputSchema: z.object({
          collection: z.string().describe("Collection name."),
          documents: z
            .array(jsonObject)
            .describe("Array of documents to insert."),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          insertedCount: z.number(),
          insertedIds: z.array(z.string()),
        }),
        execute: async ({ collection, documents, database }) => {
          const service = getService(context);
          return service.insertMany(collection, documents, database);
        },
      }),
      () => true,
    ),

    mongo_update_one: withToolApproval(
      tool({
        description:
          "Update a single document in a MongoDB collection matching the filter.",
        inputSchema: z.object({
          collection: z.string().describe("Collection name."),
          filter: jsonObject.describe("Query filter to match the document."),
          update: jsonObject.describe(
            "Update operations (e.g. { $set: { ... } }).",
          ),
          options: jsonObject
            .optional()
            .describe("Update options (e.g. upsert)."),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          matchedCount: z.number(),
          modifiedCount: z.number(),
        }),
        execute: async ({ collection, filter, update, options, database }) => {
          const service = getService(context);
          return service.updateOne(
            collection,
            filter,
            update,
            options,
            database,
          );
        },
      }),
      () => true,
    ),

    mongo_update_many: withToolApproval(
      tool({
        description:
          "Update multiple documents in a MongoDB collection matching the filter.",
        inputSchema: z.object({
          collection: z.string().describe("Collection name."),
          filter: jsonObject.describe("Query filter to match documents."),
          update: jsonObject.describe(
            "Update operations (e.g. { $set: { ... } }).",
          ),
          options: jsonObject.optional().describe("Update options."),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          matchedCount: z.number(),
          modifiedCount: z.number(),
        }),
        execute: async ({ collection, filter, update, options, database }) => {
          const service = getService(context);
          return service.updateMany(
            collection,
            filter,
            update,
            options,
            database,
          );
        },
      }),
      () => true,
    ),

    mongo_aggregate: withToolApproval(
      tool({
        description:
          "Run an aggregation pipeline on a MongoDB collection. Powerful for grouping, filtering, and transforming data.",
        inputSchema: z.object({
          collection: z.string().describe("Collection name."),
          pipeline: z
            .array(jsonObject)
            .describe("Aggregation pipeline stages."),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({
          documents: z.array(z.record(z.string(), z.unknown())),
        }),
        execute: async ({ collection, pipeline, database }) => {
          const service = getService(context);
          return service.aggregate(collection, pipeline, undefined, database);
        },
      }),
      () => approvalFn("mongo_aggregate"),
    ),

    mongo_count: withToolApproval(
      tool({
        description:
          "Count documents in a MongoDB collection matching an optional query.",
        inputSchema: z.object({
          collection: z.string().describe("Collection name."),
          query: jsonObject.optional().describe("MongoDB query filter."),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({ count: z.number() }),
        execute: async ({ collection, query, database }) => {
          const service = getService(context);
          return service.count(collection, query, database);
        },
      }),
      () => approvalFn("mongo_count"),
    ),

    mongo_distinct: withToolApproval(
      tool({
        description:
          "Get distinct values for a field in a MongoDB collection, optionally filtered by a query.",
        inputSchema: z.object({
          collection: z.string().describe("Collection name."),
          field: z.string().describe("Field name to get distinct values for."),
          query: jsonObject.optional().describe("MongoDB query filter."),
          database: z
            .string()
            .optional()
            .describe(
              "Target database. Uses the configured default if omitted.",
            ),
        }),
        outputSchema: z.object({ values: z.array(z.unknown()) }),
        execute: async ({ collection, field, query, database }) => {
          const service = getService(context);
          return service.distinct(collection, field, query, database);
        },
      }),
      () => approvalFn("mongo_distinct"),
    ),
  };
}
