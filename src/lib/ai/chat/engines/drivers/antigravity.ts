import "server-only";

import { rm } from "node:fs/promises";

import { antigravityAcpAgent } from "../acp/agents/antigravity";
import {
  describeAntigravityInstall,
  installAntigravityServer,
} from "../acp/antigravity/install";
import { getAntigravityTempDirectory } from "../acp/antigravity/profile";
import { disposeAcpInstanceProcesses } from "../acp/launch";
import { probeAcpAgent } from "../acp/probe";
import { DRIVER_CATALOG } from "../catalog";
import {
  defineEngineDriver,
  LEGACY_EXTERNAL_THREAD_TRIGGERS,
} from "../platform/driver";
import { ENGINE_MAINTENANCE_DEFINITIONS } from "../platform/maintenance/definitions";
import { getEngineInstanceStateDirectory } from "../platform/paths";
import { antigravityAuth } from "./auth/antigravity";

// Google Antigravity on the shared ACP engine (descriptor in
// acp/agents/antigravity.ts). Sentinel installs Google's agy-acp-server
// itself (managed install, on the user's confirmed action only). Probes
// never spawn it: the version and sign-in come from disk.

async function loadRuntime() {
  return await import("@/lib/ai/chat/runtime/antigravity");
}

export const antigravityDriver = defineEngineDriver({
  auth: antigravityAuth,
  capabilities: DRIVER_CATALOG.antigravity.capabilities,
  async dispose(instance) {
    await disposeAcpInstanceProcesses(instance.id);
    // A killed server leaves its ~1 GB unpack behind: reclaim it.
    try {
      const stateDir = getEngineInstanceStateDirectory(instance.id);
      await rm(getAntigravityTempDirectory({ stateDir }), {
        force: true,
        recursive: true,
      });
    } catch {
      // Best effort.
    }
  },
  kind: "antigravity",
  maintenance: {
    ...ENGINE_MAINTENANCE_DEFINITIONS.antigravity!,
    managedInstall: {
      description: describeAntigravityInstall(),
      label: "Install Antigravity",
      async run({ instance, onProgress, signal }) {
        await installAntigravityServer({
          descriptor: antigravityAcpAgent,
          instance,
          onProgress,
          signal,
        });
      },
    },
  },
  meta: DRIVER_CATALOG.antigravity,
  probe: (instance, options) =>
    probeAcpAgent(antigravityAcpAgent, instance, options),
  probeTimeoutMs: 10_000,
  thread: {
    async run({ instance, request, thread }) {
      const runtime = await loadRuntime();
      return await runtime.runAntigravityThreadChat(request, thread, instance);
    },
    async stop({ instance, request, thread }) {
      const runtime = await loadRuntime();
      return await runtime.stopAntigravityThreadRun(request, thread, instance);
    },
    triggers: LEGACY_EXTERNAL_THREAD_TRIGGERS,
  },
});
