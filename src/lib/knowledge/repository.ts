import { createId } from "@paralleldrive/cuid2";

import { vectorDb } from "@/server/db";
import {
  VECTOR_DIMENSION,
  type KnowledgeChunk,
  type KnowledgeSearchResult,
  type KnowledgeSource,
  type KnowledgeSourceStatus,
} from "@/server/db/knowledge-schema";

function requireVectorDb() {
  if (!vectorDb) {
    throw new Error(
      "Vector database is not available. The sqlite-vec extension may not be installed.",
    );
  }
  return vectorDb;
}

export function isVectorDbAvailable(): boolean {
  return vectorDb !== null;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export function insertSource(
  input: Pick<
    KnowledgeSource,
    "workspaceId" | "sourceType" | "sourcePath" | "displayName"
  >,
): KnowledgeSource {
  const db = requireVectorDb();
  const now = Date.now();
  const id = createId();

  db.prepare(
    `INSERT INTO knowledge_sources
       (id, workspace_id, source_type, source_path, display_name, hash, chunk_count, status, error_message, created_at, updated_at)
     VALUES
       (?, ?, ?, ?, ?, NULL, 0, 'pending', NULL, ?, ?)`,
  ).run(
    id,
    input.workspaceId,
    input.sourceType,
    input.sourcePath,
    input.displayName,
    now,
    now,
  );

  return getSourceById(id)!;
}

export function getSourceById(id: string): KnowledgeSource | null {
  const db = requireVectorDb();
  const row = db
    .prepare("SELECT * FROM knowledge_sources WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;

  return row ? mapSourceRow(row) : null;
}

export function listSourcesByWorkspace(
  workspaceId: string,
): KnowledgeSource[] {
  const db = requireVectorDb();
  const rows = db
    .prepare(
      "SELECT * FROM knowledge_sources WHERE workspace_id = ? ORDER BY created_at DESC",
    )
    .all(workspaceId) as Record<string, unknown>[];

  return rows.map(mapSourceRow);
}

export function updateSourceStatus(
  sourceId: string,
  status: KnowledgeSourceStatus,
  opts?: { chunkCount?: number; hash?: string; errorMessage?: string | null },
): void {
  const db = requireVectorDb();
  const sets = ["status = ?", "updated_at = ?"];
  const params: unknown[] = [status, Date.now()];

  if (opts?.chunkCount !== undefined) {
    sets.push("chunk_count = ?");
    params.push(opts.chunkCount);
  }
  if (opts?.hash !== undefined) {
    sets.push("hash = ?");
    params.push(opts.hash);
  }
  if (opts?.errorMessage !== undefined) {
    sets.push("error_message = ?");
    params.push(opts.errorMessage);
  }

  params.push(sourceId);
  db.prepare(
    `UPDATE knowledge_sources SET ${sets.join(", ")} WHERE id = ?`,
  ).run(...params);
}

export function deleteSource(sourceId: string): void {
  const db = requireVectorDb();

  const chunkIds = db
    .prepare("SELECT id FROM knowledge_chunks WHERE source_id = ?")
    .all(sourceId) as { id: string }[];

  const deleteEmbeddings = db.prepare(
    "DELETE FROM knowledge_embeddings WHERE chunk_id = ?",
  );

  db.transaction(() => {
    for (const { id } of chunkIds) {
      deleteEmbeddings.run(id);
    }
    db.prepare("DELETE FROM knowledge_chunks WHERE source_id = ?").run(
      sourceId,
    );
    db.prepare("DELETE FROM knowledge_sources WHERE id = ?").run(sourceId);
  })();
}

// ---------------------------------------------------------------------------
// Chunks + Embeddings
// ---------------------------------------------------------------------------

export function insertChunksWithEmbeddings(
  sourceId: string,
  workspaceId: string,
  chunks: Array<{
    text: string;
    tokenCount: number;
    embedding: Float32Array | number[];
  }>,
): void {
  const db = requireVectorDb();
  const now = Date.now();

  const insertChunk = db.prepare(
    `INSERT INTO knowledge_chunks
       (id, source_id, workspace_id, chunk_index, chunk_text, token_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEmbedding = db.prepare(
    "INSERT INTO knowledge_embeddings (chunk_id, embedding) VALUES (?, ?)",
  );

  db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const chunkId = createId();

      insertChunk.run(
        chunkId,
        sourceId,
        workspaceId,
        i,
        chunk.text,
        chunk.tokenCount,
        now,
      );

      const buffer =
        chunk.embedding instanceof Float32Array
          ? Buffer.from(chunk.embedding.buffer)
          : Buffer.from(new Float32Array(chunk.embedding).buffer);

      insertEmbedding.run(chunkId, buffer);
    }
  })();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function searchByEmbedding(
  workspaceId: string,
  queryEmbedding: Float32Array | number[],
  limit = 10,
): KnowledgeSearchResult[] {
  const db = requireVectorDb();

  const buffer =
    queryEmbedding instanceof Float32Array
      ? Buffer.from(queryEmbedding.buffer)
      : Buffer.from(new Float32Array(queryEmbedding).buffer);

  const rows = db
    .prepare(
      `SELECT
         e.chunk_id,
         e.distance,
         c.chunk_text,
         s.source_path,
         s.display_name
       FROM knowledge_embeddings e
       JOIN knowledge_chunks c ON c.id = e.chunk_id
       JOIN knowledge_sources s ON s.id = c.source_id
       WHERE c.workspace_id = ?
         AND e.embedding MATCH ?
         AND e.k = ?
       ORDER BY e.distance`,
    )
    .all(workspaceId, buffer, limit) as Array<{
    chunk_id: string;
    distance: number;
    chunk_text: string;
    source_path: string;
    display_name: string;
  }>;

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    chunkText: row.chunk_text,
    sourcePath: row.source_path,
    displayName: row.display_name,
    distance: row.distance,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapSourceRow(row: Record<string, unknown>): KnowledgeSource {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    sourceType: row.source_type as string,
    sourcePath: row.source_path as string,
    displayName: row.display_name as string,
    hash: (row.hash as string) ?? null,
    chunkCount: row.chunk_count as number,
    status: row.status as KnowledgeSourceStatus,
    errorMessage: (row.error_message as string) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
