import { beforeEach, describe, expect, it, mock } from "bun:test";

type MemoryRow = {
  content: string;
  created_at: number;
  embedding_dimensions: number;
  embedding_model: string;
  embedding_provider: string;
  fingerprint: string;
  id: string;
  is_pinned: number;
  kind: string;
  last_accessed_at: number | null;
  salience: number;
  source_message_id: string | null;
  source_thread_id: string | null;
  summary: string | null;
  updated_at: number;
  user_id: string;
  workspace_id: string | null;
};

type PreparedStatement = {
  all: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
};

function fromBuffer(buffer: unknown) {
  const bytes =
    buffer instanceof Uint8Array
      ? buffer
      : Uint8Array.from(buffer as ArrayLike<number>);

  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}

function cosineSimilarity(left: Float32Array, right: Float32Array) {
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

function createFakeVectorDb() {
  const memoryItems = new Map<string, MemoryRow>();
  const embeddings = new Map<number, Map<string, Float32Array>>([
    [1536, new Map()],
    [2048, new Map()],
    [3072, new Map()],
  ]);

  const sortMemories = (rows: MemoryRow[]) =>
    [...rows].sort((left, right) => {
      const leftAnchor = left.last_accessed_at ?? left.updated_at;
      const rightAnchor = right.last_accessed_at ?? right.updated_at;

      if (left.is_pinned !== right.is_pinned) {
        return right.is_pinned - left.is_pinned;
      }

      if (leftAnchor !== rightAnchor) {
        return rightAnchor - leftAnchor;
      }

      return right.updated_at - left.updated_at;
    });

  const prepare = (sql: string): PreparedStatement => ({
    all: (...params: unknown[]) => {
      if (sql.includes("SELECT *") && sql.includes("FROM memory_items")) {
        const userId = params[0] as string;
        const limit = params.at(-1) as number;

        return sortMemories(
          [...memoryItems.values()].filter((row) => row.user_id === userId),
        ).slice(0, limit);
      }

      if (sql.includes("SELECT kind, workspace_id, COUNT(*) as count")) {
        const userId = params[0] as string;
        const grouped = new Map<string, { count: number; kind: string; workspace_id: string | null }>();

        for (const row of memoryItems.values()) {
          if (row.user_id !== userId) {
            continue;
          }

          const key = `${row.kind}::${row.workspace_id ?? ""}`;
          grouped.set(key, {
            count: (grouped.get(key)?.count ?? 0) + 1,
            kind: row.kind,
            workspace_id: row.workspace_id,
          });
        }

        return [...grouped.values()];
      }

      if (sql.includes("e.distance as distance")) {
        const [userId, provider, model, dimensions, queryBuffer, limit] =
          params as [string, string, string, number, Uint8Array, number];
        const queryEmbedding = fromBuffer(queryBuffer);
        const embeddingTable = embeddings.get(dimensions) ?? new Map();

        return [...memoryItems.values()]
          .filter(
            (row) =>
              row.user_id === userId &&
              row.embedding_provider === provider &&
              row.embedding_model === model &&
              row.embedding_dimensions === dimensions &&
              row.workspace_id === null,
          )
          .map((row) => {
            const storedEmbedding =
              embeddingTable.get(row.id) ?? new Float32Array(dimensions);
            const distance = 1 - cosineSimilarity(queryEmbedding, storedEmbedding);

            return {
              ...row,
              distance,
              stored_embedding: Buffer.from(storedEmbedding.buffer),
            };
          })
          .sort((left, right) => left.distance - right.distance)
          .slice(0, limit);
      }

      if (sql.includes("SELECT") && sql.includes("stored_embedding")) {
        const [userId, kind, workspaceId, provider, model, dimensions] = params as [
          string,
          string,
          string,
          string,
          string,
          number,
        ];
        const embeddingTable = embeddings.get(dimensions) ?? new Map();

        return [...memoryItems.values()]
          .filter(
            (row) =>
              row.user_id === userId &&
              row.kind === kind &&
              (row.workspace_id ?? "") === workspaceId &&
              row.embedding_provider === provider &&
              row.embedding_model === model &&
              row.embedding_dimensions === dimensions,
          )
          .map((row) => ({
            id: row.id,
            stored_embedding: Buffer.from(
              (embeddingTable.get(row.id) ?? new Float32Array(dimensions)).buffer,
            ),
          }));
      }

      throw new Error(`Unsupported all() query in test double:\n${sql}`);
    },
    get: (...params: unknown[]) => {
      if (sql.includes("SELECT COUNT(*) as count FROM memory_items WHERE user_id = ?")) {
        const userId = params[0] as string;
        return {
          count: [...memoryItems.values()].filter((row) => row.user_id === userId)
            .length,
        };
      }

      if (sql.includes("SELECT COUNT(*) as count") && sql.includes("FROM memory_items")) {
        const userId = params[0] as string;
        return {
          count: [...memoryItems.values()].filter((row) => row.user_id === userId)
            .length,
        };
      }

      if (sql.includes("SELECT * FROM memory_items WHERE user_id = ? AND id = ?")) {
        const [userId, id] = params as [string, string];
        const row = memoryItems.get(id);
        return row?.user_id === userId ? row : undefined;
      }

      if (sql.includes("SELECT id") && sql.includes("fingerprint = ?")) {
        const [userId, kind, workspaceId, fingerprint] = params as [
          string,
          string,
          string,
          string,
        ];
        const row = [...memoryItems.values()].find(
          (candidate) =>
            candidate.user_id === userId &&
            candidate.kind === kind &&
            (candidate.workspace_id ?? "") === workspaceId &&
            candidate.fingerprint === fingerprint,
        );

        return row ? { id: row.id } : undefined;
      }

      throw new Error(`Unsupported get() query in test double:\n${sql}`);
    },
    run: (...params: unknown[]) => {
      if (sql.startsWith("DELETE FROM memory_embeddings_")) {
        const dimensions = Number(sql.match(/memory_embeddings_(\d+)/)?.[1] ?? "0");
        const table = embeddings.get(dimensions);

        if (params.length === 0) {
          table?.clear();
        } else {
          table?.delete(params[0] as string);
        }

        return;
      }

      if (sql === "DELETE FROM memory_items") {
        memoryItems.clear();
        return;
      }

      if (sql.startsWith("INSERT INTO memory_items")) {
        const [
          id,
          userId,
          workspaceId,
          kind,
          content,
          summary,
          fingerprint,
          sourceThreadId,
          sourceMessageId,
          salience,
          isPinned,
          createdAt,
          updatedAt,
          embeddingProvider,
          embeddingModel,
          embeddingDimensions,
        ] = params as [
          string,
          string,
          string | null,
          string,
          string,
          string | null,
          string,
          string | null,
          string | null,
          number,
          number,
          number,
          number,
          string,
          string,
          number,
        ];

        memoryItems.set(id, {
          content,
          created_at: createdAt,
          embedding_dimensions: embeddingDimensions,
          embedding_model: embeddingModel,
          embedding_provider: embeddingProvider,
          fingerprint,
          id,
          is_pinned: isPinned,
          kind,
          last_accessed_at: null,
          salience,
          source_message_id: sourceMessageId,
          source_thread_id: sourceThreadId,
          summary,
          updated_at: updatedAt,
          user_id: userId,
          workspace_id: workspaceId,
        });
        return;
      }

      if (sql.includes("UPDATE memory_items") && sql.includes("SET content = ?")) {
        const [
          content,
          summary,
          salience,
          sourceThreadId,
          sourceMessageId,
          updatedAt,
          embeddingProvider,
          embeddingModel,
          embeddingDimensions,
          id,
        ] = params as [
          string,
          string | null,
          number,
          string | null,
          string | null,
          number,
          string,
          string,
          number,
          string,
        ];
        const row = memoryItems.get(id);

        if (!row) {
          return;
        }

        row.content = content;
        row.summary = summary;
        row.salience = salience;
        row.source_thread_id = sourceThreadId;
        row.source_message_id = sourceMessageId;
        row.updated_at = updatedAt;
        row.embedding_provider = embeddingProvider;
        row.embedding_model = embeddingModel;
        row.embedding_dimensions = embeddingDimensions;
        return;
      }

      if (sql.startsWith("INSERT INTO memory_embeddings_")) {
        const dimensions = Number(sql.match(/memory_embeddings_(\d+)/)?.[1] ?? "0");
        const [memoryId, buffer] = params as [string, Uint8Array];
        embeddings.get(dimensions)?.set(memoryId, fromBuffer(buffer));
        return;
      }

      if (sql === "UPDATE memory_items SET last_accessed_at = ? WHERE id = ?") {
        const [timestamp, id] = params as [number, string];
        const row = memoryItems.get(id);
        if (row) {
          row.last_accessed_at = timestamp;
        }
        return;
      }

      throw new Error(`Unsupported run() query in test double:\n${sql}`);
    },
  });

  return {
    prepare,
    transaction<T>(callback: () => T) {
      return () => callback();
    },
  };
}

const vectorDb = createFakeVectorDb();
let idCounter = 0;

mock.module("@paralleldrive/cuid2", () => ({
  createId: () => `memory-${++idCounter}`,
}));

mock.module("@/server/db", () => ({
  vectorDb,
}));

const { listMemories, searchMemories, upsertMemory } = await import("./repository");

function resetVectorDb() {
  vectorDb.prepare("DELETE FROM memory_embeddings_1536").run();
  vectorDb.prepare("DELETE FROM memory_embeddings_2048").run();
  vectorDb.prepare("DELETE FROM memory_embeddings_3072").run();
  vectorDb.prepare("DELETE FROM memory_items").run();
}

function createEmbedding(values: number[]) {
  const embedding = new Float32Array(1536);

  for (const [index, value] of values.entries()) {
    embedding[index] = value;
  }

  return embedding;
}

function saveMemory({
  content,
  embedding,
  isPinned,
  kind = "preference",
  salience = 0.5,
  scope = "global",
  summary = null,
  workspaceId = null,
}: {
  content: string;
  embedding: Float32Array;
  isPinned?: boolean;
  kind?: "fact" | "preference" | "profile" | "project" | "workflow";
  salience?: number;
  scope?: "global" | "workspace";
  summary?: string | null;
  workspaceId?: string | null;
}) {
  return upsertMemory({
    content,
    embedding,
    embeddingDimensions: 1536,
    embeddingModel: "text-embedding-3-small",
    embeddingProvider: "openai",
    isPinned,
    kind,
    salience,
    scope,
    summary,
    userId: "user-1",
    workspaceId,
  });
}

beforeEach(() => {
  resetVectorDb();
  idCounter = 0;
});

describe("memory repository", () => {
  it("updates an existing exact-fingerprint memory", () => {
    const first = saveMemory({
      content: "User prefers TypeScript",
      embedding: createEmbedding([1, 0]),
      isPinned: true,
      salience: 0.4,
      summary: "Prefers TypeScript",
    });

    const second = saveMemory({
      content: "  User   prefers TypeScript  ",
      embedding: createEmbedding([1, 0]),
      isPinned: false,
      salience: 0.7,
      summary: "Prefers TypeScript for app work",
    });

    const memories = listMemories({ limit: 10, userId: "user-1" });

    expect(second.status).toBe("updated");
    expect(memories).toHaveLength(1);
    expect(second.memory.id).toBe(first.memory.id);
    expect(second.memory.isPinned).toBe(true);
    expect(second.memory.salience).toBe(0.7);
    expect(second.memory.summary).toBe("Prefers TypeScript for app work");
  });

  it("merges a near-duplicate memory in the same kind and scope", () => {
    const first = saveMemory({
      content: "User prefers TypeScript for app code.",
      embedding: createEmbedding([1, 0]),
      salience: 0.6,
      summary: "Prefers TypeScript",
    });

    const second = saveMemory({
      content: "The user prefers TypeScript across frontend work.",
      embedding: createEmbedding([0.96, 0.28]),
      salience: 0.5,
      summary: "Uses TypeScript by preference",
    });

    const memories = listMemories({ limit: 10, userId: "user-1" });

    expect(second.status).toBe("updated");
    expect(memories).toHaveLength(1);
    expect(second.memory.id).toBe(first.memory.id);
    expect(second.memory.content).toBe(
      "The user prefers TypeScript across frontend work.",
    );
    expect(second.memory.salience).toBe(0.6);
  });

  it("creates a new memory when similarity stays below the dedupe threshold", () => {
    saveMemory({
      content: "User prefers TypeScript for app code.",
      embedding: createEmbedding([1, 0]),
      summary: "Prefers TypeScript",
    });

    const second = saveMemory({
      content: "User prefers Python for scripts.",
      embedding: createEmbedding([0.8, 0.6]),
      summary: "Prefers Python",
    });

    const memories = listMemories({ limit: 10, userId: "user-1" });

    expect(second.status).toBe("created");
    expect(memories).toHaveLength(2);
  });

  it("does not merge identical text across different scopes or kinds", () => {
    saveMemory({
      content: "User prefers TypeScript",
      embedding: createEmbedding([1, 0]),
      summary: "Prefers TypeScript",
    });

    saveMemory({
      content: "User prefers TypeScript",
      embedding: createEmbedding([1, 0]),
      scope: "workspace",
      summary: "Prefers TypeScript",
      workspaceId: "workspace-1",
    });

    saveMemory({
      content: "User prefers TypeScript",
      embedding: createEmbedding([1, 0]),
      kind: "fact",
      summary: "Prefers TypeScript",
    });

    const memories = listMemories({ limit: 10, userId: "user-1" });

    expect(memories).toHaveLength(3);
  });

  it("ranks recently accessed memories above stale ones when similarity is equal", () => {
    const oldMemory = saveMemory({
      content: "User prefers TypeScript",
      embedding: createEmbedding([1, 0]),
      summary: "Prefers TypeScript",
    });
    const recentMemory = saveMemory({
      content: "User prefers TypeScript for UI work",
      embedding: createEmbedding([1, 0]),
      kind: "fact",
      summary: "Prefers TypeScript",
    });
    const now = Date.now();
    const staleTimestamp = now - 180 * 24 * 60 * 60 * 1000;

    vectorDb
      .prepare("UPDATE memory_items SET last_accessed_at = ? WHERE id = ?")
      .run(staleTimestamp, oldMemory.memory.id);
    vectorDb
      .prepare("UPDATE memory_items SET last_accessed_at = ? WHERE id = ?")
      .run(now, recentMemory.memory.id);

    const results = searchMemories({
      embeddingDimensions: 1536,
      embeddingModel: "text-embedding-3-small",
      embeddingProvider: "openai",
      limit: 2,
      queryEmbedding: createEmbedding([1, 0]),
      scope: "global",
      userId: "user-1",
    });

    expect(results.map((result) => result.id)).toEqual([
      recentMemory.memory.id,
      oldMemory.memory.id,
    ]);
    expect(results[0]?.decayFactor).toBeGreaterThan(results[1]?.decayFactor ?? 0);
  });

  it("lets pinned memories bypass decay during retrieval ranking", () => {
    const pinnedMemory = saveMemory({
      content: "User prefers TypeScript",
      embedding: createEmbedding([1, 0]),
      isPinned: true,
      summary: "Prefers TypeScript",
    });
    const recentMemory = saveMemory({
      content: "User prefers TypeScript for UI work",
      embedding: createEmbedding([1, 0]),
      kind: "fact",
      summary: "Prefers TypeScript",
    });
    const staleTimestamp = Date.now() - 180 * 24 * 60 * 60 * 1000;

    vectorDb
      .prepare("UPDATE memory_items SET last_accessed_at = ? WHERE id = ?")
      .run(staleTimestamp, pinnedMemory.memory.id);

    const results = searchMemories({
      embeddingDimensions: 1536,
      embeddingModel: "text-embedding-3-small",
      embeddingProvider: "openai",
      limit: 2,
      queryEmbedding: createEmbedding([1, 0]),
      scope: "global",
      userId: "user-1",
    });

    expect(results[0]?.id).toBe(pinnedMemory.memory.id);
    expect(results[0]?.decayFactor).toBe(1);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
    expect(recentMemory.memory.id).toBeDefined();
  });
});
