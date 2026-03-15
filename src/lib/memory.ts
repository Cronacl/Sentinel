import type { AIProvider } from "@/server/db/enums";

import {
  DEFAULT_MEMORY_EMBEDDING_PROFILE,
  getMemoryEmbeddingProfile,
  getMemoryEmbeddingProfileById,
  type MemoryEmbeddingProfile,
} from "./memory/profiles";

export const MEMORY_SCOPE_VALUES = ["global", "workspace"] as const;
export type MemoryScope = (typeof MEMORY_SCOPE_VALUES)[number];

export const MEMORY_KIND_VALUES = [
  "preference",
  "profile",
  "workflow",
  "project",
  "fact",
] as const;
export type MemoryKind = (typeof MEMORY_KIND_VALUES)[number];

export const MEMORY_SEARCH_SCOPE_VALUES = [
  "auto",
  "both",
  "global",
  "workspace",
] as const;
export type MemorySearchScope = (typeof MEMORY_SEARCH_SCOPE_VALUES)[number];

export const DEFAULT_MEMORY_ENABLED = false;
export const DEFAULT_MEMORY_AUTO_SAVE_ENABLED = true;
export const DEFAULT_MEMORY_SCOPE: MemoryScope = "global";
export const DEFAULT_MEMORY_RETRIEVAL_LIMIT = 6;
export const DEFAULT_MEMORY_AUTO_SAVE_PER_TURN_LIMIT = 3;
export const MIN_MEMORY_RETRIEVAL_LIMIT = 1;
export const MAX_MEMORY_RETRIEVAL_LIMIT = 12;
export const MIN_MEMORY_AUTO_SAVE_PER_TURN_LIMIT = 1;
export const MAX_MEMORY_AUTO_SAVE_PER_TURN_LIMIT = 6;

export type MemorySettings = {
  autoSaveEnabled: boolean;
  defaultScope: MemoryScope;
  enabled: boolean;
  memoryDimensions: number;
  memoryModel: string;
  memoryProvider: AIProvider;
  retrievalLimit: number;
  autoSavePerTurnLimit: number;
};

export type MemoryItem = {
  content: string;
  createdAt: number;
  embeddingDimensions: number;
  embeddingModel: string;
  embeddingProvider: AIProvider;
  id: string;
  isPinned: boolean;
  kind: MemoryKind;
  lastAccessedAt: number | null;
  salience: number;
  scope: MemoryScope;
  sourceMessageId: string | null;
  sourceThreadId: string | null;
  summary: string | null;
  updatedAt: number;
  userId: string;
  workspaceId: string | null;
};

export type MemorySearchResult = MemoryItem & {
  cosineSimilarity: number;
  decayFactor: number;
  distance: number;
  score: number;
  workspaceBoosted: boolean;
};

export function clampMemoryRetrievalLimit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MEMORY_RETRIEVAL_LIMIT;
  }

  return Math.min(
    MAX_MEMORY_RETRIEVAL_LIMIT,
    Math.max(MIN_MEMORY_RETRIEVAL_LIMIT, Math.floor(value)),
  );
}

export function clampAutoSavePerTurnLimit(
  value: number | null | undefined,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MEMORY_AUTO_SAVE_PER_TURN_LIMIT;
  }

  return Math.min(
    MAX_MEMORY_AUTO_SAVE_PER_TURN_LIMIT,
    Math.max(MIN_MEMORY_AUTO_SAVE_PER_TURN_LIMIT, Math.floor(value)),
  );
}

export function resolveMemoryScope(
  requestedScope: MemorySearchScope | MemoryScope | null | undefined,
  defaultScope: MemoryScope,
): Exclude<MemorySearchScope, "auto"> {
  if (
    requestedScope === "global" ||
    requestedScope === "workspace" ||
    requestedScope === "both"
  ) {
    return requestedScope;
  }

  if (requestedScope === "auto" || requestedScope == null) {
    return defaultScope === "workspace" ? "both" : "global";
  }

  return "global";
}

export function getDefaultMemorySettings(): MemorySettings {
  return {
    autoSaveEnabled: DEFAULT_MEMORY_AUTO_SAVE_ENABLED,
    defaultScope: DEFAULT_MEMORY_SCOPE,
    enabled: DEFAULT_MEMORY_ENABLED,
    memoryDimensions: DEFAULT_MEMORY_EMBEDDING_PROFILE.dimensions,
    memoryModel: DEFAULT_MEMORY_EMBEDDING_PROFILE.model,
    memoryProvider: DEFAULT_MEMORY_EMBEDDING_PROFILE.provider,
    retrievalLimit: DEFAULT_MEMORY_RETRIEVAL_LIMIT,
    autoSavePerTurnLimit: DEFAULT_MEMORY_AUTO_SAVE_PER_TURN_LIMIT,
  };
}

export function getMemoryProfileFromSettings(
  settings: Pick<MemorySettings, "memoryDimensions" | "memoryModel" | "memoryProvider">,
): MemoryEmbeddingProfile | null {
  const profile = getMemoryEmbeddingProfile(
    settings.memoryProvider,
    settings.memoryModel,
  );

  if (!profile) {
    return null;
  }

  return profile.dimensions === settings.memoryDimensions ? profile : null;
}

export function normalizeMemorySettings(
  value:
    | Partial<MemorySettings>
    | {
        autoSaveEnabled?: boolean | null;
        autoSavePerTurnLimit?: number | null;
        defaultScope?: string | null;
        enabled?: boolean | null;
        memoryDimensions?: number | null;
        memoryModel?: string | null;
        memoryProvider?: AIProvider | null;
        retrievalLimit?: number | null;
      }
    | null
    | undefined,
): MemorySettings {
  const candidate = (value ?? {}) as {
    autoSaveEnabled?: boolean | null;
    autoSavePerTurnLimit?: number | null;
    defaultScope?: MemoryScope | null;
    enabled?: boolean | null;
    memoryDimensions?: number | null;
    memoryModel?: string | null;
    memoryProvider?: AIProvider | null;
    retrievalLimit?: number | null;
  };

  const fallback = getDefaultMemorySettings();
  const storedProfile =
    candidate.memoryProvider && candidate.memoryModel
      ? getMemoryEmbeddingProfile(candidate.memoryProvider, candidate.memoryModel)
      : null;

  const profile =
    (candidate.memoryProvider && candidate.memoryModel
      ? getMemoryEmbeddingProfileById(
          `${candidate.memoryProvider}:${candidate.memoryModel}`,
        )
      : null) ??
    (storedProfile &&
    candidate.memoryDimensions &&
    storedProfile.dimensions === candidate.memoryDimensions
      ? storedProfile
      : null) ??
    fallbackProfileForCandidate(candidate) ??
    DEFAULT_MEMORY_EMBEDDING_PROFILE;

  return {
    autoSaveEnabled: candidate.autoSaveEnabled ?? fallback.autoSaveEnabled,
    autoSavePerTurnLimit: clampAutoSavePerTurnLimit(
      candidate.autoSavePerTurnLimit,
    ),
    defaultScope:
      candidate.defaultScope === "workspace" ? "workspace" : "global",
    enabled: candidate.enabled ?? fallback.enabled,
    memoryDimensions: profile.dimensions,
    memoryModel: profile.model,
    memoryProvider: profile.provider,
    retrievalLimit: clampMemoryRetrievalLimit(candidate.retrievalLimit),
  };
}

function fallbackProfileForCandidate(candidate: {
  memoryDimensions?: number | null;
  memoryModel?: string | null;
  memoryProvider?: AIProvider | null;
}) {
  if (!candidate.memoryProvider && !candidate.memoryModel) {
    return null;
  }

  return (
    getMemoryEmbeddingProfile(
      candidate.memoryProvider ?? DEFAULT_MEMORY_EMBEDDING_PROFILE.provider,
      candidate.memoryModel ?? DEFAULT_MEMORY_EMBEDDING_PROFILE.model,
    ) ?? null
  );
}
