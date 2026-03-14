import { z } from "zod";

import {
  MEMORY_KIND_VALUES,
  MEMORY_SCOPE_VALUES,
  type MemorySettings,
} from "@/lib/memory";
import { saveMemoryRecord } from "@/lib/memory/service";

export const saveMemoryInputSchema = z.object({
  content: z
    .string()
    .min(8)
    .max(8_000)
    .describe("Durable information worth keeping for future conversations."),
  kind: z.enum(MEMORY_KIND_VALUES).describe("The kind of memory being stored."),
  salience: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("How important this memory is for future recall."),
  scope: z
    .enum([...MEMORY_SCOPE_VALUES, "auto"] as const)
    .optional()
    .describe("Store as global memory or attach it to the active workspace."),
  summary: z
    .string()
    .max(160)
    .optional()
    .describe("Compact memory summary for prompt injection."),
});

export const saveMemoryOutputSchema = z.object({
  kind: z.enum(MEMORY_KIND_VALUES),
  memoryId: z.string(),
  scope: z.enum(MEMORY_SCOPE_VALUES),
  status: z.enum(["created", "updated"]),
  summary: z.string().nullable(),
});

export type SaveMemoryInput = z.infer<typeof saveMemoryInputSchema>;
export type SaveMemoryOutput = z.infer<typeof saveMemoryOutputSchema>;

export async function executeSaveMemory({
  abortSignal,
  input,
  runtime,
}: {
  abortSignal?: AbortSignal;
  input: SaveMemoryInput;
  runtime: {
    settings: MemorySettings;
    sourceMessageId?: string | null;
    threadId: string;
    userId: string;
    workspaceId?: string | null;
  };
}): Promise<SaveMemoryOutput> {
  const scope =
    input.scope && input.scope !== "auto"
      ? input.scope
      : runtime.settings.defaultScope;

  const result = await saveMemoryRecord({
    abortSignal,
    content: input.content,
    kind: input.kind,
    salience: input.salience,
    scope,
    settings: runtime.settings,
    sourceMessageId: runtime.sourceMessageId,
    sourceThreadId: runtime.threadId,
    summary: input.summary ?? null,
    userId: runtime.userId,
    workspaceId: runtime.workspaceId,
  });

  return {
    kind: result.memory.kind,
    memoryId: result.memory.id,
    scope: result.memory.scope,
    status: result.status,
    summary: result.memory.summary,
  };
}
