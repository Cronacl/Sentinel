import type { ActiveCopilotRunControl } from "./run";

declare global {
  // eslint-disable-next-line no-var
  var __sentinelActiveCopilotRunControls:
    | Map<string, ActiveCopilotRunControl>
    | undefined;
}

// Copilot callbacks arrive outside the original request stack, so live controls
// stay process-local and are keyed by run id for approval/user-input responses.
export const activeCopilotRunControls =
  globalThis.__sentinelActiveCopilotRunControls ??
  (globalThis.__sentinelActiveCopilotRunControls = new Map<
    string,
    ActiveCopilotRunControl
  >());

export function findActiveCopilotRunForThread(threadId: string) {
  for (const control of activeCopilotRunControls.values()) {
    if (control.threadId === threadId) {
      return control;
    }
  }

  return null;
}

export function resolveActiveCopilotRunControl(input: {
  activeRunId?: string | null;
  threadId: string;
}) {
  if (input.activeRunId) {
    return activeCopilotRunControls.get(input.activeRunId) ?? null;
  }

  return findActiveCopilotRunForThread(input.threadId);
}
