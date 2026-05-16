import type { ActiveOpenCodeRunControl } from "./run";

declare global {
  // eslint-disable-next-line no-var
  var __sentinelActiveOpenCodeRunControls:
    | Map<string, ActiveOpenCodeRunControl>
    | undefined;
}

// OpenCode emits permission/question events from its SDK stream; this map keeps
// the live event pump connected to persisted UI state and stop requests.
export const activeOpenCodeRunControls =
  globalThis.__sentinelActiveOpenCodeRunControls ??
  (globalThis.__sentinelActiveOpenCodeRunControls = new Map<
    string,
    ActiveOpenCodeRunControl
  >());

export function resolveActiveOpenCodeRunControl(input: {
  activeRunId: string | null;
  threadId: string;
}) {
  if (input.activeRunId) {
    const byRunId = activeOpenCodeRunControls.get(input.activeRunId);
    if (byRunId) return byRunId;
  }

  for (const control of activeOpenCodeRunControls.values()) {
    if (control.threadId === input.threadId) return control;
  }

  return null;
}
