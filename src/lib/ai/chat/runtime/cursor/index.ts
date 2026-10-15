import "server-only";

import { cursorAcpAgent } from "@/lib/ai/chat/engines/acp/agents/cursor";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import type { LoadedEngineThread } from "@/lib/ai/chat/engines/platform/driver";

import type { ThreadChatRequest } from "../../types";
import { runAcpThreadChat, stopAcpThreadRun } from "../acp/run";

// Cursor threads run on the shared ACP runtime with the Cursor descriptor.

export function runCursorThreadChat(
  request: ThreadChatRequest,
  thread: LoadedEngineThread,
  instance?: ResolvedEngineInstance | null,
) {
  return runAcpThreadChat(cursorAcpAgent, request, thread, instance);
}

/** Stopping never needs the instance (it may no longer resolve). */
export function stopCursorThreadRun(
  request: ThreadChatRequest,
  thread: LoadedEngineThread,
  _instance?: ResolvedEngineInstance | null,
) {
  return stopAcpThreadRun(cursorAcpAgent, request, thread);
}
