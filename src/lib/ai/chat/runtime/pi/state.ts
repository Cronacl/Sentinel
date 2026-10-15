import type { PiRunControl } from "./control";

declare global {
  // eslint-disable-next-line no-var
  var __sentinelActivePiRunControls: Map<string, PiRunControl> | undefined;
}

// Extension dialogs arrive while a prompt runs; this map bridges them to the
// request that answers them and to Stop. On globalThis so dev-server module
// copies share it.
export const activePiRunControls =
  globalThis.__sentinelActivePiRunControls ??
  (globalThis.__sentinelActivePiRunControls = new Map<string, PiRunControl>());

export function resolveActivePiRunControl(input: {
  activeRunId: string | null;
  threadId: string;
}) {
  if (input.activeRunId) {
    const byRunId = activePiRunControls.get(input.activeRunId);
    if (byRunId) {
      return byRunId;
    }
  }
  for (const control of activePiRunControls.values()) {
    if (control.threadId === input.threadId && !control.finished) {
      return control;
    }
  }
  return null;
}
