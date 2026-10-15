import "server-only";

import {
  forgetAcpRegistryDescriptor,
  getAcpRegistryDescriptor,
  readAcpRegistryConfig,
} from "../acp/agents/registry";
import { readAcpCatalog } from "../acp/catalog-cache";
import { toAcpEngineModels } from "../acp/config-options";
import { disposeAcpInstanceProcesses } from "../acp/launch";
import { probeAcpAgent } from "../acp/probe";
import {
  findAcpRegistryAgent,
  loadAcpRegistry,
  scheduleAcpRegistryBackgroundRefresh,
} from "../acp/registry/catalog";
import { acpRegistryIconUrl } from "../acp/registry/schema";
import { DRIVER_CATALOG } from "../catalog";
import type { EngineProbeResult, ResolvedEngineInstance } from "../contract";
import {
  defineEngineDriver,
  LEGACY_EXTERNAL_THREAD_TRIGGERS,
  type ProbeOptions,
} from "../platform/driver";
import { buildMaintenanceEnv } from "../platform/maintenance/env";
import { getEngineNetworkSettingsStore } from "../platform/network-settings";
import { carryForwardLegacyProbe } from "./legacy-status";
import { acpRegistryAuth } from "./auth/acp-registry";

// The ACP Registry driver, kind "acp": one instance per registry agent (or
// custom ACP command) and no default instance (design acp-and-agents §3.4).
// Registry agents are third-party programs, so nothing here starts one on
// its own: startup, interval and focus probes only check the install and
// carry the last full result forward; a full probe (initialize, then one
// session for models and slash commands) runs on an explicit refresh, a
// config change, a sign-in, an install or a failed run.

/** Reasons that may start the agent for a full probe. */
const EXPLICIT_PROBE_REASONS = new Set<ProbeOptions["reason"]>([
  "auth",
  "config-change",
  "run-error",
  "update",
  "user",
]);

async function loadRuntime() {
  return await import("@/lib/ai/chat/runtime/acp-registry");
}

function iconFor(instance: ResolvedEngineInstance) {
  const config = readAcpRegistryConfig(instance.config);
  const icon = instance.config.iconUrl;
  return config.agentId && typeof icon === "string"
    ? acpRegistryIconUrl({ icon, id: config.agentId })
    : null;
}

/** Install check only: never starts the agent. */
async function probeInstall(
  instance: ResolvedEngineInstance,
  options: ProbeOptions,
): Promise<EngineProbeResult> {
  const descriptor = getAcpRegistryDescriptor(instance);
  const { binary, error } = await descriptor.resolveBinary(instance, {
    forceRefresh: options.forceRefresh,
  });
  if (!binary) {
    return {
      auth: {
        canLogin: false,
        canLogout: false,
        email: null,
        label: null,
        method: null,
        plan: null,
        status: "unknown",
      },
      install: { installed: false, path: null, source: null, version: null },
      message: error ?? `${descriptor.label} is not installed.`,
      models: [],
      status: "error",
    };
  }
  const install = {
    installed: true,
    path: binary.path,
    source: binary.source,
    version: binary.version,
  };
  const carried = carryForwardLegacyProbe(options.previous, install);
  if (carried) {
    return carried;
  }
  const catalog = await readAcpCatalog(instance.stateDir);
  return {
    auth: {
      canLogin: false,
      canLogout: false,
      email: null,
      label: null,
      method: null,
      plan: null,
      status: "unknown",
    },
    install,
    models: toAcpEngineModels(catalog?.models ?? []),
    status: "ready",
  };
}

async function probeRegistryAgent(
  instance: ResolvedEngineInstance,
  options: ProbeOptions,
): Promise<EngineProbeResult> {
  scheduleAcpRegistryBackgroundRefresh({
    enabled: async () =>
      (await getEngineNetworkSettingsStore().read()).updateChecks.enabled,
  });
  const result = EXPLICIT_PROBE_REASONS.has(options.reason)
    ? await probeAcpAgent(getAcpRegistryDescriptor(instance), instance, options)
    : await probeInstall(instance, options);

  // A full probe writes the slash commands it saw after its catalog read.
  const catalog = await readAcpCatalog(instance.stateDir);
  const iconUrl = iconFor(instance);
  return {
    ...result,
    ...(iconUrl ? { iconUrl } : {}),
    ...(catalog && catalog.commands.length > 0
      ? {
          slashCommands: catalog.commands.map((command) => ({
            ...(command.description
              ? { description: command.description }
              : {}),
            ...(command.inputHint ? { inputHint: command.inputHint } : {}),
            name: command.name,
            source: "native" as const,
          })),
        }
      : {}),
  };
}

export const acpRegistryDriver = defineEngineDriver({
  auth: acpRegistryAuth,
  capabilities: DRIVER_CATALOG.acp.capabilities,
  async dispose(instance) {
    await disposeAcpInstanceProcesses(instance.id);
  },
  fullProbeTtlMs: 10 * 60 * 1_000,
  invalidate(instance) {
    forgetAcpRegistryDescriptor(instance.id);
  },
  kind: "acp",
  maintenance: {
    install: [],
    installHint: "Install agents from the ACP Registry (Settings > Engines).",
    managedInstall: {
      description:
        "Downloads the agent's registry release (or installs its npm or uv package) into Sentinel's own tools folder.",
      label: "Install from the ACP Registry",
      async run({ instance, onProgress, signal }) {
        const config = readAcpRegistryConfig(instance.config);
        if (!config.agentId) {
          throw new Error(
            "This instance runs a custom command, not an ACP Registry agent.",
          );
        }
        // An explicit install: the index may be fetched when it is stale.
        await loadAcpRegistry({ refresh: "if-stale" });
        const agent = await findAcpRegistryAgent(config.agentId);
        if (!agent) {
          throw new Error(`${config.agentId} is not in the ACP Registry.`);
        }
        const { installAcpRegistryAgent } =
          await import("../acp/registry/install");
        await installAcpRegistryAgent(agent, {
          env: buildMaintenanceEnv(instance),
          onProgress,
          preference:
            config.distribution === "custom" ? "auto" : config.distribution,
          signal,
        });
        await disposeAcpInstanceProcesses(instance.id);
      },
    },
    packageName: () => null,
  },
  meta: DRIVER_CATALOG.acp,
  probe: probeRegistryAgent,
  // Above the probe's initialize and session/new bounds (30 s each) plus
  // the slash-command grace; the signal kills the agent when it gives up.
  probeTimeoutMs: 70_000,
  thread: {
    async run({ instance, request, thread }) {
      const runtime = await loadRuntime();
      return await runtime.runAcpRegistryThreadChat(request, thread, instance);
    },
    async stop({ instance, request, thread }) {
      const runtime = await loadRuntime();
      return await runtime.stopAcpRegistryThreadRun(request, thread, instance);
    },
    triggers: LEGACY_EXTERNAL_THREAD_TRIGGERS,
  },
});
