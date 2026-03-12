import type { AIProvider } from "@/server/db/enums";

import type { MemoryKind, MemoryScope } from "@/lib/memory";

export const MEMORY_VECTOR_DIMENSIONS = [1536, 2048, 3072] as const;
export type MemoryVectorDimension = (typeof MEMORY_VECTOR_DIMENSIONS)[number];

export type MemoryRecord = {
  content: string;
  createdAt: number;
  embeddingDimensions: number;
  embeddingModel: string;
  embeddingProvider: AIProvider;
  fingerprint: string;
  id: string;
  isPinned: boolean;
  kind: MemoryKind;
  lastAccessedAt: number | null;
  salience: number;
  sourceMessageId: string | null;
  sourceThreadId: string | null;
  summary: string | null;
  updatedAt: number;
  userId: string;
  workspaceId: string | null;
};

export type MemorySearchRow = MemoryRecord & {
  distance: number;
};

export function getMemoryEmbeddingTableName(
  dimensions: number,
): `memory_embeddings_${number}` {
  return `memory_embeddings_${dimensions}`;
}

export function toMemoryScope(workspaceId: string | null): MemoryScope {
  return workspaceId ? "workspace" : "global";
}
