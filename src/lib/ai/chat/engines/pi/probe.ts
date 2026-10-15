import "server-only";

import { mkdir } from "node:fs/promises";
import path from "node:path";

import type {
  EngineAuthSummary,
  EngineProbeResult,
  ResolvedEngineInstance,
} from "../contract";
import { carryForwardLegacyProbe } from "../drivers/legacy-status";
import type { ProbeOptions } from "../platform/driver";

import { resolvePiBinary } from "./binary";
import { readPiCommands } from "./commands";
import { buildPiLaunch, startPiProcess } from "./launch";
import { readPiModels, toPiEngineModels } from "./models";

// Pi's status (design §4; t3code packages/provider-pi/src/server/status.ts,
// MIT). Cheap: resolve `pi` and its version, carrying the last full result
// forward while the binary is unchanged. Full: an ephemeral
// `pi --mode rpc --no-session` in a scratch directory under the instance's
// state dir runs get_available_models, get_state and get_commands, bounded
// by PI_PROBE_TIMEOUT_MS, and is killed when done or aborted. Pi counts as
// signed in once it lists a model (it lists only providers with
// credentials). Never throws.

export const PI_PROBE_TIMEOUT_MS = 8_000;

export const PI_LOGIN_HINT =
  "Run `pi` in a terminal and use /login, or set a provider API key (for example ANTHROPIC_API_KEY) on this instance.";

const UNKNOWN_AUTH: EngineAuthSummary = {
  canLogin: false,
  canLogout: false,
  email: null,
  label: null,
  method: null,
  plan: null,
  status: "unknown",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function probePiEngine(
  instance: ResolvedEngineInstance,
  options: ProbeOptions,
  deps: { timeoutMs?: number } = {},
): Promise<EngineProbeResult> {
  const resolution = await resolvePiBinary(instance, {
    forceRefresh: options.forceRefresh,
  });
  const binary = resolution.binary;
  if (!binary) {
    return {
      auth: UNKNOWN_AUTH,
      install: { installed: false, path: null, source: null, version: null },
      message: resolution.error,
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
  if (options.depth === "cheap") {
    const carried = carryForwardLegacyProbe(options.previous, install);
    if (carried) {
      return carried;
    }
  }
  if (options.signal.aborted) {
    return {
      auth: UNKNOWN_AUTH,
      install,
      message: "Pi status check was cancelled.",
      models: [],
      stale: true,
      status: "error",
    };
  }

  const cwd = path.join(instance.stateDir, "probe-cwd");
  let launch;
  try {
    await mkdir(cwd, { mode: 0o700, recursive: true });
    launch = buildPiLaunch({ binary, cwd, ephemeral: true, instance });
  } catch (error) {
    return {
      auth: UNKNOWN_AUTH,
      install,
      message: errorMessage(error),
      models: [],
      status: "error",
    };
  }

  const process = startPiProcess(launch, { instanceId: instance.id });
  const stop = () => void process.dispose();
  options.signal.addEventListener("abort", stop, { once: true });
  const request = {
    signal: options.signal,
    timeoutMs: deps.timeoutMs ?? PI_PROBE_TIMEOUT_MS,
  };

  try {
    const [modelsData, stateData, commandsData] = await Promise.all([
      process.request("get_available_models", {}, request),
      process.request("get_state", {}, request).catch(() => null),
      process.request("get_commands", {}, request).catch(() => null),
    ]);
    const listed = readPiModels(modelsData);
    const current =
      stateData && typeof stateData === "object"
        ? (stateData as Record<string, unknown>).model
        : null;
    const thinkingLevel =
      stateData && typeof stateData === "object"
        ? (stateData as Record<string, unknown>).thinkingLevel
        : null;
    const commands = readPiCommands(commandsData);
    const signedIn = listed.length > 0;
    return {
      auth: {
        ...UNKNOWN_AUTH,
        method: "Pi login",
        status: signedIn ? "authenticated" : "unauthenticated",
      },
      defaultModelId: signedIn ? "default" : null,
      install,
      ...(signedIn
        ? {}
        : { message: `Pi has no model with credentials. ${PI_LOGIN_HINT}` }),
      models: toPiEngineModels({ current, models: listed, thinkingLevel }),
      skills: commands.skills,
      slashCommands: commands.slashCommands,
      status: signedIn ? "ready" : "warning",
    };
  } catch (error) {
    return {
      auth: UNKNOWN_AUTH,
      install,
      message: options.signal.aborted
        ? "Pi took too long to answer."
        : `Pi failed to start: ${errorMessage(process.exitError() ?? error)}`,
      models: [],
      stale: options.signal.aborted,
      status: "error",
    };
  } finally {
    options.signal.removeEventListener("abort", stop);
    await process.dispose();
  }
}
