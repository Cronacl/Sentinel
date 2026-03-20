import type { ThreadUIMessage } from "@/lib/ai/messages/types";

const DEFAULT_CONTEXT_WINDOW = 128_000;

export function resolveEffectiveContextWindow(contextWindow?: number | null) {
  return contextWindow && contextWindow > 0
    ? contextWindow
    : DEFAULT_CONTEXT_WINDOW;
}

export function resolveConfiguredContextWindow(input: {
  contextWindow?: number | null;
  fixedWindowSize?: number | null;
  useFixedWindow?: boolean;
}) {
  if (
    input.useFixedWindow &&
    input.fixedWindowSize != null &&
    input.fixedWindowSize > 0
  ) {
    return input.fixedWindowSize;
  }

  return resolveEffectiveContextWindow(input.contextWindow);
}

export function getLatestCompletedAssistantInputTokens(
  messages: ThreadUIMessage[],
) {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") {
      continue;
    }

    if (message.metadata?.status !== "completed") {
      continue;
    }

    const inputTokens = message.metadata?.usage?.inputTokens;
    if (typeof inputTokens === "number" && Number.isFinite(inputTokens)) {
      return inputTokens;
    }
  }

  return null;
}

export function getExactContextWindowUsage(input: {
  contextWindow?: number | null;
  fixedWindowSize?: number | null;
  messages: ThreadUIMessage[];
  useFixedWindow?: boolean;
}) {
  const inputTokens = getLatestCompletedAssistantInputTokens(input.messages);
  if (inputTokens == null) {
    return null;
  }

  const contextWindow = resolveConfiguredContextWindow({
    contextWindow: input.contextWindow,
    fixedWindowSize: input.fixedWindowSize,
    useFixedWindow: input.useFixedWindow,
  });
  const usedRatio = contextWindow > 0 ? inputTokens / contextWindow : 0;

  return {
    contextWindow,
    inputTokens,
    usedPercent: Math.max(0, Math.min(100, Math.round(usedRatio * 100))),
    usedRatio: Math.max(0, usedRatio),
  };
}
