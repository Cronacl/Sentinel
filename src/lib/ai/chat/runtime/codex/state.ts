import type { ActiveCodexRunControl } from "./run";

// Active run controls are process-local companions to resumable streams; they
// let stop/approval paths interrupt the live Codex turn without changing SSE.
export const activeCodexRunControls = new Map<string, ActiveCodexRunControl>();

export function findActiveCodexRunForThread(
  threadId: string,
): ActiveCodexRunControl | null {
  for (const control of activeCodexRunControls.values()) {
    if (control.threadId === threadId) {
      return control;
    }
  }
  return null;
}
