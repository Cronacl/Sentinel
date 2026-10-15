import "server-only";

import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import { findExecutableInPath } from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";

import { updateAcpCatalog } from "../catalog-cache";
import { catalogFromConfigOptions, readConfigOptions } from "../config-options";
import type {
  AcpAgentDescriptor,
  AcpBinaryResolution,
  AcpResolvedBinary,
} from "../descriptor";
import { getErrorMessage } from "../errors";
import { readAcpRegistryLaunch } from "../registry/install";
import { getAcpRegistryOverlay } from "../registry/overlays";
import { writeAcpRegistryProbeInfo } from "../registry/probe-info";
import { ACP_REGISTRY_AGENT_ID } from "../registry/schema";
import {
  asRecord,
  readAvailableCommands,
  readNonEmptyString,
  readRecord,
  type AcpAuthMethodInfo,
  type AcpCommandInfo,
} from "../schema";
import { getInitializeInfo, settleInbound } from "../session";

// Registry agents (driver "acp", design acp-and-agents §3.4): one descriptor
// per instance, built from its config (registry id, distribution, command
// override, sign-in method, client fs) and the agent's launch receipt
// (registry/install.ts). Launch: the command override with its arguments,
// else the installed distribution (a binary, a bin script under Node, a uv
// tool) with the registry's arguments and variables. Per-agent exceptions
// (Devin, Mistral Vibe, Gemini) come from registry/overlays.ts. A full probe
// opens one session (models from the `model` config option, slash commands
// after a short grace) and records the sign-in methods for the auth
// controller (t3code AcpRegistryProbe.ts, MIT).

export type AcpRegistryInstanceConfig = {
  agentId: string | null;
  authMethodId: string | null;
  clientFs: boolean | null;
  commandArgs: string[];
  commandPath: string | null;
  distribution: "auto" | "binary" | "custom" | "npx" | "uvx";
  name: string | null;
};

const PROBE_REQUEST_TIMEOUT_MS = 30_000;
const COMMANDS_GRACE_MS = 500;
const AUTHENTICATE_TIMEOUT_MS = 5 * 60 * 1_000;

/** The instance's registry settings, tolerant of rows from other builds. */
export function readAcpRegistryConfig(
  config: Record<string, unknown>,
): AcpRegistryInstanceConfig {
  const string = (key: string) => {
    const value = config[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const agentId = string("agentId");
  const distribution = string("distribution");
  return {
    agentId: agentId && ACP_REGISTRY_AGENT_ID.test(agentId) ? agentId : null,
    authMethodId: string("authMethodId"),
    clientFs: typeof config.clientFs === "boolean" ? config.clientFs : null,
    commandArgs: Array.isArray(config.commandArgs)
      ? config.commandArgs.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    commandPath: string("commandPath"),
    distribution:
      distribution === "binary" ||
      distribution === "npx" ||
      distribution === "uvx" ||
      distribution === "custom"
        ? distribution
        : "auto",
    name: string("agentName"),
  };
}

async function isFile(target: string) {
  return (await stat(target).catch(() => null))?.isFile() ?? false;
}

async function resolveRegistryBinary(
  instance: ResolvedEngineInstance,
  config: AcpRegistryInstanceConfig,
  label: string,
): Promise<AcpBinaryResolution> {
  const env = instance.env;
  if (config.commandPath) {
    const commandPath = path.isAbsolute(config.commandPath)
      ? config.commandPath
      : await findExecutableInPath(config.commandPath, env.PATH);
    if (!commandPath || !(await isFile(commandPath))) {
      return {
        binary: null,
        error: `${config.commandPath} was not found. Check the command on this instance.`,
      };
    }
    return {
      binary: {
        env,
        launch: { args: config.commandArgs, command: commandPath },
        path: commandPath,
        source: "config",
        version: null,
      },
      error: null,
    };
  }

  if (!config.agentId) {
    return {
      binary: null,
      error: "This instance names no ACP Registry agent or command.",
    };
  }
  const receipt = await readAcpRegistryLaunch(config.agentId);
  if (!receipt || !(await isFile(receipt.command))) {
    return {
      binary: null,
      error: `${label} is not installed. Install it from the ACP Registry in Settings > Engines.`,
    };
  }

  let launch: NonNullable<AcpResolvedBinary["launch"]>;
  if (receipt.launcher === "node") {
    // The user's node when there is one (npm built the package for it),
    // else Sentinel's own runtime as Node.
    const node = await findExecutableInPath("node", env.PATH);
    launch = node
      ? {
          args: [receipt.command, ...receipt.args],
          command: node,
          env: receipt.env,
        }
      : {
          args: [receipt.command, ...receipt.args],
          command: process.execPath,
          env: { ...receipt.env, ELECTRON_RUN_AS_NODE: "1" },
        };
  } else {
    launch = { args: receipt.args, command: receipt.command, env: receipt.env };
  }
  return {
    binary: {
      env,
      launch,
      path: receipt.command,
      source: "managed-install",
      version: receipt.version,
    },
    error: null,
  };
}

function preferredMethod(
  methods: readonly AcpAuthMethodInfo[],
  configured: string | null,
) {
  if (configured && methods.some((method) => method.id === configured)) {
    return configured;
  }
  return (
    methods.find((method) => method.kind === "agent")?.id ??
    methods[0]?.id ??
    null
  );
}

/**
 * Opens a session in the probe's scratch directory: the `model` config
 * option lists the models, and `available_commands_update` (within a short
 * grace) the slash commands. Throws the agent's auth error when signed out.
 */
function listModelsWithSession(
  stateDir: string,
): NonNullable<AcpAgentDescriptor["probe"]["listModels"]> {
  return async (process, { timeoutMs }) => {
    const init = getInitializeInfo(process);
    if (init) {
      const auth = readRecord(
        readRecord(init.raw, "agentCapabilities"),
        "auth",
      );
      await writeAcpRegistryProbeInfo(stateDir, {
        agentName: init.agentInfo.name ?? null,
        agentVersion: init.agentInfo.version ?? null,
        authMethods: init.authMethods,
        canLogout: auth?.logout != null && auth.logout !== false,
        checkedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }

    const cwd = path.join(stateDir, "probe-cwd");
    await mkdir(cwd, { mode: 0o700, recursive: true }).catch(() => undefined);
    const seen: {
      commands: AcpCommandInfo[] | null;
      sessionId: string | null;
    } = { commands: null, sessionId: null };
    const detach = process.attach({
      onSessionUpdate(envelope) {
        if (
          envelope.update.sessionUpdate === "available_commands_update" &&
          (!seen.sessionId ||
            !envelope.sessionId ||
            envelope.sessionId === seen.sessionId)
        ) {
          seen.commands = readAvailableCommands(
            envelope.update.availableCommands,
          );
        }
      },
    });
    try {
      const raw = await process.request(
        process.methods.sessionNew,
        { cwd, mcpServers: [] },
        { timeoutMs: Math.min(timeoutMs, PROBE_REQUEST_TIMEOUT_MS) },
      );
      seen.sessionId = readNonEmptyString(raw, "sessionId");
      const models = catalogFromConfigOptions(
        readConfigOptions(asRecord(raw)?.configOptions),
        { currentIsDefault: true },
      );
      await settleInbound();
      if (!seen.commands) {
        await new Promise((resolve) => setTimeout(resolve, COMMANDS_GRACE_MS));
      }
      if (seen.commands) {
        await updateAcpCatalog(stateDir, { commands: seen.commands }).catch(
          () => undefined,
        );
      }
      return models;
    } finally {
      detach();
    }
  };
}

/** A registry agent's descriptor for one instance's config. */
export function createAcpRegistryDescriptor(input: {
  config: AcpRegistryInstanceConfig;
  stateDir: string | null;
}): AcpAgentDescriptor {
  const { config } = input;
  const overlay = getAcpRegistryOverlay(config.agentId);
  const label = config.name ?? config.agentId ?? "ACP agent";

  return {
    auth: {
      loginHint: () => "Sign in from Settings > Engines.",
      methodId: (methods) => preferredMethod(methods, config.authMethodId),
      strategy: "lazy",
      timeoutMs: AUTHENTICATE_TIMEOUT_MS,
    },
    clientCapabilitiesMeta: overlay.clientCapabilitiesMeta,
    clientFs: config.clientFs ?? overlay.clientFs ?? true,
    clientTerminals: overlay.clientTerminals ?? false,
    driver: "acp",
    extNotifications: overlay.extNotifications,
    id: config.agentId ?? "acp",
    label,
    // Registry launches come from resolveBinary (binary.launch).
    launchArgs: [],
    normalizeInbound: overlay.normalizeInbound,
    permissionModes: ["default", "accept_edits", "full"],
    planMode: "native",
    probe: {
      ...(input.stateDir
        ? { listModels: listModelsWithSession(input.stateDir) }
        : {}),
      timeoutMs: PROBE_REQUEST_TIMEOUT_MS,
    },
    processLabel: label,
    async resolveBinary(instance) {
      try {
        return await resolveRegistryBinary(instance, config, label);
      } catch (error) {
        return { binary: null, error: getErrorMessage(error) };
      }
    },
    routeUnknownSessionsToRoot: overlay.routeUnknownSessionsToRoot,
    session: { prefer: "load" },
    toolPrefix: "acp_",
  };
}

const descriptors = new Map<
  string,
  { descriptor: AcpAgentDescriptor; key: string }
>();

/** The instance's descriptor, rebuilt when its config changes. */
export function getAcpRegistryDescriptor(
  instance: Pick<ResolvedEngineInstance, "config" | "id" | "stateDir">,
) {
  const config = readAcpRegistryConfig(instance.config);
  const key = JSON.stringify([config, instance.stateDir]);
  const cached = descriptors.get(instance.id);
  if (cached?.key === key) {
    return cached.descriptor;
  }
  const descriptor = createAcpRegistryDescriptor({
    config,
    stateDir: instance.stateDir,
  });
  descriptors.set(instance.id, { descriptor, key });
  return descriptor;
}

export function forgetAcpRegistryDescriptor(instanceId: string) {
  descriptors.delete(instanceId);
}
