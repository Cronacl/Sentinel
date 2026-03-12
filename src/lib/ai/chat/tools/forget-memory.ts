import { z } from "zod";

import { forgetMemoryRecord } from "@/lib/memory/service";

export const forgetMemoryInputSchema = z.object({
  memoryId: z.string().min(1).describe("The memory ID to remove."),
});

export const forgetMemoryOutputSchema = z.object({
  deleted: z.boolean(),
  kind: z.string(),
  memoryId: z.string(),
  summary: z.string().nullable(),
});

export type ForgetMemoryInput = z.infer<typeof forgetMemoryInputSchema>;
export type ForgetMemoryOutput = z.infer<typeof forgetMemoryOutputSchema>;

export async function executeForgetMemory({
  input,
  runtime,
}: {
  input: ForgetMemoryInput;
  runtime: {
    userId: string;
  };
}): Promise<ForgetMemoryOutput> {
  const removed = forgetMemoryRecord(runtime.userId, input.memoryId);

  return {
    deleted: true,
    kind: removed.kind,
    memoryId: removed.id,
    summary: removed.summary,
  };
}
