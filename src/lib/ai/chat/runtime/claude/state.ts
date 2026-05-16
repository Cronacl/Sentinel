import type { ActiveClaudeRunControl } from "./run";

declare global {
  // eslint-disable-next-line no-var
  var __sentinelActiveClaudeRunControls:
    | Map<string, ActiveClaudeRunControl>
    | undefined;
}

// Keep this on globalThis so Bun's module isolation in tests and hot reloads
// can still find in-flight Claude approval queues by thread/run id.
export const activeClaudeRunControls =
  globalThis.__sentinelActiveClaudeRunControls ??
  (globalThis.__sentinelActiveClaudeRunControls = new Map<
    string,
    ActiveClaudeRunControl
  >());

export function findActiveClaudeRunForThread(threadId: string) {
  for (const control of activeClaudeRunControls.values()) {
    if (control.threadId === threadId) {
      return control;
    }
  }

  return null;
}

export function resolveActiveClaudeRunControl(input: {
  activeRunId?: string | null;
  threadId: string;
}) {
  if (input.activeRunId) {
    return activeClaudeRunControls.get(input.activeRunId) ?? null;
  }

  return findActiveClaudeRunForThread(input.threadId);
}
