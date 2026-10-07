import "server-only";

import { type ChildProcessByStdio } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import type { Readable } from "node:stream";

import {
  createOpencodeClient,
  type Agent,
  type OpencodeClient,
  type PermissionRuleset,
  type ProviderListResponse,
  type QuestionAnswer,
  type QuestionRequest,
} from "@opencode-ai/sdk/v2";

import type { EngineInstallSource } from "@/lib/ai/chat/engines/contract";
import {
  getLoginShellCandidates,
  getLoginShellMarkers,
  lookupInLoginShell,
} from "@/lib/ai/chat/engines/platform/runtime/login-shell";
import {
  findExecutableInPath,
  getConfiguredBinaryOverride,
  getInstanceProcessEnv,
  recordResolvedBinary,
  type EngineBinaryInstance,
} from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import { probeBinaryVersion } from "@/lib/ai/chat/engines/platform/runtime/version-probe";
import type { OpenCodeThreadState } from "@/lib/ai/chat/engines/types";
import {
  applyPrivateFsMode,
  getSentinelStateRoot,
} from "@/lib/runtime/local-state";
import {
  buildManagedExecutablePathValue,
  buildPreferredExecutablePathValue,
} from "@/lib/runtime/platform-paths";
import { terminateProcessTree } from "@/lib/runtime/process/kill-tree";
import { spawnManagedProcess } from "@/lib/runtime/process/spawn";
import { withTimeout } from "@/lib/runtime/process/with-timeout";

// `opencode serve` prints "opencode server listening on http://<host>:<port>"
// once it accepts connections (packages/opencode/src/cli/cmd/serve.ts; the
// text is unchanged from 1.2 through 1.18). Match the tail loosely, like
// t3code's opencodeRuntime.ts, so a log prefix cannot break startup. Polling
// GET /global/health backs this up if the line ever changes.
const OPENCODE_SERVER_READY_PATTERN = /server listening on\s+(https?:\/\/\S+)/i;
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const OPENCODE_SERVER_HOSTNAME = "127.0.0.1";
// Basic-auth user for OPENCODE_SERVER_PASSWORD; set explicitly so an inherited
// OPENCODE_SERVER_USERNAME cannot desynchronize server and client.
const OPENCODE_SERVER_USERNAME = "opencode";
const OPENCODE_HEALTH_PATH = "/global/health";
const OPENCODE_HEALTH_POLL_INTERVAL_MS = 100;
const OPENCODE_HEALTH_REQUEST_TIMEOUT_MS = 1_000;
const OPENCODE_SERVER_KILL_GRACE_MS = 2_000;
const OPENCODE_SERVER_OUTPUT_MAX_CHARS = 64 * 1024;
const OPENCODE_RUNTIME_CACHE_TTL_MS = 15_000;
const OPENCODE_STATUS_CACHE_TTL_MS = 15_000;
const OPENCODE_STATUS_QUERY_TIMEOUT_MS = 4_000;
// Default bound for a turn's server start, matching t3code's
// DEFAULT_OPENCODE_SERVER_TIMEOUT_MS (opencodeRuntime.ts). A warm start is
// ~1 s (1.3.17 measured here; 1.18 listens before it bootstraps an instance),
// but the first launch of a freshly installed ~120 MB binary can sit in
// Gatekeeper/Defender scanning for several seconds, and failing the user's
// turn there is worse than waiting.
const OPENCODE_SERVER_START_TIMEOUT_MS = 30_000;
// Status probes answer the UI within OPENCODE_STATUS_QUERY_TIMEOUT_MS either
// way; the probe itself may outlive that window on purpose so a slow cold start
// still refreshes the status snapshot in the background (the server is closed
// when the probe settles).
const OPENCODE_STATUS_PROBE_SERVER_START_TIMEOUT_MS = 10_000;
const OPENCODE_CLI_VERIFY_TIMEOUT_MS = 1_500;
const OPENCODE_STATUS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_STATE_FILE_MODE = 0o600;
const OPENCODE_STATUS_SNAPSHOT_FILE = "opencode-status.json";

// Oldest `opencode-ai` server whose protocol this adapter can drive, from the
// published @opencode-ai/sdk v2 typings per release: 1.0.224 introduced the
// `permission.asked` event, POST /permission/{requestID}/reply and the
// `permission` ruleset on session.create (with prompt_async `agent`/`variant`,
// /provider, /agent and /global/health already present). Older servers use the
// `permission.updated` protocol, which Sentinel never answers, so a run would
// hang on its first approval; they get state "error" instead. Later additions
// are optional here: questions (1.1.7) are only answered when a server asks,
// and without `message.part.delta` (1.2.0) text streams through the full-text
// `message.part.updated` events, just in coarser steps.
export const OPENCODE_MINIMUM_VERSION = "1.0.224";
// The floor t3code tests its 1.x driver against (opencodeRuntime.ts:44);
// 1.14.17/1.14.18 compiled binaries could fail at startup (fixed in 1.14.19).
// Versions between the two floors keep working with an "update recommended"
// advisory.
export const OPENCODE_RECOMMENDED_VERSION = "1.14.19";
export const OPENCODE_RECOMMENDED_RANGE = `>=${OPENCODE_RECOMMENDED_VERSION} <2.0.0`;

export type OpenCodeEngineState =
  | "auth_unavailable"
  | "error"
  | "missing_runtime"
  | "ready"
  | "timeout_no_cache"
  | "timeout_using_cache";

export type OpenCodeTraitOption = {
  isDefault?: boolean;
  label: string;
  value: string;
};

export type OpenCodeModelTraits = {
  agentOptions: OpenCodeTraitOption[];
  variantOptions: OpenCodeTraitOption[];
};

export type OpenCodeModelInfo = {
  contextWindow?: number;
  defaultReasoningEffort: null;
  description: string;
  displayName: string;
  id: string;
  inputModalities: string[];
  isDefault: boolean;
  model: string;
  openCode: OpenCodeModelTraits;
  supportedReasoningEfforts: [];
};

// Same shape as the future engine snapshot's compatibilityAdvisory
// (design/driver-contract.md) so P10 can adopt it unchanged.
export type OpenCodeCompatibilityStatus =
  "broken" | "graceful" | "supported" | "unknown" | "unsupported";

export type OpenCodeCompatibilityAdvisory = {
  message: string | null;
  recommendedRange: string | null;
  recommendedVersion: string | null;
  status: OpenCodeCompatibilityStatus;
};

export type OpenCodeEngineStatus = {
  authReady: boolean;
  availableModels: OpenCodeModelInfo[];
  cliDetected: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  compatibilityAdvisory: OpenCodeCompatibilityAdvisory | null;
  engine: "opencode";
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  state: OpenCodeEngineState;
  usedCachedStatus: boolean;
};

export type OpenCodeInventory = {
  agents: ReadonlyArray<Agent>;
  providerList: ProviderListResponse;
};

export type ParsedOpenCodeModelSlug = {
  modelID: string;
  providerID: string;
};

export type ResolvedOpenCodeRuntime = {
  cliDetected: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  env: NodeJS.ProcessEnv;
  error: string | null;
  /** How the binary was found; null when it was not. */
  source: EngineInstallSource | null;
};

export type OpenCodeServerExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

export type OpenCodeServerProcess = {
  // `Basic …` header for the per-spawn OPENCODE_SERVER_PASSWORD.
  authorization: string;
  close: () => void;
  exited: Promise<OpenCodeServerExit>;
  stderr: () => string;
  stdout: () => string;
  url: string;
  // From GET /global/health; null when the server did not answer it.
  version: string | null;
};

export type OpenCodeSession = {
  client: OpencodeClient;
  runtime: ResolvedOpenCodeRuntime;
  server: OpenCodeServerProcess;
  sessionId: string;
};

type OpenCodeStatusSnapshot = {
  availableModels: OpenCodeModelInfo[];
  cliPath: string;
  cliVersion: string | null;
  recordedAt: string;
};

// One cached resolution per instance (and per configuration of it).
const cachedRuntimes = new Map<
  string,
  { expiresAt: number; promise: Promise<ResolvedOpenCodeRuntime> }
>();

let cachedStatus: {
  expiresAt: number;
  promise: Promise<OpenCodeEngineStatus>;
} | null = null;

function getLocalStateDirectory() {
  return getSentinelStateRoot();
}

function getOpenCodeStatusSnapshotPath() {
  return path.join(getLocalStateDirectory(), OPENCODE_STATUS_SNAPSHOT_FILE);
}

const OPENCODE_NAME_OPTIONS = { strategy: "pathext-or-bare" } as const;
const OPENCODE_LOGIN_SHELL_MARKERS = getLoginShellMarkers("opencode");
// Tried in order until one reports opencode or at least its PATH.
const OPENCODE_FALLBACK_SHELLS = [
  "/bin/zsh",
  "/bin/bash",
  "/bin/sh",
  "/opt/homebrew/bin/fish",
  "/usr/local/bin/fish",
];

/** Launchable when `--version` succeeds or at least prints something. */
async function verifyOpenCodeCli(
  candidatePath: string,
  env: NodeJS.ProcessEnv,
) {
  const result = await probeBinaryVersion({
    acceptFailureOutput: true,
    command: candidatePath,
    env,
    timeoutMs: OPENCODE_CLI_VERIFY_TIMEOUT_MS,
  });
  return result.launchable
    ? { cliPath: candidatePath, cliVersion: result.version }
    : null;
}

type OpenCodeSemver = readonly [major: number, minor: number, patch: number];

// `opencode --version` prints `1.18.32` on 1.x and `opencode v2.0.18` on 2.x
// (t3code opencodeVersionProbe.ts). Snapshot builds such as
// `0.0.0-dev-202610062254` stay unknown rather than "too old".
export function parseOpenCodeSemver(
  value: string | null | undefined,
): OpenCodeSemver | null {
  const firstLine = value?.trim().split(/\r?\n/)[0] ?? "";
  for (const token of firstLine.split(/\s+/)) {
    const match = token.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    if (match) {
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
  }
  return null;
}

function compareOpenCodeSemver(left: OpenCodeSemver, right: OpenCodeSemver) {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

export function resolveOpenCodeCompatibility(
  version: string | null | undefined,
): OpenCodeCompatibilityAdvisory {
  const recommendation = {
    recommendedRange: OPENCODE_RECOMMENDED_RANGE,
    recommendedVersion: OPENCODE_RECOMMENDED_VERSION,
  };
  const parsed = parseOpenCodeSemver(version);
  if (!parsed) {
    return { ...recommendation, message: null, status: "unknown" };
  }

  const label = parsed.join(".");
  if (parsed[0] >= 2) {
    return {
      ...recommendation,
      message: `OpenCode ${label} is the 2.x generation, which Sentinel does not support yet. Install OpenCode 1.x (npm i -g opencode-ai) to use it here.`,
      status: "unsupported",
    };
  }
  if (
    compareOpenCodeSemver(
      parsed,
      parseOpenCodeSemver(OPENCODE_MINIMUM_VERSION)!,
    ) < 0
  ) {
    return {
      ...recommendation,
      message: `OpenCode ${label} is too old for Sentinel, which needs ${OPENCODE_MINIMUM_VERSION} or newer. Update it with \`opencode upgrade\`.`,
      status: "broken",
    };
  }
  if (
    compareOpenCodeSemver(
      parsed,
      parseOpenCodeSemver(OPENCODE_RECOMMENDED_VERSION)!,
    ) < 0
  ) {
    return {
      ...recommendation,
      message: `OpenCode ${label} still works with Sentinel, but ${OPENCODE_RECOMMENDED_VERSION} or newer is recommended. Update it with \`opencode upgrade\`.`,
      status: "graceful",
    };
  }
  return { ...recommendation, message: null, status: "supported" };
}

export function isOpenCodeCompatibilityUsable(
  advisory: OpenCodeCompatibilityAdvisory | null,
) {
  return advisory?.status !== "broken" && advisory?.status !== "unsupported";
}

async function writeOpenCodeStatusSnapshot(snapshot: OpenCodeStatusSnapshot) {
  const snapshotPath = getOpenCodeStatusSnapshotPath();
  const localStateDirectory = getLocalStateDirectory();

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

async function readOpenCodeStatusSnapshot(options: { cliPath: string }) {
  try {
    const rawSnapshot = await readFile(getOpenCodeStatusSnapshotPath(), "utf8");
    const parsed = JSON.parse(rawSnapshot) as Partial<OpenCodeStatusSnapshot>;

    if (
      typeof parsed.cliPath !== "string" ||
      parsed.cliPath !== options.cliPath ||
      typeof parsed.recordedAt !== "string" ||
      !Array.isArray(parsed.availableModels)
    ) {
      return null;
    }

    const recordedAt = new Date(parsed.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) return null;
    if (
      Date.now() - recordedAt.getTime() >
      OPENCODE_STATUS_SNAPSHOT_MAX_AGE_MS
    ) {
      return null;
    }

    return {
      availableModels: parsed.availableModels as OpenCodeModelInfo[],
      cliPath: parsed.cliPath,
      cliVersion:
        typeof parsed.cliVersion === "string" ? parsed.cliVersion : null,
      recordedAt: recordedAt.toISOString(),
    } satisfies OpenCodeStatusSnapshot;
  } catch {
    return null;
  }
}

function buildOpenCodeEngineStatus(input: {
  authReady: boolean;
  availableModels: OpenCodeModelInfo[];
  cliDetected: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  compatibilityAdvisory: OpenCodeCompatibilityAdvisory | null;
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  state: OpenCodeEngineState;
  usedCachedStatus: boolean;
}) {
  return {
    authReady: input.authReady,
    availableModels: input.availableModels,
    cliDetected: input.cliDetected,
    cliPath: input.cliPath,
    cliVersion: input.cliVersion,
    compatibilityAdvisory: input.compatibilityAdvisory,
    engine: "opencode" as const,
    error: input.error,
    lastSuccessfulProbeAt: input.lastSuccessfulProbeAt,
    state: input.state,
    usedCachedStatus: input.usedCachedStatus,
  } satisfies OpenCodeEngineStatus;
}

function buildCachedOpenCodeStatus(input: {
  compatibilityAdvisory: OpenCodeCompatibilityAdvisory | null;
  snapshot: OpenCodeStatusSnapshot;
}) {
  return buildOpenCodeEngineStatus({
    authReady: true,
    availableModels: input.snapshot.availableModels,
    cliDetected: true,
    cliPath: input.snapshot.cliPath,
    cliVersion: input.snapshot.cliVersion,
    compatibilityAdvisory: input.compatibilityAdvisory,
    error: null,
    lastSuccessfulProbeAt: input.snapshot.recordedAt,
    state: "ready",
    usedCachedStatus: true,
  });
}

function titleCaseSlug(value: string) {
  return value
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function inferDefaultVariant(providerID: string, variants: string[]) {
  if (variants.length === 1) return variants[0];
  if (providerID === "anthropic" || providerID.startsWith("google")) {
    return variants.includes("high") ? "high" : undefined;
  }
  if (providerID === "openai" || providerID === "opencode") {
    return variants.includes("medium")
      ? "medium"
      : variants.includes("high")
        ? "high"
        : undefined;
  }
  return undefined;
}

function inferDefaultAgent(agents: ReadonlyArray<Agent>) {
  return (
    agents.find((agent) => agent.name === "build")?.name ??
    agents[0]?.name ??
    undefined
  );
}

function openCodeCapabilitiesForModel(input: {
  agents: ReadonlyArray<Agent>;
  model: ProviderListResponse["all"][number]["models"][string];
  providerID: string;
}): OpenCodeModelTraits {
  const variantValues = Object.keys(input.model.variants ?? {});
  const defaultVariant = inferDefaultVariant(input.providerID, variantValues);
  const primaryAgents = input.agents.filter(
    (agent) =>
      !agent.hidden && (agent.mode === "primary" || agent.mode === "all"),
  );
  const defaultAgent = inferDefaultAgent(primaryAgents);

  return {
    agentOptions: primaryAgents.map((agent) => ({
      ...(defaultAgent === agent.name ? { isDefault: true } : {}),
      label: titleCaseSlug(agent.name),
      value: agent.name,
    })),
    variantOptions: variantValues.map((value) => ({
      ...(defaultVariant === value ? { isDefault: true } : {}),
      label: titleCaseSlug(value),
      value,
    })),
  };
}

export function parseOpenCodeModelSlug(
  slug: string | null | undefined,
): ParsedOpenCodeModelSlug | null {
  if (typeof slug !== "string") return null;
  const trimmed = slug.trim();
  const separator = trimmed.indexOf("/");
  if (separator <= 0 || separator === trimmed.length - 1) return null;
  return {
    modelID: trimmed.slice(separator + 1),
    providerID: trimmed.slice(0, separator),
  };
}

export function flattenOpenCodeModels(input: OpenCodeInventory) {
  const connected = new Set(input.providerList.connected);
  const models: OpenCodeModelInfo[] = [];

  for (const provider of input.providerList.all) {
    if (!connected.has(provider.id)) continue;

    for (const model of Object.values(provider.models)) {
      const name = model.name?.trim();
      if (!name) continue;

      const slug = `${provider.id}/${model.id}`;
      const subProvider = provider.name?.trim();
      models.push({
        defaultReasoningEffort: null,
        description: subProvider ? `${name} via ${subProvider}` : name,
        displayName: name,
        id: slug,
        inputModalities: ["text"],
        isDefault: slug === "openai/gpt-5",
        model: slug,
        openCode: openCodeCapabilitiesForModel({
          agents: input.agents,
          model,
          providerID: provider.id,
        }),
        supportedReasoningEfforts: [],
      });
    }
  }

  return [...models].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}

const URL_TOKEN_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

function isOpenCodeAuthErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("auth") ||
    normalized.includes("login") ||
    normalized.includes("unauth") ||
    normalized.includes("permission denied")
  );
}

// With throwOnError the 1.18 SDK wraps failures in Errors whose text can be
// "opencode server GET http://…/provider?directory=<cwd> …" (dist/
// error-interceptor.js describe()), so a workspace path such as
// /Users/x/oauth-app must not read as an auth failure. The structured cause
// ({body, status}) is checked first; URLs are dropped before the text match.
export function isOpenCodeAuthError(error: unknown) {
  const cause =
    error instanceof Error && error.cause && typeof error.cause === "object"
      ? (error.cause as { body?: unknown })
      : null;
  const body =
    cause?.body && typeof cause.body === "object"
      ? (cause.body as { name?: unknown })
      : null;
  if (body?.name === "ProviderAuthError") return true;

  const message = error instanceof Error ? error.message : String(error);
  return isOpenCodeAuthErrorMessage(message.replace(URL_TOKEN_PATTERN, ""));
}

export function resetOpenCodeRuntimeCache() {
  cachedRuntimes.clear();
}

export function resetOpenCodeEngineStatusCache() {
  cachedStatus = null;
}

export function isOpenCodeEngineAvailable(status: OpenCodeEngineStatus) {
  return status.state === "ready" || status.state === "timeout_no_cache";
}

export function buildOpenCodeThreadState(input: {
  cwd?: string | null;
  modelId?: string | null;
  selectedAgent?: string | null;
  selectedVariant?: string | null;
  sessionId: string;
}): OpenCodeThreadState {
  return {
    cwd: input.cwd ?? null,
    modelId: input.modelId ?? null,
    selectedAgent: input.selectedAgent ?? null,
    selectedVariant: input.selectedVariant ?? null,
    sessionId: input.sessionId,
  };
}

export type OpenCodeRuntimeInstance = EngineBinaryInstance;

function getRuntimeCacheKey(
  instance: OpenCodeRuntimeInstance | null | undefined,
) {
  if (!instance) {
    return "default";
  }

  return `${instance.id}:${JSON.stringify([
    instance.config.binaryPath ?? null,
    instance.envOverrides,
    instance.envUnset,
  ])}`;
}

/**
 * Resolution order: the instance's binaryPath, else (default instance)
 * SENTINEL_OPENCODE_PATH; then `opencode` in a login shell's PATH (falling
 * back to the managed PATH) or where the shell reports it. Without an
 * instance this is the default instance on process.env.
 */
async function resolveOpenCodeRuntimeUncached(
  instance: OpenCodeRuntimeInstance | null | undefined,
): Promise<ResolvedOpenCodeRuntime> {
  const baseEnv = getInstanceProcessEnv(instance);
  const preferredPathValue = buildPreferredExecutablePathValue(baseEnv.PATH, {
    env: baseEnv,
  });
  const managedPathValue = await buildManagedExecutablePathValue(
    preferredPathValue,
    { env: baseEnv },
  );
  const env = {
    ...baseEnv,
    PATH: managedPathValue,
  };
  const isDefault = !instance || instance.isDefault;
  const remember = async (
    cliPath: string,
    cliVersion: string | null,
    source: EngineInstallSource,
  ) => {
    await recordResolvedBinary(
      { path: cliPath, source, version: cliVersion },
      {
        instanceId: instance?.id ?? "opencode",
        legacyEnvKey: isDefault ? "SENTINEL_OPENCODE_PATH" : null,
      },
    );
  };

  const override = getConfiguredBinaryOverride(instance, baseEnv, [
    "SENTINEL_OPENCODE_PATH",
  ]);
  const explicitCandidate = override
    ? await verifyOpenCodeCli(override.path, env)
    : null;

  if (override && explicitCandidate?.cliPath) {
    await remember(
      explicitCandidate.cliPath,
      explicitCandidate.cliVersion,
      override.source,
    );
    return {
      cliDetected: true,
      cliPath: explicitCandidate.cliPath,
      cliVersion: explicitCandidate.cliVersion,
      env,
      error: null,
      source: override.source,
    } satisfies ResolvedOpenCodeRuntime;
  }

  const shellLookup = await lookupInLoginShell({
    command: "opencode",
    env: baseEnv,
    markers: OPENCODE_LOGIN_SHELL_MARKERS,
    shells: getLoginShellCandidates(baseEnv, OPENCODE_FALLBACK_SHELLS),
    stopWhen: "command-or-path",
  });
  const fromPath = await findExecutableInPath(
    "opencode",
    shellLookup?.pathValue ?? managedPathValue,
    OPENCODE_NAME_OPTIONS,
  );
  const candidatePath = fromPath ?? shellLookup?.commandPath ?? null;

  if (!candidatePath) {
    return {
      cliDetected: false,
      cliPath: override?.path ?? null,
      cliVersion: null,
      env,
      error: override
        ? "OpenCode CLI path is retained but is not currently launchable."
        : "OpenCode CLI (`opencode`) was not found in PATH.",
      source: null,
    } satisfies ResolvedOpenCodeRuntime;
  }

  const source: EngineInstallSource =
    fromPath && !shellLookup?.pathValue ? "managed-path" : "login-shell";
  const verified = await verifyOpenCodeCli(candidatePath, env);
  await remember(candidatePath, verified?.cliVersion ?? null, source);

  return {
    cliDetected: true,
    cliPath: candidatePath,
    cliVersion: verified?.cliVersion ?? null,
    env,
    error: null,
    source,
  } satisfies ResolvedOpenCodeRuntime;
}

export async function resolveOpenCodeRuntime(options?: {
  forceRefresh?: boolean;
  instance?: OpenCodeRuntimeInstance | null;
}): Promise<ResolvedOpenCodeRuntime> {
  const key = getRuntimeCacheKey(options?.instance);
  const cached = cachedRuntimes.get(key);
  if (!options?.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = resolveOpenCodeRuntimeUncached(options?.instance);
  cachedRuntimes.set(key, {
    expiresAt: Date.now() + OPENCODE_RUNTIME_CACHE_TTL_MS,
    promise,
  });

  return promise;
}

async function findAvailablePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, OPENCODE_SERVER_HOSTNAME, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("Unable to reserve a local OpenCode server port."));
      });
    });
  });
}

// Only complete lines count: a chunk can end mid-URL, and matching that partial
// line would hand back a truncated address.
export function parseOpenCodeServerUrl(output: string) {
  const lines = output.split(/\r?\n/);
  lines.pop();
  for (const line of lines) {
    const match = line
      .replace(ANSI_ESCAPE_PATTERN, "")
      .match(OPENCODE_SERVER_READY_PATTERN);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function buildOpenCodeServerAuthorization(password: string) {
  return `Basic ${Buffer.from(
    `${OPENCODE_SERVER_USERNAME}:${password}`,
    "utf8",
  ).toString("base64")}`;
}

// 1.x answers GET /global/health with {healthy: true, version}. A 2.x server
// (and the 1.x web UI on unknown paths) answers HTML with a 200, so only a JSON
// body counts (t3code opencodeVersionProbe.ts).
export async function fetchOpenCodeHealth(input: {
  authorization: string;
  baseUrl: string;
}): Promise<{ version: string } | null> {
  try {
    const response = await fetch(new URL(OPENCODE_HEALTH_PATH, input.baseUrl), {
      headers: {
        accept: "application/json",
        authorization: input.authorization,
      },
      signal: AbortSignal.timeout(OPENCODE_HEALTH_REQUEST_TIMEOUT_MS),
    });
    const mediaType = response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    if (response.status !== 200 || mediaType !== "application/json") {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const body = (await response.json()) as {
      healthy?: unknown;
      version?: unknown;
    } | null;
    return body?.healthy === true && typeof body.version === "string"
      ? { version: body.version }
      : null;
  } catch {
    return null;
  }
}

type OpenCodeServerChild = ChildProcessByStdio<null, Readable, Readable>;

function hasOpenCodeServerExited(child: OpenCodeServerChild) {
  return child.exitCode !== null || child.signalCode !== null;
}

// The server is a managed agent process (its own process group on POSIX,
// taskkill /T /F on Windows): SIGTERM (the npm launcher forwards it)
// escalates to SIGKILL after a grace period so a wedged server cannot outlive
// the run.
function stopOpenCodeServerChild(child: OpenCodeServerChild) {
  if (hasOpenCodeServerExited(child)) return;

  void terminateProcessTree(child, { graceMs: OPENCODE_SERVER_KILL_GRACE_MS });
}

function appendCappedOutput(current: string, chunk: string | Buffer) {
  const next = current + String(chunk);
  return next.length > OPENCODE_SERVER_OUTPUT_MAX_CHARS
    ? next.slice(-OPENCODE_SERVER_OUTPUT_MAX_CHARS)
    : next;
}

export async function startOpenCodeServerProcess(input: {
  binaryPath: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<OpenCodeServerProcess> {
  const port = await findAvailablePort();
  const baseEnv = input.env ?? process.env;
  // A fresh password per server: the server only accepts Sentinel's requests,
  // and an OPENCODE_SERVER_PASSWORD inherited from the user's shell can no
  // longer lock Sentinel's own client out with a 401.
  const password = randomBytes(24).toString("base64url");
  const authorization = buildOpenCodeServerAuthorization(password);
  const timeoutMs = input.timeoutMs ?? OPENCODE_SERVER_START_TIMEOUT_MS;
  const child = spawnManagedProcess({
    args: ["serve", `--hostname=${OPENCODE_SERVER_HOSTNAME}`, `--port=${port}`],
    command: input.binaryPath,
    cwd: input.cwd,
    env: {
      ...baseEnv,
      // Keep a caller's or the user's OPENCODE_CONFIG_CONTENT; forcing "{}"
      // clobbered it (t3code resolveOpenCodeConfigContent).
      OPENCODE_CONFIG_CONTENT: baseEnv.OPENCODE_CONFIG_CONTENT ?? "{}",
      OPENCODE_SERVER_PASSWORD: password,
      OPENCODE_SERVER_USERNAME,
    },
    // Only the given env: the caller's copy already starts from process.env.
    extendEnv: false,
    label: "opencode serve",
    stdio: ["ignore", "pipe", "pipe"],
  }) as OpenCodeServerChild;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdout = "";
  let stderr = "";
  let settled = false;
  let resolveExited!: (exit: OpenCodeServerExit) => void;
  const exited = new Promise<OpenCodeServerExit>((resolve) => {
    resolveExited = resolve;
  });
  const close = () => stopOpenCodeServerChild(child);
  const pollBaseUrl = `http://${OPENCODE_SERVER_HOSTNAME}:${port}`;

  return await new Promise<OpenCodeServerProcess>((resolve, reject) => {
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = () => {
      if (settled) return false;
      settled = true;
      clearTimeout(timeoutId);
      if (pollTimer) clearTimeout(pollTimer);
      return true;
    };

    const succeed = (url: string, version: string | null) => {
      if (!settle()) return;
      resolve({
        authorization,
        close,
        exited,
        stderr: () => stderr,
        stdout: () => stdout,
        url,
        version,
      });
    };

    const fail = (error: Error) => {
      if (!settle()) return;
      close();
      reject(error);
    };

    // Readiness is whichever comes first: the stdout line or a JSON answer
    // from /global/health on the port Sentinel picked.
    const pollHealth = async () => {
      pollTimer = null;
      const health = await fetchOpenCodeHealth({
        authorization,
        baseUrl: pollBaseUrl,
      });
      if (settled) return;
      if (health) {
        succeed(pollBaseUrl, health.version);
        return;
      }
      pollTimer = setTimeout(pollHealth, OPENCODE_HEALTH_POLL_INTERVAL_MS);
    };

    const timeoutId = setTimeout(() => {
      fail(
        new Error(
          `Timed out waiting for OpenCode server start after ${timeoutMs}ms.`,
        ),
      );
    }, timeoutMs);

    // Both pipes stay drained for the server's lifetime; a full pipe would
    // block OpenCode. Output is capped and kept only for diagnostics.
    let announcedUrl: string | null = null;
    child.stdout.on("data", (chunk: string | Buffer) => {
      stdout = appendCappedOutput(stdout, chunk);
      if (settled || announcedUrl) return;
      announcedUrl = parseOpenCodeServerUrl(stdout);
      if (!announcedUrl) return;
      const url = announcedUrl;
      // The server is up; one health call only fills in its version.
      void fetchOpenCodeHealth({ authorization, baseUrl: url }).then((health) =>
        succeed(url, health?.version ?? null),
      );
    });
    child.stderr.on("data", (chunk: string | Buffer) => {
      stderr = appendCappedOutput(stderr, chunk);
    });
    // Stays attached after startup: an unhandled "error" event would throw.
    child.on("error", (error) => {
      fail(error);
    });
    child.on("exit", (code, signal) => {
      resolveExited({ code, signal });
      fail(
        new Error(
          [
            `OpenCode server exited before startup completed`,
            code != null ? `with code ${code}` : null,
            signal ? `(${signal})` : null,
            stderr.trim() ? `stderr: ${stderr.trim()}` : null,
          ]
            .filter(Boolean)
            .join(" "),
        ),
      );
    });

    pollTimer = setTimeout(pollHealth, OPENCODE_HEALTH_POLL_INTERVAL_MS);
  });
}

export function createOpenCodeSdkClient(input: {
  authorization?: string | null;
  baseUrl: string;
  directory: string;
}) {
  return createOpencodeClient({
    baseUrl: input.baseUrl,
    directory: input.directory,
    ...(input.authorization
      ? { headers: { Authorization: input.authorization } }
      : {}),
    throwOnError: true,
  });
}

export async function loadOpenCodeInventory(client: OpencodeClient) {
  const [providerList, agents] = await Promise.all([
    client.provider.list().then((result) => result.data),
    client.app.agents().then((result) => result.data ?? []),
  ]);

  if (!providerList) {
    throw new Error("OpenCode provider list was empty.");
  }

  return { agents, providerList } satisfies OpenCodeInventory;
}

function buildIncompatibleOpenCodeStatus(input: {
  cliPath: string;
  cliVersion: string | null;
  compatibilityAdvisory: OpenCodeCompatibilityAdvisory;
}) {
  return buildOpenCodeEngineStatus({
    authReady: false,
    availableModels: [],
    cliDetected: true,
    cliPath: input.cliPath,
    cliVersion: input.cliVersion,
    compatibilityAdvisory: input.compatibilityAdvisory,
    error: input.compatibilityAdvisory.message,
    lastSuccessfulProbeAt: null,
    state: "error",
    usedCachedStatus: false,
  });
}

async function probeOpenCodeEngineStatus(
  runtime: ResolvedOpenCodeRuntime & { cliPath: string },
) {
  let server: OpenCodeServerProcess | null = null;
  let cliVersion = runtime.cliVersion;
  let compatibilityAdvisory = resolveOpenCodeCompatibility(cliVersion);

  try {
    server = await startOpenCodeServerProcess({
      binaryPath: runtime.cliPath,
      env: runtime.env,
      timeoutMs: OPENCODE_STATUS_PROBE_SERVER_START_TIMEOUT_MS,
    });
    // `--version` can time out on a cold start; the server reports it too.
    if (!cliVersion && server.version) {
      cliVersion = server.version;
      compatibilityAdvisory = resolveOpenCodeCompatibility(cliVersion);
      if (!isOpenCodeCompatibilityUsable(compatibilityAdvisory)) {
        return buildIncompatibleOpenCodeStatus({
          cliPath: runtime.cliPath,
          cliVersion,
          compatibilityAdvisory,
        });
      }
    }
    const client = createOpenCodeSdkClient({
      authorization: server.authorization,
      baseUrl: server.url,
      directory: process.cwd(),
    });
    const inventory = await loadOpenCodeInventory(client);
    const models = flattenOpenCodeModels(inventory);
    const recordedAt = new Date().toISOString();

    await writeOpenCodeStatusSnapshot({
      availableModels: models,
      cliPath: runtime.cliPath,
      cliVersion,
      recordedAt,
    }).catch(() => undefined);

    return buildOpenCodeEngineStatus({
      authReady: true,
      availableModels: models,
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion,
      compatibilityAdvisory,
      error: null,
      lastSuccessfulProbeAt: recordedAt,
      state: "ready",
      usedCachedStatus: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authError = isOpenCodeAuthError(error);
    return buildOpenCodeEngineStatus({
      authReady: !authError,
      availableModels: [],
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion,
      compatibilityAdvisory,
      error: message,
      lastSuccessfulProbeAt: null,
      state: authError ? "auth_unavailable" : "error",
      usedCachedStatus: false,
    });
  } finally {
    server?.close();
  }
}

export async function getOpenCodeEngineStatus(options?: {
  forceRefresh?: boolean;
}): Promise<OpenCodeEngineStatus> {
  if (
    !options?.forceRefresh &&
    cachedStatus &&
    cachedStatus.expiresAt > Date.now()
  ) {
    return cachedStatus.promise;
  }

  const promise = (async () => {
    const runtime = await resolveOpenCodeRuntime(options);
    if (!runtime.cliDetected || !runtime.cliPath) {
      return buildOpenCodeEngineStatus({
        authReady: false,
        availableModels: [],
        cliDetected: false,
        cliPath: null,
        cliVersion: null,
        compatibilityAdvisory: null,
        error: runtime.error,
        lastSuccessfulProbeAt: null,
        state: "missing_runtime",
        usedCachedStatus: false,
      });
    }

    // Versions this adapter cannot drive are reported without spawning a
    // server whose protocol would only fail later.
    const compatibilityAdvisory = resolveOpenCodeCompatibility(
      runtime.cliVersion,
    );
    if (!isOpenCodeCompatibilityUsable(compatibilityAdvisory)) {
      return buildIncompatibleOpenCodeStatus({
        cliPath: runtime.cliPath,
        cliVersion: runtime.cliVersion,
        compatibilityAdvisory,
      });
    }

    const status = await withTimeout(
      probeOpenCodeEngineStatus({ ...runtime, cliPath: runtime.cliPath }),
      OPENCODE_STATUS_QUERY_TIMEOUT_MS,
    );
    if (status) return status;

    const snapshot = await readOpenCodeStatusSnapshot({
      cliPath: runtime.cliPath,
    });
    if (snapshot) {
      return buildCachedOpenCodeStatus({ compatibilityAdvisory, snapshot });
    }

    return buildOpenCodeEngineStatus({
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion: runtime.cliVersion,
      compatibilityAdvisory,
      error: "OpenCode took too long to respond.",
      lastSuccessfulProbeAt: null,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    });
  })();

  cachedStatus = {
    expiresAt: Date.now() + OPENCODE_STATUS_CACHE_TTL_MS,
    promise,
  };

  return promise;
}

export function buildOpenCodePermissionRules(
  fullAccess: boolean,
): PermissionRuleset {
  if (fullAccess) {
    return [{ action: "allow", pattern: "*", permission: "*" }];
  }

  return [
    { action: "ask", pattern: "*", permission: "*" },
    { action: "ask", pattern: "*", permission: "bash" },
    { action: "ask", pattern: "*", permission: "edit" },
    { action: "ask", pattern: "*", permission: "webfetch" },
    { action: "ask", pattern: "*", permission: "websearch" },
    { action: "allow", pattern: "*", permission: "question" },
  ];
}

export function toOpenCodePermissionReply(approved: boolean) {
  return approved ? "once" : "reject";
}

export function openCodeQuestionId(
  index: number,
  question: QuestionRequest["questions"][number],
) {
  const header = question.header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
  return header.length > 0
    ? `question-${index}-${header}`
    : `question-${index}`;
}

export function toOpenCodeQuestionAnswers(
  request: QuestionRequest,
  response: string,
): Array<QuestionAnswer> {
  return request.questions.map(() => {
    const trimmed = response.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  });
}

export async function startOpenCodeSession(input: {
  cwd: string;
  fullAccess: boolean;
  title: string;
}) {
  const runtime = await resolveOpenCodeRuntime();
  if (!runtime.cliDetected || !runtime.cliPath) {
    throw new Error(runtime.error ?? "OpenCode is unavailable.");
  }
  const compatibilityAdvisory = resolveOpenCodeCompatibility(
    runtime.cliVersion,
  );
  if (!isOpenCodeCompatibilityUsable(compatibilityAdvisory)) {
    throw new Error(
      compatibilityAdvisory.message ?? "This OpenCode version is unsupported.",
    );
  }

  const server = await startOpenCodeServerProcess({
    binaryPath: runtime.cliPath,
    cwd: input.cwd,
    env: runtime.env,
  });
  const client = createOpenCodeSdkClient({
    authorization: server.authorization,
    baseUrl: server.url,
    directory: input.cwd,
  });
  let sessionId: string | undefined;
  try {
    const session = await client.session.create({
      permission: buildOpenCodePermissionRules(input.fullAccess),
      title: input.title,
    });
    sessionId = session.data?.id;
  } catch (error) {
    server.close();
    throw error;
  }

  if (!sessionId) {
    server.close();
    throw new Error("OpenCode session.create returned no session id.");
  }

  return {
    client,
    runtime,
    server,
    sessionId,
  } satisfies OpenCodeSession;
}
