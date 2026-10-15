import "server-only";

import { execFile as nodeExecFile } from "node:child_process";
import path from "node:path";

import { GROK_API_KEY_ENV, grokAcpAgent } from "../acp/agents/grok";
import { disposeAcpInstanceProcesses } from "../acp/launch";
import { probeAcpAgent } from "../acp/probe";
import { DRIVER_CATALOG } from "../catalog";
import type {
  EngineAuthSummary,
  EngineProbeResult,
  EngineSkill,
  ResolvedEngineInstance,
} from "../contract";
import {
  defineEngineDriver,
  LEGACY_EXTERNAL_THREAD_TRIGGERS,
  type ProbeOptions,
} from "../platform/driver";
import { isEngineVersionBelow } from "../platform/manifest/compatibility";
import type { ExecFileLike } from "../platform/runtime/login-shell";
import { buildSpawnInvocation } from "@/lib/runtime/process/spawn";
import {
  readGrokLogin,
  readGrokUsageLimits,
  type GrokUsageDeps,
} from "../usage/grok";
import { grokAuth } from "./auth/grok";

// Grok Build on the shared ACP engine (descriptor in acp/agents/grok.ts).
// A full probe initializes `grok agent stdio` (models from its modelState)
// and, beside it, reads the sign-in state (XAI_API_KEY, the grok.com login
// in auth.json, else `grok models`, which exits 0 either way and says so in
// its text) and the skills `grok inspect --json` lists. Cheap probes carry
// the last full result forward. Ported from t3code
// packages/provider-grok/src/server/{status.ts,skills.ts} (MIT).

const CLI_TIMEOUT_MS = 4_000;
const MINIMUM_VERSION = "1.0.13";

async function loadRuntime() {
  return await import("@/lib/ai/chat/runtime/grok");
}

export type GrokProbeDeps = GrokUsageDeps & { execFile?: ExecFileLike };

type CliOutput = { code: number | null; stderr: string; stdout: string };

function runGrokCli(
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env: Record<string, string | undefined>;
    execFile?: ExecFileLike;
  },
): Promise<CliOutput | null> {
  const invocation = buildSpawnInvocation(command, args);
  const execFile = options.execFile ?? (nodeExecFile as ExecFileLike);
  return new Promise((resolve) => {
    try {
      const child = execFile(
        invocation.command,
        invocation.args,
        {
          ...(options.cwd ? { cwd: options.cwd } : {}),
          env: options.env as NodeJS.ProcessEnv,
          timeout: CLI_TIMEOUT_MS,
          windowsHide: true,
          ...(invocation.windowsVerbatimArguments
            ? { windowsVerbatimArguments: true }
            : {}),
        },
        (error, stdout, stderr) => {
          // A non-zero exit carries its code; a spawn failure a string.
          const exitCode = (error as { code?: unknown } | null)?.code;
          const code = error
            ? typeof exitCode === "number"
              ? exitCode
              : null
            : 0;
          resolve({
            code,
            stderr: String(stderr ?? ""),
            stdout: String(stdout ?? ""),
          });
        },
      ) as { on?: (event: "error", listener: () => void) => void };
      child?.on?.("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * `grok models` login line: true, false, or null when it printed neither
 * (t3code status.ts parseGrokModelsCliOutput).
 */
export function parseGrokModelsLogin(output: string) {
  if (/you are logged in/i.test(output)) {
    return true;
  }
  return /not authenticated|not logged in/i.test(output) ? false : null;
}

/** `grok inspect --json` skills (t3code skills.ts decodeGrokInspectSkills). */
export function parseGrokInspectSkills(stdout: string): EngineSkill[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const entries = (parsed as { skills?: unknown } | null)?.skills;
  if (!Array.isArray(entries)) {
    return null;
  }
  const byName = new Map<string, EngineSkill>();
  for (const entry of entries) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const source = (record.source ?? {}) as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const skillPath = typeof source.path === "string" ? source.path.trim() : "";
    if (!name || !skillPath) {
      continue;
    }
    const scope = typeof source.type === "string" ? source.type.trim() : "";
    const description =
      typeof record.description === "string" ? record.description.trim() : "";
    byName.set(name, {
      ...(description ? { description } : {}),
      enabled: record.userInvocable !== false,
      name,
      path: skillPath,
      ...(scope ? { scope } : {}),
      ...(record.userInvocable === false ? { userInvocable: false } : {}),
    });
  }
  return [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function readGrokAuth(
  instance: ResolvedEngineInstance,
  cliPath: string,
  deps: GrokProbeDeps,
): Promise<Pick<EngineAuthSummary, "email" | "method" | "status">> {
  if (instance.env[GROK_API_KEY_ENV]?.trim()) {
    return { email: null, method: "xAI API key", status: "authenticated" };
  }
  const login = await readGrokLogin(instance.env, deps).catch(() => null);
  if (login?.status === "signed-in") {
    return {
      email: login.email,
      method: "Grok account",
      status: "authenticated",
    };
  }
  const output = await runGrokCli(cliPath, ["models"], {
    env: instance.env,
    execFile: deps.execFile,
  });
  // Only a clean exit is read: failures print help or error text.
  const loggedIn =
    output?.code === 0
      ? parseGrokModelsLogin(`${output.stdout}\n${output.stderr}`)
      : null;
  return {
    email: null,
    method: loggedIn ? "Grok account" : null,
    status:
      loggedIn === true
        ? "authenticated"
        : loggedIn === false
          ? "unauthenticated"
          : "unknown",
  };
}

async function readGrokSkills(
  instance: ResolvedEngineInstance,
  cliPath: string,
  deps: GrokProbeDeps,
) {
  const output = await runGrokCli(cliPath, ["inspect", "--json"], {
    // Not the server's cwd: project skills belong to workspaces.
    cwd: path.join(instance.stateDir, "probe-cwd"),
    env: instance.env,
    execFile: deps.execFile,
  });
  return output?.code === 0 ? parseGrokInspectSkills(output.stdout) : null;
}

/**
 * The ACP probe's result with Grok's sign-in state and skills, and an update
 * hint when an old CLI could not start the agent.
 */
export async function enrichGrokProbe(
  instance: ResolvedEngineInstance,
  result: EngineProbeResult,
  deps: GrokProbeDeps = {},
): Promise<EngineProbeResult> {
  const cliPath = result.install.path;
  if (!result.install.installed || !cliPath) {
    return result;
  }
  if (
    result.status === "error" &&
    isEngineVersionBelow("grok", result.install.version, MINIMUM_VERSION)
  ) {
    return {
      ...result,
      message: `Grok ${result.install.version} cannot run the Grok Build agent Sentinel uses (${MINIMUM_VERSION} or later). Update it with \`grok update\`.`,
    };
  }
  const [auth, skills] = await Promise.all([
    readGrokAuth(instance, cliPath, deps),
    readGrokSkills(instance, cliPath, deps),
  ]);
  const signedOut = auth.status === "unauthenticated";
  return {
    ...result,
    auth: { ...result.auth, ...auth },
    ...(signedOut && result.status === "ready"
      ? {
          message: `Grok is signed out. Run \`${path.basename(cliPath)} login\` or add an xAI API key.`,
          status: "warning" as const,
        }
      : {}),
    ...(skills ? { skills } : {}),
  };
}

export async function probeGrok(
  instance: ResolvedEngineInstance,
  options: ProbeOptions,
  deps: GrokProbeDeps = {},
) {
  const result = await probeAcpAgent(grokAcpAgent, instance, options);
  // A cheap probe that carried the last full result forward already has it.
  if (
    (options.depth === "cheap" && options.previous) ||
    options.signal.aborted
  ) {
    return result;
  }
  return await enrichGrokProbe(instance, result, deps);
}

export const grokDriver = defineEngineDriver({
  auth: grokAuth,
  capabilities: DRIVER_CATALOG.grok.capabilities,
  async dispose(instance) {
    await disposeAcpInstanceProcesses(instance.id);
  },
  // A full probe spawns `grok agent stdio` and two CLI commands: trust one
  // for 10 minutes and answer interval and focus refreshes cheaply.
  fullProbeTtlMs: 10 * 60 * 1_000,
  invalidate() {
    grokAcpAgent.invalidate?.();
  },
  kind: "grok",
  meta: DRIVER_CATALOG.grok,
  probe: (instance, options) => probeGrok(instance, options),
  // Above the 8 s initialize bound plus binary resolution; the CLI commands
  // run beside it (4 s each).
  probeTimeoutMs: 15_000,
  thread: {
    async run({ instance, request, thread }) {
      const runtime = await loadRuntime();
      return await runtime.runGrokThreadChat(request, thread, instance);
    },
    async stop({ instance, request, thread }) {
      const runtime = await loadRuntime();
      return await runtime.stopGrokThreadRun(request, thread, instance);
    },
    triggers: LEGACY_EXTERNAL_THREAD_TRIGGERS,
  },
  usageLimits: {
    async read(instance, { signal }) {
      return await readGrokUsageLimits({ env: instance.env, signal });
    },
  },
});
