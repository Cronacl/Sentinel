import type { AcpRunControl } from "./control";

declare global {
  // eslint-disable-next-line no-var
  var __sentinelActiveAcpRunControls: Map<string, AcpRunControl> | undefined;
}

// Agent requests (approvals, questions) arrive while a prompt runs; this map
// bridges them to the request that answers them and to Stop. On globalThis
// so dev-server module copies share it.
export const activeAcpRunControls =
  globalThis.__sentinelActiveAcpRunControls ??
  (globalThis.__sentinelActiveAcpRunControls = new Map<
    string,
    AcpRunControl
  >());

export function resolveActiveAcpRunControl(input: {
  activeRunId: string | null;
  threadId: string;
}) {
  if (input.activeRunId) {
    const byRunId = activeAcpRunControls.get(input.activeRunId);
    if (byRunId) {
      return byRunId;
    }
  }

  for (const control of activeAcpRunControls.values()) {
    if (control.threadId === input.threadId && !control.finished) {
      return control;
    }
  }

  return null;
}
