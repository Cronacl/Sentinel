import "server-only";

import {
  antigravityAcpAgent,
  antigravityAcpAgentFor,
} from "@/lib/ai/chat/engines/acp/agents/antigravity";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import type { LoadedEngineThread } from "@/lib/ai/chat/engines/platform/driver";

import type { ThreadChatRequest } from "../types";
import { runAcpThreadChat, stopAcpThreadRun } from "./acp/run";
import { resolveThreadEngineInstance } from "./engine-instance";

// Antigravity threads run on the shared ACP runtime with the Antigravity
// descriptor for the thread's instance (it signs in with that instance's
// method).

export async function runAntigravityThreadChat(
  request: ThreadChatRequest,
  thread: LoadedEngineThread,
  instanceInput?: ResolvedEngineInstance | null,
) {
  const instance =
    instanceInput ??
    (await resolveThreadEngineInstance(request.userId, {
      chatEngine: "antigravity",
      chatEngineInstanceId: thread?.chatEngineInstanceId ?? null,
    }));
  return await runAcpThreadChat(
    await antigravityAcpAgentFor(instance),
    request,
    thread,
    instance,
  );
}

/** Stopping never needs the instance (it may no longer resolve). */
export function stopAntigravityThreadRun(
  request: ThreadChatRequest,
  thread: LoadedEngineThread,
  _instance?: ResolvedEngineInstance | null,
) {
  return stopAcpThreadRun(antigravityAcpAgent, request, thread);
}
