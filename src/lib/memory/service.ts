import { generateObject } from "ai";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import { z } from "zod";

import {
  MEMORY_KIND_VALUES,
  MEMORY_SCOPE_VALUES,
  resolveMemoryScope,
  type MemoryItem,
  type MemoryKind,
  type MemoryScope,
  type MemorySearchResult,
  type MemorySearchScope,
  type MemorySettings,
} from "@/lib/memory";
import {
  DEFAULT_MEMORY_EMBEDDING_PROFILE,
  getMemoryEmbeddingProfile,
  type MemoryEmbeddingProfile,
} from "@/lib/memory/profiles";
import {
  countMemoriesByUser,
  deleteMemory,
  getMemoryById,
  listMemories,
  reindexMemoriesForUser,
  searchMemories,
  touchMemoryAccess,
  upsertMemory,
} from "@/lib/memory/repository";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import {
  embedTextForMemory,
  embedTextsForMemory,
} from "../ai/providers/embeddings";

const AUTO_SAVE_EXTRACTION_SCHEMA = z.object({
  memories: z.array(
    z.object({
      content: z.string().min(8),
      kind: z.enum(MEMORY_KIND_VALUES),
      salience: z.number().min(0).max(1).optional(),
      scope: z.enum(MEMORY_SCOPE_VALUES).optional(),
      summary: z.string().min(4).max(160).optional(),
    }),
  ),
});

const SECRET_PATTERNS = [
  /\bapi[_ -]?key\b/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /\bpassword\b/i,
  /\bprivate[_ -]?key\b/i,
  /\bBearer\s+[A-Za-z0-9._-]+\b/i,
] as const;

const MEMORY_PROMPT_MAX_ITEMS = 6;
const MEMORY_PROMPT_CONTENT_MAX_CHARS = 220;
const AUTO_SAVE_TRANSCRIPT_MAX_MESSAGES = 10;

function truncate(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars).trimEnd()}...`;
}

function getTextParts(message: ThreadUIMessage) {
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text.trim())
    .filter(Boolean);
}

export function buildMemoryPromptLines(memories: MemorySearchResult[]) {
  return memories.slice(0, MEMORY_PROMPT_MAX_ITEMS).map((memory) => {
    const prefix =
      memory.scope === "workspace"
        ? `[Workspace ${memory.workspaceId}]`
        : "[Global]";
    const label =
      memory.summary?.trim() ||
      truncate(memory.content, MEMORY_PROMPT_CONTENT_MAX_CHARS);
    return `${prefix} ${memory.kind}: ${label}`;
  });
}

export function extractLatestUserText(messages: ThreadUIMessage[]) {
  const latest = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  return latest ? getTextParts(latest).join("\n\n").trim() : "";
}

function redactable(value: string) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function resolveProfile(settings: MemorySettings) {
  return (
    getMemoryEmbeddingProfile(settings.memoryProvider, settings.memoryModel) ??
    DEFAULT_MEMORY_EMBEDDING_PROFILE
  );
}

export async function retrieveRelevantMemories({
  abortSignal,
  limit,
  query,
  requestedScope,
  settings,
  userId,
  workspaceId,
}: {
  abortSignal?: AbortSignal;
  limit?: number;
  query: string;
  requestedScope?: MemorySearchScope | null;
  settings: MemorySettings;
  userId: string;
  workspaceId?: string | null;
}) {
  if (!settings.enabled || !query.trim()) {
    return [] satisfies MemorySearchResult[];
  }

  const profile = resolveProfile(settings);
  const embedding = await embedTextForMemory({
    abortSignal,
    profile,
    text: query.trim(),
    userId,
  });
  const memories = searchMemories({
    embeddingDimensions: profile.dimensions,
    embeddingModel: profile.model,
    embeddingProvider: profile.provider,
    limit: limit ?? settings.retrievalLimit,
    queryEmbedding: embedding,
    scope: resolveMemoryScope(requestedScope, settings.defaultScope),
    userId,
    workspaceId,
  });

  touchMemoryAccess(memories.map((memory) => memory.id));
  return memories;
}

export async function saveMemoryRecord({
  abortSignal,
  content,
  kind,
  salience,
  scope,
  settings,
  sourceMessageId,
  sourceThreadId,
  summary,
  userId,
  workspaceId,
}: {
  abortSignal?: AbortSignal;
  content: string;
  kind: MemoryKind;
  salience?: number;
  scope: MemoryScope;
  settings: MemorySettings;
  sourceMessageId?: string | null;
  sourceThreadId?: string | null;
  summary?: string | null;
  userId: string;
  workspaceId?: string | null;
}) {
  if (!settings.enabled) {
    throw new Error("Memory is disabled. Enable it in Settings > Memory.");
  }

  if (redactable(content) || (summary && redactable(summary))) {
    throw new Error("Refusing to save sensitive information to memory.");
  }

  const profile = resolveProfile(settings);
  const embedding = await embedTextForMemory({
    abortSignal,
    profile,
    text: summary?.trim() || content.trim(),
    userId,
  });

  return upsertMemory({
    content,
    embedding,
    embeddingDimensions: profile.dimensions,
    embeddingModel: profile.model,
    embeddingProvider: profile.provider,
    kind,
    salience,
    scope,
    sourceMessageId,
    sourceThreadId,
    summary,
    userId,
    workspaceId,
  });
}

export function forgetMemoryRecord(userId: string, memoryId: string) {
  const memory = getMemoryById(userId, memoryId);

  if (!memory) {
    throw new Error("Memory not found.");
  }

  deleteMemory(userId, memoryId);
  return memory;
}

function buildAutosaveTranscript(messages: ThreadUIMessage[]) {
  return messages
    .slice(-AUTO_SAVE_TRANSCRIPT_MAX_MESSAGES)
    .map((message) => {
      const text = getTextParts(message).join("\n\n").trim();
      if (!text) {
        return null;
      }

      return `${message.role.toUpperCase()}:\n${text}`;
    })
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

export async function autosaveConversationMemories({
  messages,
  model,
  providerOptions,
  settings,
  sourceMessageId,
  threadId,
  userId,
  workspaceId,
}: {
  messages: ThreadUIMessage[];
  model: unknown;
  providerOptions?: SharedV3ProviderOptions;
  settings: MemorySettings;
  sourceMessageId: string;
  threadId: string;
  userId: string;
  workspaceId?: string | null;
}) {
  if (!settings.enabled || !settings.autoSaveEnabled) {
    return [] as MemoryItem[];
  }

  const transcript = buildAutosaveTranscript(messages);
  if (!transcript) {
    return [] as MemoryItem[];
  }

  try {
    const result = await generateObject({
      model: model as Parameters<typeof generateObject>[0]["model"],
      output: "object",
      prompt: [
        "Extract durable long-term memories from this conversation.",
        "Return only facts that will improve future conversations.",
        "Allowed memory kinds: preference, profile, workflow, project, fact.",
        "Allowed scope values: global or workspace.",
        "Ignore transient requests, one-off tasks, temporary status updates, secrets, API keys, tokens, copied credentials, and sensitive data.",
        `Return at most ${settings.autoSavePerTurnLimit} memories.`,
        "",
        transcript,
      ].join("\n"),
      schema: AUTO_SAVE_EXTRACTION_SCHEMA,
      ...(providerOptions ? { providerOptions } : {}),
    });

    const candidates = result.object.memories
      .slice(0, settings.autoSavePerTurnLimit)
      .filter(
        (memory) =>
          !redactable(memory.content) && !redactable(memory.summary ?? ""),
      );

    if (candidates.length === 0) {
      return [] as MemoryItem[];
    }

    const profile = resolveProfile(settings);
    const embeddings = await embedTextsForMemory({
      profile,
      texts: candidates.map(
        (candidate) => candidate.summary?.trim() || candidate.content.trim(),
      ),
      userId,
    });

    return candidates.map(
      (candidate, index) =>
        upsertMemory({
          content: candidate.content,
          embedding: embeddings[index]!,
          embeddingDimensions: profile.dimensions,
          embeddingModel: profile.model,
          embeddingProvider: profile.provider,
          kind: candidate.kind,
          salience: candidate.salience ?? 0.6,
          scope:
            candidate.scope === "workspace" && workspaceId
              ? "workspace"
              : "global",
          sourceMessageId,
          sourceThreadId: threadId,
          summary: candidate.summary ?? null,
          userId,
          workspaceId,
        }).memory,
    );
  } catch {
    return [] as MemoryItem[];
  }
}

export async function reindexAllMemories({
  nextProfile,
  userId,
}: {
  nextProfile: MemoryEmbeddingProfile;
  userId: string;
}) {
  if (countMemoriesByUser(userId) === 0) {
    return 0;
  }

  const memories = listMemories({ limit: 1000, userId });

  const embeddings = await embedTextsForMemory({
    profile: nextProfile,
    texts: memories.map((memory) => memory.summary?.trim() || memory.content),
    userId,
  });

  reindexMemoriesForUser({
    embeddingDimensions: nextProfile.dimensions,
    embeddingModel: nextProfile.model,
    embeddingProvider: nextProfile.provider,
    embeddings: memories.map((memory, index) => ({
      embedding: embeddings[index]!,
      memoryId: memory.id,
    })),
    userId,
  });

  return memories.length;
}
