import type { ActiveCursorRunControl } from "./run";

declare global {
  // eslint-disable-next-line no-var
  var __sentinelActiveCursorRunControls:
    | Map<string, ActiveCursorRunControl>
    | undefined;
}

// Cursor ACP requests can ask for approval/input while the prompt is running;
// this map bridges those callbacks to the persisted assistant mirror.
export const activeCursorRunControls =
  globalThis.__sentinelActiveCursorRunControls ??
  (globalThis.__sentinelActiveCursorRunControls = new Map<
    string,
    ActiveCursorRunControl
  >());

export function resolveActiveCursorRunControl(input: {
  activeRunId: string | null;
  threadId: string;
}) {
  if (input.activeRunId) {
    const byRunId = activeCursorRunControls.get(input.activeRunId);
    if (byRunId) {
      return byRunId;
    }
  }

  for (const control of activeCursorRunControls.values()) {
    if (control.threadId === input.threadId) {
      return control;
    }
  }

  return null;
}
