import "server-only";

import { constants as osConstants } from "node:os";

import {
  getAgentPidRegistry,
  type AgentPidRegistry,
  type AgentShutdownSummary,
} from "./pid-registry";

// Agent processes must not outlive the server. Next's standalone server
// handles SIGTERM by awaiting server.close() before exiting, which long-lived
// SSE connections stall, and Electron SIGKILLs the server after 3 s; agents
// spawned detached (their own process group) survive both. So:
// - SIGTERM/SIGINT: signal every registered agent group synchronously,
//   before anything else gets a chance to hang;
// - process exit: SIGKILL whatever is still registered;
// - Electron main asks first, through POST /api/internal/shutdown-agents,
//   which ends agents gracefully (SIGTERM, grace period, SIGKILL).

type ShutdownProcess = Pick<NodeJS.Process, "exit" | "listenerCount" | "on">;

export type InstallShutdownHandlersOptions = {
  process?: ShutdownProcess;
  registry?: Pick<AgentPidRegistry, "killAllSync">;
};

const HANDLED_SIGNALS = ["SIGINT", "SIGTERM"] as const;

const globalForShutdown = globalThis as unknown as {
  __sentinelAgentShutdownHandlers?: WeakSet<object>;
};

function signalExitCode(signal: NodeJS.Signals) {
  const number = osConstants.signals[signal];
  return typeof number === "number" ? 128 + number : 1;
}

/**
 * Installs the signal and exit handlers once per process (also across HMR
 * module copies). Returns false when they were already installed.
 */
export function installAgentShutdownHandlers(
  options: InstallShutdownHandlersOptions = {},
): boolean {
  const target = options.process ?? process;
  globalForShutdown.__sentinelAgentShutdownHandlers ??= new WeakSet();
  if (globalForShutdown.__sentinelAgentShutdownHandlers.has(target)) {
    return false;
  }
  globalForShutdown.__sentinelAgentShutdownHandlers.add(target);

  const getRegistry = () => options.registry ?? getAgentPidRegistry();

  for (const signal of HANDLED_SIGNALS) {
    target.on(signal, () => {
      try {
        getRegistry().killAllSync("SIGTERM");
      } catch {
        // Never let cleanup keep the process from exiting.
      }

      // A listener replaces Node's default "exit on signal". When nothing
      // else (Next's server, a dev runner) handles the signal, exit the way
      // the default would have.
      if (target.listenerCount(signal) <= 1) {
        target.exit(signalExitCode(signal));
      }
    });
  }

  target.on("exit", () => {
    try {
      getRegistry().killAllSync("SIGKILL");
    } catch {
      // Exit handlers must not throw.
    }
  });

  return true;
}

/** Graceful shutdown of every agent this server started. */
export async function shutdownAgentProcesses(
  options: {
    graceMs?: number;
    registry?: Pick<AgentPidRegistry, "shutdown">;
  } = {},
): Promise<AgentShutdownSummary> {
  return await (options.registry ?? getAgentPidRegistry()).shutdown({
    graceMs: options.graceMs,
  });
}

/**
 * Startup: end agents a crashed or killed server left behind. Runs from the
 * deferred startup tasks.
 */
export async function sweepStaleAgentProcesses(
  options: { registry?: Pick<AgentPidRegistry, "sweepStale"> } = {},
) {
  return await (options.registry ?? getAgentPidRegistry()).sweepStale();
}
