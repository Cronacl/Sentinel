import "server-only";

import { cursorAcpAgent } from "../acp/agents/cursor";
import { disposeAcpInstanceProcesses } from "../acp/launch";
import { probeAcpAgent } from "../acp/probe";
import { DRIVER_CATALOG } from "../catalog";
import {
  defineEngineDriver,
  LEGACY_EXTERNAL_THREAD_TRIGGERS,
} from "../platform/driver";

// Cursor Agent on the shared ACP engine (engines/acp, descriptor in
// acp/agents/cursor.ts). Probes never authenticate or open a session:
// cheap probes check the binary and carry the last full result forward,
// full probes initialize the agent and list its models.

async function loadRuntime() {
  return await import("@/lib/ai/chat/runtime/cursor");
}

export const cursorDriver = defineEngineDriver({
  capabilities: DRIVER_CATALOG.cursor.capabilities,
  async dispose(instance) {
    await disposeAcpInstanceProcesses(instance.id);
  },
  // A full probe spawns `agent acp`: trust one for 10 minutes and answer
  // interval and focus refreshes cheaply in between.
  fullProbeTtlMs: 10 * 60 * 1_000,
  invalidate() {
    cursorAcpAgent.invalidate?.();
  },
  kind: "cursor",
  meta: DRIVER_CATALOG.cursor,
  probe: (instance, options) =>
    probeAcpAgent(cursorAcpAgent, instance, options),
  // Above the probe's own 8 s initialize and model-list bounds plus binary
  // resolution; the signal kills the agent when the platform gives up.
  probeTimeoutMs: 15_000,
  thread: {
    async run({ instance, request, thread }) {
      const runtime = await loadRuntime();
      return await runtime.runCursorThreadChat(request, thread, instance);
    },
    async stop({ instance, request, thread }) {
      const runtime = await loadRuntime();
      return await runtime.stopCursorThreadRun(request, thread, instance);
    },
    triggers: LEGACY_EXTERNAL_THREAD_TRIGGERS,
  },
});
