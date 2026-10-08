import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  query,
  type AccountInfo,
  type Options,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { createLogger } from "@/lib/logger";
import { applyPrivateFsMode } from "@/lib/runtime/local-state";
import {
  buildManagedExecutablePathValue,
  getPlatformHomeDirectory,
} from "@/lib/runtime/platform-paths";
import { withTimeout } from "@/lib/runtime/process/with-timeout";
import type { EngineInstallSource } from "@/lib/ai/chat/engines/contract";
import { getLegacyEngineStatusFilePath } from "@/lib/ai/chat/engines/platform/paths";
import {
  getLoginShellMarkers,
  lookupInLoginShell,
  parseLoginShellLookupOutput,
} from "@/lib/ai/chat/engines/platform/runtime/login-shell";
import {
  findExecutableInPath,
  getConfiguredBinaryOverride,
  getExecutableNames,
  getInstanceProcessEnv,
  getInstanceRuntimeKey,
  isExecutableFile,
  isReadableFile,
  listWindowsWhereCandidates,
  recordResolvedBinary,
  resolveFromLoginShellLookup,
  type EngineBinaryInstance,
} from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import {
  readFirstOutputLine,
  runCommandProbe,
} from "@/lib/ai/chat/engines/platform/runtime/version-probe";
import type {
  ClaudePermissionMode,
  ClaudeThreadState,
} from "@/lib/ai/chat/engines/types";

import {
  buildClaudeCliLaunch,
  createClaudeNodeScriptSpawner,
  isClaudeNodeScript,
  resolveClaudeWindowsLauncherShim,
} from "./executable";
import { toClaudeModelInfo, type ClaudeModelInfo } from "./models";

export {
  buildClaudeCliLaunch,
  isClaudeNodeScript,
  resolveClaudeWindowsLauncherShim,
} from "./executable";
export {
  buildClaudeFallbackModels,
  resolveClaudeContextWindow,
  resolveClaudeSdkEffort,
  toClaudeModelInfo,
  type ClaudeModelInfo,
} from "./models";

const log = createLogger("ClaudeSdk");
const CLAUDE_STATUS_CACHE_TTL_MS = 15_000;
const CLAUDE_SETTING_SOURCES = ["user", "project", "local"] as const;
const CLAUDE_LOGIN_SHELL_MARKERS = getLoginShellMarkers("claude");
const CLAUDE_LEGACY_ENV_KEYS = ["SENTINEL_CLAUDE_PATH", "CLAUDE_PATH"] as const;
const CLAUDE_RUNTIME_CACHE_TTL_MS = 15_000;
const CLAUDE_BINARY_VERIFY_TIMEOUT_MS = 1_500;
const CLAUDE_STATUS_QUERY_TIMEOUT_MS = 3_000;
const CLAUDE_STATUS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_STATE_FILE_MODE = 0o600;
const CLAUDE_STATUS_SNAPSHOT_FILE = "claude-status.json";

export type ClaudeEngineState =
  | "auth_unavailable"
  | "error"
  | "missing_binary"
  | "ready"
  | "timeout_no_cache"
  | "timeout_using_cache";
type ClaudeShellLookupResult = {
  claudePath: string | null;
  pathValue: string | null;
};

export type ResolvedClaudeCodeRuntime = {
  binaryDetected: boolean;
  binaryVersion: string | null;
  env: NodeJS.ProcessEnv;
  executablePath: string | null;
  /** How the binary was found; null when it was not. */
  source: EngineInstallSource | null;
};

export type ClaudeEngineStatus = {
  account: AccountInfo | null;
  authReady: boolean;
  availableModels: ClaudeModelInfo[];
  binaryDetected: boolean;
  binaryPath: string | null;
  binaryVersion: string | null;
  engine: "claude";
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  sdkDetected: boolean;
  state: ClaudeEngineState;
  usedCachedStatus: boolean;
};

type ClaudeStatusSnapshot = {
  account: AccountInfo | null;
  availableModels: ClaudeModelInfo[];
  binaryPath: string;
  binaryVersion: string | null;
  recordedAt: string;
};

// Status caches per instance (and per configuration of it). `generation`
// invalidates a background refresh that a reset overtook.
type ClaudeStatusState = {
  backgroundRefresh: Promise<void> | null;
  cachedStatus: {
    expiresAt: number;
    promise: Promise<ClaudeEngineStatus>;
  } | null;
  generation: number;
};
const statusStates = new Map<string, ClaudeStatusState>();

// One cached resolution per instance (and per configuration of it).
const cachedRuntimes = new Map<
  string,
  { expiresAt: number; promise: Promise<ResolvedClaudeCodeRuntime> }
>();

function getStatusState(key: string) {
  let state = statusStates.get(key);
  if (!state) {
    state = { backgroundRefresh: null, cachedStatus: null, generation: 0 };
    statusStates.set(key, state);
  }
  return state;
}

function getClaudeStatusSnapshotPath(
  instance: ClaudeRuntimeInstance | null | undefined,
) {
  return getLegacyEngineStatusFilePath(CLAUDE_STATUS_SNAPSHOT_FILE, instance);
}

async function writeClaudeStatusSnapshot(
  snapshotPath: string,
  snapshot: ClaudeStatusSnapshot,
) {
  const localStateDirectory = path.dirname(snapshotPath);

  await mkdir(localStateDirectory, {
    mode: LOCAL_STATE_DIRECTORY_MODE,
    recursive: true,
  });
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), {
    encoding: "utf8",
    mode: LOCAL_STATE_FILE_MODE,
  });
  await applyPrivateFsMode(localStateDirectory, LOCAL_STATE_DIRECTORY_MODE);
  await applyPrivateFsMode(snapshotPath, LOCAL_STATE_FILE_MODE);
}

async function readClaudeStatusSnapshot(
  snapshotPath: string,
  options: { binaryPath: string },
) {
  try {
    const rawSnapshot = await readFile(snapshotPath, "utf8");
    const parsed = JSON.parse(rawSnapshot) as Partial<ClaudeStatusSnapshot>;

    if (
      typeof parsed.binaryPath !== "string" ||
      parsed.binaryPath !== options.binaryPath ||
      typeof parsed.recordedAt !== "string" ||
      !Array.isArray(parsed.availableModels)
    ) {
      return null;
    }

    const recordedAt = new Date(parsed.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) {
      return null;
    }

    if (Date.now() - recordedAt.getTime() > CLAUDE_STATUS_SNAPSHOT_MAX_AGE_MS) {
      return null;
    }

    return {
      account: (parsed.account as AccountInfo | null | undefined) ?? null,
      availableModels: parsed.availableModels as ClaudeModelInfo[],
      binaryPath: parsed.binaryPath,
      binaryVersion:
        typeof parsed.binaryVersion === "string" ? parsed.binaryVersion : null,
      recordedAt: recordedAt.toISOString(),
    } satisfies ClaudeStatusSnapshot;
  } catch {
    return null;
  }
}

/**
 * File names to look for when resolving `command` in a PATH directory. On
 * Windows only PATHEXT names can run: npm also writes an extension-less sh
 * script named `claude` next to `claude.cmd`, and picking it first would hide
 * the runnable shim (the .cmd is then followed to the package entry).
 */
export function getClaudeExecutableNames(
  command: string,
  options?: { pathExt?: string; platform?: NodeJS.Platform },
) {
  return getExecutableNames(command, { ...options, strategy: "pathext" });
}

const CLAUDE_NAME_OPTIONS = { strategy: "pathext" } as const;

async function verifyClaudeExecutable(
  candidatePath: string,
  env: NodeJS.ProcessEnv,
) {
  // The SDK cannot spawn Windows npm shims (.cmd), so follow them to the
  // package entry first; this is a no-op elsewhere.
  const executablePath = resolveClaudeWindowsLauncherShim(candidatePath);
  // Node scripts run under process.execPath, so they only need to be readable.
  const isLaunchable = isClaudeNodeScript(executablePath)
    ? await isReadableFile(executablePath)
    : await isExecutableFile(executablePath);
  if (!isLaunchable) {
    return null;
  }

  const launch = buildClaudeCliLaunch({
    args: ["--version"],
    command: executablePath,
    env,
  });
  const output = await runCommandProbe({
    args: launch.args,
    command: launch.command,
    env: launch.env as NodeJS.ProcessEnv,
    timeoutMs: CLAUDE_BINARY_VERIFY_TIMEOUT_MS,
  });
  if (output.error) {
    return null;
  }

  return {
    binaryVersion: readFirstOutputLine(output.stdout, output.stderr),
    executablePath,
  };
}

function buildClaudeEngineStatus(input: {
  account: AccountInfo | null;
  authReady: boolean;
  availableModels: ClaudeModelInfo[];
  binaryDetected: boolean;
  binaryPath: string | null;
  binaryVersion: string | null;
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  state: ClaudeEngineState;
  usedCachedStatus: boolean;
}) {
  return {
    account: input.account,
    authReady: input.authReady,
    availableModels: input.availableModels,
    binaryDetected: input.binaryDetected,
    binaryPath: input.binaryPath,
    binaryVersion: input.binaryVersion,
    engine: "claude" as const,
    error: input.error,
    lastSuccessfulProbeAt: input.lastSuccessfulProbeAt,
    sdkDetected: input.binaryDetected,
    state: input.state,
    usedCachedStatus: input.usedCachedStatus,
  } satisfies ClaudeEngineStatus;
}

function buildCachedClaudeStatus(input: {
  binaryPath: string;
  binaryVersion: string | null;
  snapshot: ClaudeStatusSnapshot;
}) {
  return buildClaudeEngineStatus({
    account: input.snapshot.account,
    authReady: input.snapshot.availableModels.length > 0,
    availableModels: input.snapshot.availableModels,
    binaryDetected: true,
    binaryPath: input.binaryPath,
    binaryVersion: input.binaryVersion,
    error: null,
    lastSuccessfulProbeAt: input.snapshot.recordedAt,
    state: "ready",
    usedCachedStatus: true,
  });
}

function isClaudeAuthErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("auth") ||
    normalizedMessage.includes("login") ||
    normalizedMessage.includes("not authenticated") ||
    normalizedMessage.includes("unauth")
  );
}

export function isClaudeEngineAvailable(status: ClaudeEngineStatus) {
  return status.state === "ready" || status.state === "timeout_no_cache";
}

export function parseClaudeShellLookupOutput(
  stdout: string,
): ClaudeShellLookupResult {
  const { commandPath, pathValue } = parseLoginShellLookupOutput(stdout, {
    commandBasenamePrefix: "claude",
    markers: CLAUDE_LOGIN_SHELL_MARKERS,
  });
  return { claudePath: commandPath, pathValue };
}

export type ClaudeRuntimeInstance = EngineBinaryInstance;

/**
 * Resolution order: the instance's binaryPath, else (default instance)
 * SENTINEL_CLAUDE_PATH or CLAUDE_PATH; then the managed PATH, `where` on
 * Windows and the login shell. Every candidate must answer `--version`.
 * Without an instance this is the default instance on process.env.
 */
async function resolveClaudeCodeRuntimeUncached(
  instance: ClaudeRuntimeInstance | null | undefined,
): Promise<ResolvedClaudeCodeRuntime> {
  const processEnv = getInstanceProcessEnv(instance);
  const homeEnv = {
    ...processEnv,
    HOME: getPlatformHomeDirectory({ env: processEnv }),
  };
  const preferredPath = await buildManagedExecutablePathValue(processEnv.PATH, {
    env: processEnv,
  });
  const baseEnv = { ...homeEnv, PATH: preferredPath };
  const isDefault = !instance || instance.isDefault;

  const accept = async (
    candidatePath: string | null,
    env: NodeJS.ProcessEnv,
    source: EngineInstallSource,
  ): Promise<ResolvedClaudeCodeRuntime | null> => {
    const verified = candidatePath
      ? await verifyClaudeExecutable(candidatePath, env)
      : null;
    if (!verified) {
      return null;
    }

    await recordResolvedBinary(
      {
        path: verified.executablePath,
        source,
        version: verified.binaryVersion,
      },
      {
        instanceId: instance?.id ?? "claude",
        legacyEnvKey: isDefault ? "SENTINEL_CLAUDE_PATH" : null,
      },
    );
    return {
      binaryDetected: true,
      binaryVersion: verified.binaryVersion,
      env,
      executablePath: verified.executablePath,
      source,
    };
  };

  const override = getConfiguredBinaryOverride(
    instance,
    processEnv,
    CLAUDE_LEGACY_ENV_KEYS,
  );
  const fromOverride = override
    ? await accept(override.path, baseEnv, override.source)
    : null;
  if (fromOverride) {
    return fromOverride;
  }

  const fromPath = await accept(
    await findExecutableInPath("claude", preferredPath, CLAUDE_NAME_OPTIONS),
    baseEnv,
    "managed-path",
  );
  if (fromPath) {
    return fromPath;
  }

  for (const candidate of await listWindowsWhereCandidates("claude", {
    env: processEnv,
  })) {
    const fromWhere = await accept(candidate, homeEnv, "login-shell");
    if (fromWhere) {
      return fromWhere;
    }
  }

  const fromShell = await resolveFromLoginShellLookup(
    await lookupInLoginShell({
      command: "claude",
      commandBasenamePrefix: "claude",
      env: processEnv,
      markers: CLAUDE_LOGIN_SHELL_MARKERS,
    }),
    {
      ...CLAUDE_NAME_OPTIONS,
      accept: async (candidatePath, env) => {
        const runtime = await accept(
          candidatePath,
          env as NodeJS.ProcessEnv,
          "login-shell",
        );
        return runtime
          ? {
              env: runtime.env,
              path: runtime.executablePath!,
              source: "login-shell",
              version: runtime.binaryVersion,
            }
          : null;
      },
      baseEnv: homeEnv,
      command: "claude",
    },
  );
  if (fromShell) {
    return {
      binaryDetected: true,
      binaryVersion: fromShell.version,
      env: fromShell.env as NodeJS.ProcessEnv,
      executablePath: fromShell.path,
      source: "login-shell",
    };
  }

  return {
    binaryDetected: false,
    binaryVersion: null,
    env: homeEnv,
    executablePath: null,
    source: null,
  };
}

export async function resolveClaudeCodeRuntime(options?: {
  forceRefresh?: boolean;
  instance?: ClaudeRuntimeInstance | null;
}) {
  const key = getInstanceRuntimeKey(options?.instance);
  const now = Date.now();
  const cached = cachedRuntimes.get(key);

  if (!options?.forceRefresh && cached && cached.expiresAt > now) {
    return await cached.promise;
  }

  const promise = resolveClaudeCodeRuntimeUncached(options?.instance);
  cachedRuntimes.set(key, {
    expiresAt: now + CLAUDE_RUNTIME_CACHE_TTL_MS,
    promise,
  });

  return await promise;
}

export function resetClaudeCodeRuntimeCache() {
  cachedRuntimes.clear();
}

export function resetClaudeEngineStatusCache() {
  for (const state of statusStates.values()) {
    state.cachedStatus = null;
    state.backgroundRefresh = null;
    state.generation += 1;
  }
}

/**
 * Forgets an instance's last-known-good status: the in-memory caches and the
 * on-disk snapshot. A probe answers an empty model list or a failure (how a
 * signed-out Claude Code looks) from that snapshot for up to 7 days, so after
 * a sign-in or sign-out the next probe must report what Claude Code says now.
 */
export async function forgetClaudeEngineStatus(
  instance?: ClaudeRuntimeInstance | null,
) {
  const state = statusStates.get(getInstanceRuntimeKey(instance));
  if (state) {
    state.cachedStatus = null;
    state.backgroundRefresh = null;
    state.generation += 1;
  }
  await rm(getClaudeStatusSnapshotPath(instance), { force: true });
}

/**
 * Task* tools are off by default on Opus 4.8, Sonnet 5 and newer since Agent
 * SDK 0.3.233/0.3.268. Naming them in `allowedTools` keeps them registered on
 * top of the `claude_code` preset (an explicit `tools` list would freeze the
 * surface at today's tool names) and pre-approves them, which is safe because
 * they only touch the session's own task list.
 *
 * Grep/Glob are deliberately not named: `allowedTools` approves without
 * asking, so Claude Code would skip canUseTool for searches outside the
 * workspace. Native builds search through Bash `find`/`grep` instead (Agent
 * SDK 0.3.162), which keeps Bash's sandbox and approval rules; Node-script
 * (cli.js) builds keep Grep/Glob as preset tools that go through canUseTool.
 */
export const CLAUDE_SDK_TASK_TOOLS = [
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskUpdate",
] as const;

/**
 * `options.env` replaces the CLI's environment since Agent SDK 0.2.113, so
 * always start from process.env and layer the runtime env on top.
 */
export function buildClaudeSdkEnv(
  env?: Options["env"],
): NonNullable<Options["env"]> {
  const mergedEnv = { ...process.env, ...env };

  return {
    ...mergedEnv,
    CLAUDE_AGENT_SDK_CLIENT_APP:
      mergedEnv.CLAUDE_AGENT_SDK_CLIENT_APP ?? "sentinel",
  };
}

export function buildClaudeSdkBaseOptions(options?: Partial<Options>): Options {
  const executablePath = options?.pathToClaudeCodeExecutable;
  // Native binaries are spawned by the SDK itself; only Node-script CLIs (npm
  // shims, cli.js) need Sentinel's launcher.
  const nodeScriptSpawner =
    !options?.spawnClaudeCodeProcess &&
    executablePath &&
    isClaudeNodeScript(executablePath)
      ? createClaudeNodeScriptSpawner({ onStderr: options?.stderr })
      : null;

  return {
    ...options,
    allowedTools: [
      ...new Set([...CLAUDE_SDK_TASK_TOOLS, ...(options?.allowedTools ?? [])]),
    ],
    cwd: options?.cwd ?? process.cwd(),
    env: buildClaudeSdkEnv(options?.env),
    // Omitted, the CLI follows the settings `defaultMode` (possibly `auto`)
    // since Agent SDK 0.3.286; Sentinel always chooses the mode itself.
    permissionMode: options?.permissionMode ?? "default",
    ...(nodeScriptSpawner ? { spawnClaudeCodeProcess: nodeScriptSpawner } : {}),
    persistSession: options?.persistSession ?? true,
    settingSources: options?.settingSources ?? [...CLAUDE_SETTING_SOURCES],
    systemPrompt: options?.systemPrompt ?? {
      type: "preset",
      preset: "claude_code",
    },
    tools: options?.tools ?? { type: "preset", preset: "claude_code" },
  };
}

/**
 * A prompt stream that never yields: the status probe only needs the CLI's
 * initialize response, and must never send a turn to the API.
 */
function createIdleClaudePrompt(
  signal: AbortSignal,
): AsyncIterable<SDKUserMessage> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
            const finish = () => resolve({ done: true, value: undefined });
            if (signal.aborted) {
              finish();
              return;
            }
            signal.addEventListener("abort", finish, { once: true });
          }),
        return: () => Promise.resolve({ done: true, value: undefined }),
      };
    },
  };
}

/**
 * Models from the last successful status probe of this binary, without
 * probing. Null when no snapshot exists yet.
 */
export async function getCachedClaudeModels(
  executablePath: string | null | undefined,
  instance?: ClaudeRuntimeInstance | null,
) {
  if (!executablePath) {
    return null;
  }

  const snapshot = await readClaudeStatusSnapshot(
    getClaudeStatusSnapshotPath(instance),
    { binaryPath: executablePath },
  );
  return snapshot?.availableModels ?? null;
}

async function readClaudeStatus(options: {
  forceRefreshRuntime?: boolean;
  instance?: ClaudeRuntimeInstance | null;
  state: ClaudeStatusState;
}): Promise<ClaudeEngineStatus> {
  const { instance, state } = options;
  const runtime = await resolveClaudeCodeRuntime({
    forceRefresh: options.forceRefreshRuntime,
    instance,
  });
  if (!runtime.binaryDetected || !runtime.executablePath) {
    const retainedPath =
      getConfiguredBinaryOverride(instance, getInstanceProcessEnv(instance), [
        "SENTINEL_CLAUDE_PATH",
      ])?.path ?? null;
    return buildClaudeEngineStatus({
      account: null,
      authReady: false,
      availableModels: [],
      binaryDetected: false,
      binaryPath: retainedPath,
      binaryVersion: null,
      error: retainedPath
        ? "Claude Code path is retained but is not currently launchable."
        : "Claude Code is not installed or not available on PATH.",
      lastSuccessfulProbeAt: null,
      state: "missing_binary",
      usedCachedStatus: false,
    });
  }

  const snapshotPath = getClaudeStatusSnapshotPath(instance);
  const snapshot = await readClaudeStatusSnapshot(snapshotPath, {
    binaryPath: runtime.executablePath,
  });

  if (!options.forceRefreshRuntime && snapshot) {
    if (!state.backgroundRefresh) {
      const refreshGeneration = state.generation;
      const refreshPromise = probeClaudeStatus({
        fallbackSnapshot: snapshot,
        runtime,
        snapshotPath,
      })
        .then((status) => {
          if (
            refreshGeneration === state.generation &&
            !status.usedCachedStatus &&
            status.state === "ready"
          ) {
            state.cachedStatus = {
              expiresAt: Date.now() + CLAUDE_STATUS_CACHE_TTL_MS,
              promise: Promise.resolve(status),
            };
          }
        })
        .finally(() => {
          if (
            refreshGeneration === state.generation &&
            state.backgroundRefresh === refreshPromise
          ) {
            state.backgroundRefresh = null;
          }
        });
      state.backgroundRefresh = refreshPromise;
    }

    return buildCachedClaudeStatus({
      binaryPath: runtime.executablePath,
      binaryVersion: runtime.binaryVersion,
      snapshot,
    });
  }

  return await probeClaudeStatus({
    fallbackSnapshot: snapshot,
    runtime,
    snapshotPath,
  });
}

async function probeClaudeStatus(input: {
  fallbackSnapshot: ClaudeStatusSnapshot | null;
  runtime: ResolvedClaudeCodeRuntime;
  snapshotPath: string;
}): Promise<ClaudeEngineStatus> {
  let claudeQuery: ReturnType<typeof query> | null = null;
  // Ends the idle prompt stream once the probe is done.
  const promptAbortController = new AbortController();

  try {
    claudeQuery = query({
      prompt: createIdleClaudePrompt(promptAbortController.signal),
      options: buildClaudeSdkBaseOptions({
        cwd: process.cwd(),
        // The probe runs on every status refresh: keep it from connecting
        // MCP servers or IDEs, or running the user's hooks (t3code
        // ClaudeProvider.ts buildClaudeCapabilitiesProbeQueryOptions, MIT).
        env: {
          ...input.runtime.env,
          CLAUDE_CODE_AUTO_CONNECT_IDE: "0",
          CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL: "1",
          ENABLE_CLAUDEAI_MCP_SERVERS: "false",
        },
        includePartialMessages: false,
        maxTurns: 1,
        mcpServers: {},
        pathToClaudeCodeExecutable: input.runtime.executablePath ?? undefined,
        persistSession: false,
        settings: { disableAllHooks: true },
        stderr: () => {},
        strictMcpConfig: true,
      }),
    });

    // A failure counts as no answer, like a timeout; `finally` closes the
    // query either way.
    const initialization = await withTimeout(
      claudeQuery.initializationResult(),
      CLAUDE_STATUS_QUERY_TIMEOUT_MS,
      { nullOnError: true },
    );

    if (!initialization) {
      if (input.fallbackSnapshot) {
        return buildCachedClaudeStatus({
          binaryPath: input.runtime.executablePath!,
          binaryVersion: input.runtime.binaryVersion,
          snapshot: input.fallbackSnapshot,
        });
      }

      return buildClaudeEngineStatus({
        account: null,
        authReady: false,
        availableModels: [],
        binaryDetected: true,
        binaryPath: input.runtime.executablePath,
        binaryVersion: input.runtime.binaryVersion,
        error: "Timed out while querying Claude Code runtime.",
        lastSuccessfulProbeAt: null,
        state: "timeout_no_cache",
        usedCachedStatus: false,
      });
    }

    const models = initialization.models ?? [];
    const account = initialization.account ?? null;
    if (models.length === 0) {
      if (input.fallbackSnapshot) {
        return buildCachedClaudeStatus({
          binaryPath: input.runtime.executablePath!,
          binaryVersion: input.runtime.binaryVersion,
          snapshot: input.fallbackSnapshot,
        });
      }

      return buildClaudeEngineStatus({
        account,
        authReady: false,
        availableModels: [],
        binaryDetected: true,
        binaryPath: input.runtime.executablePath,
        binaryVersion: input.runtime.binaryVersion,
        error: "Claude Code is not authenticated.",
        lastSuccessfulProbeAt: null,
        state: "auth_unavailable",
        usedCachedStatus: false,
      });
    }

    const availableModels = models.map(toClaudeModelInfo);
    const recordedAt = new Date().toISOString();
    await writeClaudeStatusSnapshot(input.snapshotPath, {
      account,
      availableModels,
      binaryPath: input.runtime.executablePath!,
      binaryVersion: input.runtime.binaryVersion,
      recordedAt,
    });

    return buildClaudeEngineStatus({
      account,
      authReady: true,
      availableModels,
      binaryDetected: true,
      binaryPath: input.runtime.executablePath,
      binaryVersion: input.runtime.binaryVersion,
      error: null,
      lastSuccessfulProbeAt: recordedAt,
      state: "ready",
      usedCachedStatus: false,
    });
  } catch (error) {
    log.warn("status_probe_failed", { error });
    const message =
      error instanceof Error
        ? error.message
        : "Claude Code is unavailable in this Sentinel runtime.";

    if (input.fallbackSnapshot) {
      return buildCachedClaudeStatus({
        binaryPath: input.runtime.executablePath!,
        binaryVersion: input.runtime.binaryVersion,
        snapshot: input.fallbackSnapshot,
      });
    }

    return buildClaudeEngineStatus({
      account: null,
      authReady: false,
      availableModels: [],
      binaryDetected: input.runtime.binaryDetected,
      binaryPath: input.runtime.executablePath,
      binaryVersion: input.runtime.binaryVersion,
      error: message,
      lastSuccessfulProbeAt: null,
      state: isClaudeAuthErrorMessage(message) ? "auth_unavailable" : "error",
      usedCachedStatus: false,
    });
  } finally {
    claudeQuery?.close();
    promptAbortController.abort();
  }
}

export async function getClaudeEngineStatus(options?: {
  forceRefresh?: boolean;
  instance?: ClaudeRuntimeInstance | null;
}) {
  const forceRefresh = options?.forceRefresh ?? false;
  const now = Date.now();
  const state = getStatusState(getInstanceRuntimeKey(options?.instance));

  if (
    !forceRefresh &&
    state.cachedStatus &&
    state.cachedStatus.expiresAt > now
  ) {
    return await state.cachedStatus.promise;
  }

  if (forceRefresh) {
    resetClaudeCodeRuntimeCache();
  }

  const pending = readClaudeStatus({
    forceRefreshRuntime: forceRefresh,
    instance: options?.instance,
    state,
  });
  state.cachedStatus = {
    expiresAt: now + CLAUDE_STATUS_CACHE_TTL_MS,
    promise: pending,
  };

  return await pending;
}

export function buildClaudeThreadState(input: {
  cwd: string | null;
  modelId: string | null;
  permissionMode: ClaudePermissionMode;
  sessionId: string;
}): ClaudeThreadState {
  return {
    cwd: input.cwd,
    modelId: input.modelId,
    permissionMode: input.permissionMode,
    sessionId: input.sessionId,
  };
}
