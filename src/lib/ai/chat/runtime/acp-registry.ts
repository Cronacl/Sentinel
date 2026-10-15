import "server-only";

import {
  createAcpRegistryDescriptor,
  getAcpRegistryDescriptor,
  readAcpRegistryConfig,
} from "@/lib/ai/chat/engines/acp/agents/registry";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import type { LoadedEngineThread } from "@/lib/ai/chat/engines/platform/driver";

import type { ThreadChatRequest } from "../types";
import { runAcpThreadChat, stopAcpThreadRun } from "./acp/run";

// Registry agent threads (driver "acp") run on the shared ACP runtime with
// the instance's own descriptor (engines/acp/agents/registry.ts). Not under
// runtime/acp/, which is that shared runtime.

export function runAcpRegistryThreadChat(
  request: ThreadChatRequest,
  thread: LoadedEngineThread,
  instance?: ResolvedEngineInstance | null,
) {
  const descriptor = instance
    ? getAcpRegistryDescriptor(instance)
    : createAcpRegistryDescriptor({
        config: readAcpRegistryConfig({}),
        stateDir: null,
      });
  return runAcpThreadChat(descriptor, request, thread, instance);
}

/** Stopping never needs the instance (it may no longer resolve). */
export function stopAcpRegistryThreadRun(
  request: ThreadChatRequest,
  thread: LoadedEngineThread,
  instance?: ResolvedEngineInstance | null,
) {
  const descriptor = instance
    ? getAcpRegistryDescriptor(instance)
    : createAcpRegistryDescriptor({
        config: readAcpRegistryConfig({}),
        stateDir: null,
      });
  return stopAcpThreadRun(descriptor, request, thread);
}
