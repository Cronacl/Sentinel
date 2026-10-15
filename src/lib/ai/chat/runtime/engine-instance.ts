import "server-only";

import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import {
  legacyRequestOptionsFromSelections,
  parseEngineOptionSelections,
} from "@/lib/ai/chat/engines/model-options";

import type { ThreadChatRequest } from "../types";

/**
 * The instance a thread is bound to, for runtimes that start a turn without
 * the dispatcher (draining their own follow-up queue). Throws
 * EngineInstanceUnavailableError when it can no longer run. The registry is
 * loaded on demand so runtime modules stay importable on their own.
 */
export async function resolveThreadEngineInstance(
  userId: string,
  thread: { chatEngine: string; chatEngineInstanceId?: string | null },
): Promise<ResolvedEngineInstance> {
  const { getEngineInstanceRegistry } =
    await import("@/lib/ai/chat/engines/platform/instances");
  return await getEngineInstanceRegistry().resolve(userId, {
    driver: thread.chatEngine,
    instanceId: thread.chatEngineInstanceId ?? null,
  });
}

/**
 * What a queued follow-up carries back into its turn: its option
 * selections, and the reasoning effort and OpenCode options they imply for
 * the runtimes that read those fields.
 */
export function getFollowUpModelRequestOptions(followUp: {
  modelOptions?: unknown;
  reasoningEffort?: string | null;
}): Pick<ThreadChatRequest, "modelOptions" | "openCode" | "reasoningEffort"> {
  const modelOptions = parseEngineOptionSelections(followUp.modelOptions);
  const legacy = legacyRequestOptionsFromSelections(modelOptions);
  const reasoningEffort =
    (followUp.reasoningEffort as ThreadChatRequest["reasoningEffort"]) ??
    legacy.reasoningEffort;

  return {
    ...(modelOptions ? { modelOptions } : {}),
    ...(legacy.openCode ? { openCode: legacy.openCode } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}
