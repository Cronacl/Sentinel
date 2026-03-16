import type { Chat } from "@ai-sdk/react";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

const registry = new Map<string, Chat<ThreadUIMessage>>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getChatInstance(
  threadId: string,
): Chat<ThreadUIMessage> | undefined {
  const timer = cleanupTimers.get(threadId);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(threadId);
  }
  return registry.get(threadId);
}

export function setChatInstance(
  threadId: string,
  instance: Chat<ThreadUIMessage>,
) {
  registry.set(threadId, instance);
}

const CLEANUP_DELAY_MS = 30_000;

export function scheduleChatInstanceCleanup(threadId: string) {
  const timer = setTimeout(() => {
    registry.delete(threadId);
    cleanupTimers.delete(threadId);
  }, CLEANUP_DELAY_MS);
  cleanupTimers.set(threadId, timer);
}
