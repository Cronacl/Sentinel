/**
 * Knowledge base schema for the vector database (vectors.db).
 *
 * This is a separate SQLite database from the main app database to avoid
 * conflicts with drizzle-kit, which cannot introspect sqlite-vec virtual tables.
 *
 * Three tables work together:
 *
 *   knowledge_sources   - tracks ingested files/documents per workspace
 *   knowledge_chunks    - stores text chunks from each source
 *   knowledge_embeddings - vec0 virtual table linking chunk IDs to embeddings
 *
 * All queries against these tables go through the raw better-sqlite3 instance
 * exported as `vectorDb` from `@/server/db`.
 */

export type KnowledgeSourceStatus =
  | "pending"
  | "processing"
  | "ready"
  | "error";

export type KnowledgeSource = {
  id: string;
  workspaceId: string;
  sourceType: string;
  sourcePath: string;
  displayName: string;
  hash: string | null;
  chunkCount: number;
  status: KnowledgeSourceStatus;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeChunk = {
  id: string;
  sourceId: string;
  workspaceId: string;
  chunkIndex: number;
  chunkText: string;
  tokenCount: number;
  createdAt: number;
};

export type KnowledgeSearchResult = {
  chunkId: string;
  chunkText: string;
  sourcePath: string;
  displayName: string;
  distance: number;
};

export const VECTOR_DIMENSION = 1536;
