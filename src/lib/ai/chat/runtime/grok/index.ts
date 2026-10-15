import "server-only";

import { grokAcpAgent } from "@/lib/ai/chat/engines/acp/agents/grok";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import type { LoadedEngineThread } from "@/lib/ai/chat/engines/platform/driver";

import type { ThreadChatRequest } from "../../types";
import { runAcpThreadChat, stopAcpThreadRun } from "../acp/run";

// Grok threads run on the shared ACP runtime with the Grok descriptor
// (engines/acp/agents/grok.ts).

export function runGrokThreadChat(
  request: ThreadChatRequest,
  thread: LoadedEngineThread,
  instance?: ResolvedEngineInstance | null,
) {
  return runAcpThreadChat(grokAcpAgent, request, thread, instance);
}

/** Stopping never needs the instance (it may no longer resolve). */
export function stopGrokThreadRun(
  request: ThreadChatRequest,
  thread: LoadedEngineThread,
  _instance?: ResolvedEngineInstance | null,
) {
  return stopAcpThreadRun(grokAcpAgent, request, thread);
}
