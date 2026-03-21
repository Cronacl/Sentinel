import { createHash } from "node:crypto";

import { createId } from "@paralleldrive/cuid2";

import { MEMORY_KIND_VALUES } from "@/lib/memory";
import type {
  MemoryItem,
  MemoryKind,
  MemoryScope,
  MemorySearchResult,
} from "@/lib/memory";
import { vectorDb } from "@/server/db";
import {
  getMemoryEmbeddingTableName,
  MEMORY_VECTOR_DIMENSIONS,
  toMemoryScope,
} from "@/server/db/memory-schema";

type MemoryListFilters = {
  kind?: MemoryKind;
  limit?: number;
  pinned?: boolean;
  query?: string;
  scope?: MemoryScope;
  userId: string;
  workspaceId?: string | null;
};

type MemoryFacetCounts = {
  kindCounts: Record<MemoryKind, number>;
  scopeCounts: Record<MemoryScope, number>;
};

type QueryFiltersOptions = {
  includeKind?: boolean;
  includeScope?: boolean;
};

type QueryFiltersResult = {
  conditions: string[];
  params: unknown[];
};

const SEMANTIC_DEDUPLICATION_THRESHOLD = 0.93;
const MEMORY_DECAY_HALF_LIFE_DAYS = 90;

type UpsertMemoryInput = {
  content: string;
  embedding: Float32Array | number[];
  embeddingDimensions: number;
  embeddingModel: string;
  embeddingProvider: MemoryItem["embeddingProvider"];
  isPinned?: boolean;
  kind: MemoryKind;
  salience?: number;
  scope: MemoryScope;
  sourceMessageId?: string | null;
  sourceThreadId?: string | null;
  summary?: string | null;
  userId: string;
  workspaceId?: string | null;
};

function requireVectorDb() {
  if (!vectorDb) {
    throw new Error(
      "Vector database is not available. The sqlite-vec extension may not be installed.",
    );
  }

  return vectorDb;
}

function normalizeMemoryText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function createFingerprint(
  kind: MemoryKind,
  scopeKey: string,
  content: string,
) {
  return createHash("sha256")
    .update(
      `${kind}\n${scopeKey}\n${normalizeMemoryText(content).toLowerCase()}`,
    )
    .digest("hex");
}

function toEmbeddingBuffer(embedding: Float32Array | number[]) {
  return embedding instanceof Float32Array
    ? Buffer.from(embedding.buffer)
    : Buffer.from(new Float32Array(embedding).buffer);
}

function toFloat32Array(embedding: Float32Array | number[]) {
  return embedding instanceof Float32Array
    ? embedding
    : new Float32Array(embedding);
}

function fromEmbeddingBuffer(value: unknown) {
  if (value instanceof Float32Array) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return new Float32Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  }

  if (value instanceof Uint8Array) {
    return new Float32Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  }

  if (value instanceof ArrayBuffer) {
    return new Float32Array(value.slice(0));
  }

  throw new Error("Unsupported embedding buffer.");
}

function cosineSimilarity(
  leftEmbedding: Float32Array | number[],
  rightEmbedding: Float32Array | number[],
) {
  const left = toFloat32Array(leftEmbedding);
  const right = toFloat32Array(rightEmbedding);

  if (left.length !== right.length || left.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function calculateTimeDecayFactor({
  anchorTimestamp,
  isPinned,
  now = Date.now(),
}: {
  anchorTimestamp: number;
  isPinned: boolean;
  now?: number;
}) {
  if (isPinned) {
    return 1;
  }

  const ageMs = Math.max(0, now - anchorTimestamp);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  return Math.exp((-Math.log(2) * ageDays) / MEMORY_DECAY_HALF_LIFE_DAYS);
}

function mapMemoryRow(row: Record<string, unknown>): MemoryItem {
  const workspaceId = (row.workspace_id as string | null) ?? null;

  return {
    content: row.content as string,
    createdAt: row.created_at as number,
    embeddingDimensions: row.embedding_dimensions as number,
    embeddingModel: row.embedding_model as string,
    embeddingProvider:
      row.embedding_provider as MemoryItem["embeddingProvider"],
    id: row.id as string,
    isPinned: Boolean(row.is_pinned),
    kind: row.kind as MemoryKind,
    lastAccessedAt: (row.last_accessed_at as number | null) ?? null,
    salience: Number(row.salience ?? 0),
    scope: toMemoryScope(workspaceId),
    sourceMessageId: (row.source_message_id as string | null) ?? null,
    sourceThreadId: (row.source_thread_id as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    updatedAt: row.updated_at as number,
    userId: row.user_id as string,
    workspaceId,
  };
}

function deleteEmbeddingAcrossTables(
  db: ReturnType<typeof requireVectorDb>,
  id: string,
) {
  for (const dimensions of MEMORY_VECTOR_DIMENSIONS) {
    db.prepare(
      `DELETE FROM ${getMemoryEmbeddingTableName(dimensions)} WHERE memory_id = ?`,
    ).run(id);
  }
}

export function isMemoryVectorDbAvailable() {
  return vectorDb !== null;
}

export function countMemoriesByUser(userId: string) {
  const db = requireVectorDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM memory_items WHERE user_id = ?")
    .get(userId) as { count: number };

  return row.count;
}

function buildMemoryFilterQuery(
  filters: MemoryListFilters,
  options: QueryFiltersOptions = {},
): QueryFiltersResult {
  const includeKind = options.includeKind ?? true;
  const includeScope = options.includeScope ?? true;
  const conditions = ["user_id = ?"];
  const params: unknown[] = [filters.userId];

  if (includeScope && filters.scope === "global") {
    conditions.push("workspace_id IS NULL");
  } else if (includeScope && filters.scope === "workspace") {
    conditions.push("workspace_id = ?");
    params.push(filters.workspaceId ?? "");
  }

  if (filters.workspaceId && (!includeScope || filters.scope !== "workspace")) {
    conditions.push("(workspace_id IS NULL OR workspace_id = ?)");
    params.push(filters.workspaceId);
  }

  if (includeKind && filters.kind) {
    conditions.push("kind = ?");
    params.push(filters.kind);
  }

  if (typeof filters.pinned === "boolean") {
    conditions.push("is_pinned = ?");
    params.push(filters.pinned ? 1 : 0);
  }

  if (filters.query?.trim()) {
    conditions.push("(content LIKE ? OR coalesce(summary, '') LIKE ?)");
    const pattern = `%${filters.query.trim()}%`;
    params.push(pattern, pattern);
  }

  return { conditions, params };
}

export function listMemories(filters: MemoryListFilters): MemoryItem[] {
  const db = requireVectorDb();
  const { conditions, params } = buildMemoryFilterQuery(filters);
  const limit = Math.max(1, Math.min(filters.limit ?? 200, 500));
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT *
         FROM memory_items
        WHERE ${conditions.join(" AND ")}
        ORDER BY is_pinned DESC,
                 coalesce(last_accessed_at, updated_at) DESC,
                 updated_at DESC
        LIMIT ?`,
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map(mapMemoryRow);
}

export function countMemories(filters: Omit<MemoryListFilters, "limit">) {
  const db = requireVectorDb();
  const { conditions, params } = buildMemoryFilterQuery(filters);
  const row = db
    .prepare(
      `SELECT COUNT(*) as count
         FROM memory_items
        WHERE ${conditions.join(" AND ")}`,
    )
    .get(...params) as { count: number };

  return row.count;
}

export function getMemoryFacetCounts(
  filters: Omit<MemoryListFilters, "kind" | "limit" | "scope">,
): MemoryFacetCounts {
  const db = requireVectorDb();
  const { conditions, params } = buildMemoryFilterQuery(filters, {
    includeKind: false,
    includeScope: false,
  });
  const rows = db
    .prepare(
      `SELECT kind, workspace_id, COUNT(*) as count
         FROM memory_items
        WHERE ${conditions.join(" AND ")}
        GROUP BY kind, workspace_id`,
    )
    .all(...params) as Array<{
    count: number;
    kind: MemoryKind;
    workspace_id: string | null;
  }>;

  const kindCounts = MEMORY_KIND_VALUES.reduce(
    (accumulator, kind) => ({ ...accumulator, [kind]: 0 }),
    {} as Record<MemoryKind, number>,
  );
  const scopeCounts: Record<MemoryScope, number> = {
    global: 0,
    workspace: 0,
  };

  for (const row of rows) {
    kindCounts[row.kind] = (kindCounts[row.kind] ?? 0) + Number(row.count ?? 0);
    const scope = toMemoryScope(row.workspace_id ?? null);
    scopeCounts[scope] += Number(row.count ?? 0);
  }

  return {
    kindCounts,
    scopeCounts,
  };
}

export function getMemoryById(
  userId: string,
  memoryId: string,
): MemoryItem | null {
  const db = requireVectorDb();
  const row = db
    .prepare("SELECT * FROM memory_items WHERE user_id = ? AND id = ?")
    .get(userId, memoryId) as Record<string, unknown> | undefined;

  return row ? mapMemoryRow(row) : null;
}

export function upsertMemory(input: UpsertMemoryInput) {
  const db = requireVectorDb();
  const now = Date.now();
  const normalizedContent = normalizeMemoryText(input.content);
  const normalizedSummary = input.summary
    ? normalizeMemoryText(input.summary)
    : null;
  const workspaceId =
    input.scope === "workspace" ? (input.workspaceId ?? null) : null;
  const scopeKey = workspaceId ?? "__global__";
  const fingerprint = createFingerprint(
    input.kind,
    scopeKey,
    normalizedContent,
  );
  const tableName = getMemoryEmbeddingTableName(input.embeddingDimensions);
  const existing = db
    .prepare(
      `SELECT id
         FROM memory_items
        WHERE user_id = ?
          AND kind = ?
          AND coalesce(workspace_id, '') = ?
          AND fingerprint = ?`,
    )
    .get(input.userId, input.kind, workspaceId ?? "", fingerprint) as
    | { id: string }
    | undefined;
  const semanticDuplicate = existing
    ? null
    : ((
        db
          .prepare(
            `SELECT
               m.id,
               e.embedding as stored_embedding
             FROM memory_items m
             JOIN ${tableName} e ON e.memory_id = m.id
             WHERE m.user_id = ?
               AND m.kind = ?
               AND coalesce(m.workspace_id, '') = ?
               AND m.embedding_provider = ?
               AND m.embedding_model = ?
               AND m.embedding_dimensions = ?`,
          )
          .all(
            input.userId,
            input.kind,
            workspaceId ?? "",
            input.embeddingProvider,
            input.embeddingModel,
            input.embeddingDimensions,
          ) as Array<{ id: string; stored_embedding: unknown }>
      )
        .map((row) => ({
          id: row.id,
          similarity: cosineSimilarity(
            input.embedding,
            fromEmbeddingBuffer(row.stored_embedding),
          ),
        }))
        .sort((left, right) => right.similarity - left.similarity)[0] ?? null);

  const duplicateId = existing?.id
    ? existing.id
    : semanticDuplicate &&
        semanticDuplicate.similarity >= SEMANTIC_DEDUPLICATION_THRESHOLD
      ? semanticDuplicate.id
      : undefined;
  const id = duplicateId ?? createId();
  const buffer = toEmbeddingBuffer(input.embedding);
  const existingMemory = duplicateId
    ? getMemoryById(input.userId, duplicateId)
    : null;

  db.transaction(() => {
    if (existingMemory) {
      db.prepare(
        `UPDATE memory_items
            SET content = ?,
                summary = ?,
                salience = ?,
                source_thread_id = ?,
                source_message_id = ?,
                updated_at = ?,
                embedding_provider = ?,
                embedding_model = ?,
                embedding_dimensions = ?
          WHERE id = ?`,
      ).run(
        normalizedContent,
        normalizedSummary,
        Math.max(existingMemory.salience, input.salience ?? 0.5),
        input.sourceThreadId ?? null,
        input.sourceMessageId ?? null,
        now,
        input.embeddingProvider,
        input.embeddingModel,
        input.embeddingDimensions,
        id,
      );
    } else {
      db.prepare(
        `INSERT INTO memory_items
           (id, user_id, workspace_id, kind, content, summary, fingerprint, source_thread_id, source_message_id, salience, is_pinned, created_at, updated_at, last_accessed_at, embedding_provider, embedding_model, embedding_dimensions)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      ).run(
        id,
        input.userId,
        workspaceId,
        input.kind,
        normalizedContent,
        normalizedSummary,
        fingerprint,
        input.sourceThreadId ?? null,
        input.sourceMessageId ?? null,
        input.salience ?? 0.5,
        input.isPinned ? 1 : 0,
        now,
        now,
        input.embeddingProvider,
        input.embeddingModel,
        input.embeddingDimensions,
      );
    }

    deleteEmbeddingAcrossTables(db, id);
    db.prepare(
      `INSERT INTO ${tableName} (memory_id, embedding) VALUES (?, ?)`,
    ).run(id, buffer);
  })();

  return {
    memory: getMemoryById(input.userId, id)!,
    status: existingMemory ? ("updated" as const) : ("created" as const),
  };
}

export function deleteMemory(userId: string, memoryId: string) {
  const db = requireVectorDb();

  db.transaction(() => {
    deleteEmbeddingAcrossTables(db, memoryId);
    db.prepare("DELETE FROM memory_items WHERE user_id = ? AND id = ?").run(
      userId,
      memoryId,
    );
  })();
}

export function clearMemoriesForUser(userId: string) {
  const db = requireVectorDb();
  const memoryIds = db
    .prepare("SELECT id FROM memory_items WHERE user_id = ?")
    .all(userId) as Array<{ id: string }>;

  db.transaction(() => {
    for (const { id } of memoryIds) {
      deleteEmbeddingAcrossTables(db, id);
    }

    db.prepare("DELETE FROM memory_items WHERE user_id = ?").run(userId);
  })();

  return memoryIds.length;
}

export function toggleMemoryPinned(
  userId: string,
  memoryId: string,
  isPinned: boolean,
) {
  const db = requireVectorDb();
  db.prepare(
    "UPDATE memory_items SET is_pinned = ?, updated_at = ? WHERE user_id = ? AND id = ?",
  ).run(isPinned ? 1 : 0, Date.now(), userId, memoryId);
}

export function touchMemoryAccess(memoryIds: readonly string[]) {
  if (memoryIds.length === 0) {
    return;
  }

  const db = requireVectorDb();
  const now = Date.now();
  const statement = db.prepare(
    "UPDATE memory_items SET last_accessed_at = ? WHERE id = ?",
  );

  db.transaction(() => {
    for (const memoryId of memoryIds) {
      statement.run(now, memoryId);
    }
  })();
}

export function searchMemories({
  embeddingDimensions,
  embeddingModel,
  embeddingProvider,
  limit,
  queryEmbedding,
  scope,
  userId,
  workspaceId,
}: {
  embeddingDimensions: number;
  embeddingModel: string;
  embeddingProvider: MemoryItem["embeddingProvider"];
  limit: number;
  queryEmbedding: Float32Array | number[];
  scope: "both" | "global" | "workspace";
  userId: string;
  workspaceId?: string | null;
}): MemorySearchResult[] {
  const db = requireVectorDb();
  const tableName = getMemoryEmbeddingTableName(embeddingDimensions);
  const buffer = toEmbeddingBuffer(queryEmbedding);
  const fetchLimit = Math.max(limit * 8, 24);
  const queryVector = toFloat32Array(queryEmbedding);
  const conditions = [
    "m.user_id = ?",
    "m.embedding_provider = ?",
    "m.embedding_model = ?",
    "m.embedding_dimensions = ?",
  ];
  const params: unknown[] = [
    userId,
    embeddingProvider,
    embeddingModel,
    embeddingDimensions,
  ];

  if (scope === "global") {
    conditions.push("m.workspace_id IS NULL");
  } else if (scope === "workspace") {
    conditions.push("m.workspace_id = ?");
    params.push(workspaceId ?? "");
  } else if (workspaceId) {
    conditions.push("(m.workspace_id IS NULL OR m.workspace_id = ?)");
    params.push(workspaceId);
  } else {
    conditions.push("m.workspace_id IS NULL");
  }

  params.push(buffer, fetchLimit);

  const rows = db
    .prepare(
      `SELECT
         e.distance as distance,
         e.embedding as stored_embedding,
         m.*
       FROM ${tableName} e
       JOIN memory_items m ON m.id = e.memory_id
       WHERE ${conditions.join(" AND ")}
         AND e.embedding MATCH ?
         AND e.k = ?
       ORDER BY e.distance`,
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows
    .map((row) => {
      const memory = mapMemoryRow(row);
      const workspaceBoosted =
        Boolean(workspaceId) && memory.workspaceId === workspaceId;
      const cosine = cosineSimilarity(
        queryVector,
        fromEmbeddingBuffer(row.stored_embedding),
      );
      const decayFactor = calculateTimeDecayFactor({
        anchorTimestamp: memory.lastAccessedAt ?? memory.updatedAt,
        isPinned: memory.isPinned,
      });
      const workspaceBoost = workspaceBoosted ? 0.15 : 0;
      const pinBoost = memory.isPinned ? 0.2 : 0;
      const salienceBoost = memory.salience * 0.1;
      const score =
        cosine * decayFactor + workspaceBoost + pinBoost + salienceBoost;

      return {
        ...memory,
        cosineSimilarity: cosine,
        decayFactor,
        distance: Number(row.distance ?? 0),
        score,
        workspaceBoosted,
      } satisfies MemorySearchResult;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function reindexMemoriesForUser({
  embeddings,
  embeddingDimensions,
  embeddingModel,
  embeddingProvider,
  userId,
}: {
  embeddings: Array<{
    embedding: Float32Array | number[];
    memoryId: string;
  }>;
  embeddingDimensions: number;
  embeddingModel: string;
  embeddingProvider: MemoryItem["embeddingProvider"];
  userId: string;
}) {
  const db = requireVectorDb();
  const tableName = getMemoryEmbeddingTableName(embeddingDimensions);
  const insertEmbedding = db.prepare(
    `INSERT INTO ${tableName} (memory_id, embedding) VALUES (?, ?)`,
  );
  const updateMemory = db.prepare(
    `UPDATE memory_items
        SET embedding_provider = ?,
            embedding_model = ?,
            embedding_dimensions = ?,
            updated_at = ?
      WHERE user_id = ? AND id = ?`,
  );
  const now = Date.now();

  db.transaction(() => {
    const memoryIds = db
      .prepare("SELECT id FROM memory_items WHERE user_id = ?")
      .all(userId) as Array<{ id: string }>;

    for (const { id } of memoryIds) {
      deleteEmbeddingAcrossTables(db, id);
    }

    for (const item of embeddings) {
      insertEmbedding.run(item.memoryId, toEmbeddingBuffer(item.embedding));
      updateMemory.run(
        embeddingProvider,
        embeddingModel,
        embeddingDimensions,
        now,
        userId,
        item.memoryId,
      );
    }
  })();
}

export function listMemoriesForEmbeddingProfile({
  embeddingDimensions,
  embeddingModel,
  embeddingProvider,
  userId,
}: {
  embeddingDimensions: number;
  embeddingModel: string;
  embeddingProvider: MemoryItem["embeddingProvider"];
  userId: string;
}) {
  const db = requireVectorDb();
  const rows = db
    .prepare(
      `SELECT *
         FROM memory_items
        WHERE user_id = ?
          AND embedding_provider = ?
          AND embedding_model = ?
          AND embedding_dimensions = ?
        ORDER BY updated_at DESC`,
    )
    .all(
      userId,
      embeddingProvider,
      embeddingModel,
      embeddingDimensions,
    ) as Record<string, unknown>[];

  return rows.map(mapMemoryRow);
}

export const __internal = {
  calculateTimeDecayFactor,
  cosineSimilarity,
  createFingerprint,
  fromEmbeddingBuffer,
  normalizeMemoryText,
  SEMANTIC_DEDUPLICATION_THRESHOLD,
};
