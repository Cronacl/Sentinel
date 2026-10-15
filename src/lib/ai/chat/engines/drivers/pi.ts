import "server-only";

import { DRIVER_CATALOG } from "../catalog";
import { invalidatePiBinaryResolutions } from "../pi/binary";
import { disposePiInstanceProcesses } from "../pi/launch";
import { probePiEngine } from "../pi/probe";
import {
  defineEngineDriver,
  LEGACY_EXTERNAL_THREAD_TRIGGERS,
} from "../platform/driver";
import { piAuth } from "./auth/pi";

// Pi (`pi --mode rpc`, design acp-and-agents §4): JSONL RPC, not ACP.
// Probes resolve `pi` cheaply and carry the last full result forward; a
// full probe runs an ephemeral `pi --mode rpc --no-session` for its models
// and commands. Turns run on runtime/pi over the shared external mirror,
// one long-lived process per (instance, thread).

async function loadRuntime() {
  return await import("@/lib/ai/chat/runtime/pi");
}

export const piDriver = defineEngineDriver({
  auth: piAuth,
  capabilities: DRIVER_CATALOG.pi.capabilities,
  async dispose(instance) {
    await disposePiInstanceProcesses(instance.id);
  },
  // A full probe spawns Pi: trust one for 10 minutes and answer interval
  // and focus refreshes cheaply in between.
  fullProbeTtlMs: 10 * 60 * 1_000,
  invalidate() {
    invalidatePiBinaryResolutions();
  },
  kind: "pi",
  meta: DRIVER_CATALOG.pi,
  probe: (instance, options) => probePiEngine(instance, options),
  // Above the probe's own 8 s request bound plus binary resolution (a 4 s
  // version check, a login shell); the signal kills Pi when it gives up.
  probeTimeoutMs: 15_000,
  thread: {
    async run({ instance, request, thread }) {
      const runtime = await loadRuntime();
      return await runtime.runPiThreadChat(request, thread, instance);
    },
    async stop({ instance, request, thread }) {
      const runtime = await loadRuntime();
      return await runtime.stopPiThreadRun(request, thread, instance);
    },
    triggers: LEGACY_EXTERNAL_THREAD_TRIGGERS,
  },
});
