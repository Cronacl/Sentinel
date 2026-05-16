import type { ChatEngine } from "@/server/db/enums";

import { runCodexThreadChat, stopCodexThreadRun } from "../codex";
import { runClaudeThreadChat, stopClaudeThreadRun } from "../claude";
import { runCopilotThreadChat, stopCopilotThreadRun } from "../copilot";
import { runCursorThreadChat, stopCursorThreadRun } from "../cursor";
import { runOpenCodeThreadChat, stopOpenCodeThreadRun } from "../opencode";
import type { ThreadChatRequest } from "../../types";

export type LoadedThread = Awaited<
  ReturnType<typeof import("../../persistence").loadThread>
>;

export type ThreadEngineAdapter = {
  run(
    request: ThreadChatRequest,
    existingThread: LoadedThread,
  ): Promise<Response>;
  stop(
    request: ThreadChatRequest,
    existingThread: LoadedThread,
  ): Promise<Response>;
};

// Sentinel is handled by the local orchestrator; this table is only for engines
// whose lifecycle is owned by their runtime modules.
const externalEngineAdapters: Partial<Record<ChatEngine, ThreadEngineAdapter>> =
  {
    claude: {
      run: runClaudeThreadChat,
      stop: stopClaudeThreadRun,
    },
    codex: {
      run: runCodexThreadChat,
      stop: stopCodexThreadRun,
    },
    copilot: {
      run: runCopilotThreadChat,
      stop: stopCopilotThreadRun,
    },
    cursor: {
      run: runCursorThreadChat,
      stop: stopCursorThreadRun,
    },
    opencode: {
      run: runOpenCodeThreadChat,
      stop: stopOpenCodeThreadRun,
    },
  };

export function resolveThreadEngine(
  request: ThreadChatRequest,
  existingThread: LoadedThread,
): ChatEngine {
  return existingThread?.chatEngine ?? request.engine ?? "sentinel";
}

export function getThreadEngineAdapter(engine: ChatEngine) {
  return externalEngineAdapters[engine] ?? null;
}

export async function runExternalThreadEngine(
  engine: ChatEngine,
  request: ThreadChatRequest,
  existingThread: LoadedThread,
) {
  return getThreadEngineAdapter(engine)?.run(request, existingThread) ?? null;
}

export async function stopThreadEngine(
  engine: ChatEngine,
  request: ThreadChatRequest,
  existingThread: LoadedThread,
) {
  return getThreadEngineAdapter(engine)?.stop(request, existingThread) ?? null;
}
