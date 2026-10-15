import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createOpencodeClient,
  type Agent,
  type OpencodeClient,
  type ProviderListResponse,
} from "@opencode-ai/sdk/v2";

import type { EngineInstallSource } from "@/lib/ai/chat/engines/contract";
import { getLegacyEngineStatusFilePath } from "@/lib/ai/chat/engines/platform/paths";
import {
  getLoginShellCandidates,
  getLoginShellMarkers,
  lookupInLoginShell,
} from "@/lib/ai/chat/engines/platform/runtime/login-shell";
import {
  findExecutableInPath,
  getConfiguredBinaryOverride,
  getInstanceProcessEnv,
  getInstanceRuntimeKey,
  recordResolvedBinary,
  type EngineBinaryInstance,
} from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import { probeBinaryVersion } from "@/lib/ai/chat/engines/platform/runtime/version-probe";
import type { OpenCodeThreadState } from "@/lib/ai/chat/engines/types";
import { applyPrivateFsMode } from "@/lib/runtime/local-state";
import {
  buildManagedExecutablePathValue,
  buildPreferredExecutablePathValue,
} from "@/lib/runtime/platform-paths";
import { withTimeout } from "@/lib/runtime/process/with-timeout";

import {
  startOpenCodeServerProcess,
  type OpenCodeServerProcess,
} from "./server";
import { peekOpenCodeServer } from "./server-pool";
import {
  openOpenCodeSession,
  type OpenCodeModelRef,
  type OpenCodeTurnSession,
} from "./session";
import { createOpenCode2Client, type OpenCode2Client } from "./v2/client";
import {
  classifyOpenCodeVersion,
  compareOpenCodeSemver,
  parseOpenCodeSemver,
  type OpenCodeGeneration,
} from "./version";

export * from "./server";
export * from "./server-pool";
export * from "./session";
export {
  classifyOpenCodeVersion,
  parseOpenCodeSemver,
  probeOpenCodeServer,
  type OpenCodeGeneration,
} from "./version";
export type * from "./events";
export { resolveOpenCodeSessionError } from "./v1/events";

const OPENCODE_RUNTIME_CACHE_TTL_MS = 15_000;
const OPENCODE_STATUS_CACHE_TTL_MS = 15_000;
const OPENCODE_STATUS_QUERY_TIMEOUT_MS = 4_000;
// Status probes answer the UI within OPENCODE_STATUS_QUERY_TIMEOUT_MS either
// way; the probe itself may outlive that window on purpose so a slow cold start
// still refreshes the status snapshot in the background (the server is closed
// when the probe settles). OPENCODE_STATUS_PROBE_DEADLINE_MS bounds that
// background work: past it the probe is aborted and its server killed, even
// when a request to it hangs.
const OPENCODE_STATUS_PROBE_SERVER_START_TIMEOUT_MS = 10_000;
const OPENCODE_STATUS_PROBE_DEADLINE_MS = 20_000;
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
// The 2.x release t3code's OpenCode 2 adapter was recorded against; the
// `/api/*` protocol of earlier 2.x builds may differ, so they keep working
// with an "update recommended" advisory.
export const OPENCODE2_RECOMMENDED_VERSION = "2.0.18";
export const OPENCODE2_RECOMMENDED_RANGE = `>=${OPENCODE2_RECOMMENDED_VERSION}`;

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

export type OpenCodeCommandInfo = { description?: string; name: string };

export type OpenCodeEngineStatus = {
  authReady: boolean;
  availableModels: OpenCodeModelInfo[];
  /** The server's commands (`/name` in the composer). */
  commands?: OpenCodeCommandInfo[];
  cliDetected: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  compatibilityAdvisory: OpenCodeCompatibilityAdvisory | null;
  engine: "opencode";
  error: string | null;
  /** Server generation, from `--version` or the server itself. */
  generation?: OpenCodeGeneration | null;
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

type OpenCodeStatusSnapshot = {
  availableModels: OpenCodeModelInfo[];
  cliPath: string;
  commands?: OpenCodeCommandInfo[];
  cliVersion: string | null;
  recordedAt: string;
};

// One cached resolution per instance (and per configuration of it).
const cachedRuntimes = new Map<
  string,
  { expiresAt: number; promise: Promise<ResolvedOpenCodeRuntime> }
>();

// One cached status per instance (and per configuration of it).
const cachedStatuses = new Map<
  string,
  { expiresAt: number; promise: Promise<OpenCodeEngineStatus> }
>();

function getOpenCodeStatusSnapshotPath(
  instance: OpenCodeRuntimeInstance | null | undefined,
) {
  return getLegacyEngineStatusFilePath(OPENCODE_STATUS_SNAPSHOT_FILE, instance);
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

// `--version` results by binary path, kept while the file's mtime and size
// hold (design §5): the generation only changes when the binary does.
const verifiedClis = new Map<
  string,
  { key: string; result: { cliPath: string; cliVersion: string | null } }
>();

/** Launchable when `--version` succeeds or at least prints something. */
async function verifyOpenCodeCli(
  candidatePath: string,
  env: NodeJS.ProcessEnv,
) {
  const stats = await stat(candidatePath).catch(() => null);
  const key = stats ? `${stats.mtimeMs}:${stats.size}` : null;
  const cached = verifiedClis.get(candidatePath);
  if (key && cached?.key === key) {
    return cached.result;
  }
  const probed = await probeBinaryVersion({
    acceptFailureOutput: true,
    command: candidatePath,
    env,
    timeoutMs: OPENCODE_CLI_VERIFY_TIMEOUT_MS,
  });
  if (!probed.launchable) {
    verifiedClis.delete(candidatePath);
    return null;
  }
  const result = { cliPath: candidatePath, cliVersion: probed.version };
  // A timed-out probe (no version) is retried next time.
  if (key && probed.version) {
    verifiedClis.set(candidatePath, { key, result });
  }
  return result;
}

/** The generation `--version` (or the server) reported, null when unknown. */
export function getOpenCodeGeneration(version: string | null | undefined) {
  return classifyOpenCodeVersion(version)?.generation ?? null;
}

export function resolveOpenCodeCompatibility(
  version: string | null | undefined,
): OpenCodeCompatibilityAdvisory {
  const parsed = parseOpenCodeSemver(version);
  if (!parsed) {
    return {
      message: null,
      recommendedRange: OPENCODE_RECOMMENDED_RANGE,
      recommendedVersion: OPENCODE_RECOMMENDED_VERSION,
      status: "unknown",
    };
  }

  const label = parsed.join(".");
  // Each generation is updated within itself (`opencode upgrade`); 1.x is
  // never pointed at 2.x, nor the other way round.
  if (parsed[0] >= 2) {
    const recommendation = {
      recommendedRange: OPENCODE2_RECOMMENDED_RANGE,
      recommendedVersion: OPENCODE2_RECOMMENDED_VERSION,
    };
    if (
      compareOpenCodeSemver(
        parsed,
        parseOpenCodeSemver(OPENCODE2_RECOMMENDED_VERSION)!,
      ) < 0
    ) {
      return {
        ...recommendation,
        message: `OpenCode ${label} works with Sentinel, but ${OPENCODE2_RECOMMENDED_VERSION} or newer is recommended. Update it with \`opencode upgrade\`.`,
        status: "graceful",
      };
    }
    return { ...recommendation, message: null, status: "supported" };
  }

  const recommendation = {
    recommendedRange: OPENCODE_RECOMMENDED_RANGE,
    recommendedVersion: OPENCODE_RECOMMENDED_VERSION,
  };
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

async function writeOpenCodeStatusSnapshot(
  snapshotPath: string,
  snapshot: OpenCodeStatusSnapshot,
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

async function readOpenCodeStatusSnapshot(
  snapshotPath: string,
  options: { cliPath: string },
) {
  try {
    const rawSnapshot = await readFile(snapshotPath, "utf8");
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
      ...(Array.isArray(parsed.commands) ? { commands: parsed.commands } : {}),
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
  commands?: OpenCodeCommandInfo[];
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
    commands: input.commands ?? [],
    compatibilityAdvisory: input.compatibilityAdvisory,
    engine: "opencode" as const,
    error: input.error,
    generation: getOpenCodeGeneration(input.cliVersion),
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
    commands: input.snapshot.commands ?? [],
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

type OpenCodeAgentEntry = Pick<Agent, "hidden" | "mode" | "name">;

function inferDefaultAgent(agents: ReadonlyArray<OpenCodeAgentEntry>) {
  return (
    agents.find((agent) => agent.name === "build")?.name ??
    agents[0]?.name ??
    undefined
  );
}

function openCodeCapabilitiesForModel(input: {
  agents: ReadonlyArray<OpenCodeAgentEntry>;
  providerID: string;
  variants: string[];
}): OpenCodeModelTraits {
  const defaultVariant = inferDefaultVariant(input.providerID, input.variants);
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
    variantOptions: input.variants.map((value) => ({
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
        inputModalities: model.capabilities?.input?.image
          ? ["text", "image"]
          : ["text"],
        isDefault: slug === "openai/gpt-5",
        model: slug,
        openCode: openCodeCapabilitiesForModel({
          agents: input.agents,
          providerID: provider.id,
          variants: Object.keys(model.variants ?? {}),
        }),
        supportedReasoningEfforts: [],
      });
    }
  }

  return [...models].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}

type OpenCode2Inventory = {
  agents: Awaited<ReturnType<OpenCode2Client["agent"]["list"]>>["data"];
  models: Awaited<ReturnType<OpenCode2Client["model"]["list"]>>["data"];
  providers: ReadonlyArray<{ id: string; name?: string }>;
};

/** 2.x `model.list` (enabled models of active providers) as models. */
export function flattenOpenCode2Models(input: OpenCode2Inventory) {
  const providerNames = new Map(
    input.providers.map((provider) => [provider.id, provider.name?.trim()]),
  );
  const agents = input.agents.map((agent) => ({
    hidden: agent.hidden,
    mode: agent.mode,
    name: agent.id,
  }));
  const models: OpenCodeModelInfo[] = input.models.flatMap((model) => {
    const name = model.name?.trim();
    if (!name || model.enabled === false) return [];
    const slug = `${model.providerID}/${model.modelID}`;
    const subProvider = providerNames.get(model.providerID);
    const modalities = model.capabilities?.input ?? [];
    const context = model.limit?.context;
    return [
      {
        ...(typeof context === "number" ? { contextWindow: context } : {}),
        defaultReasoningEffort: null,
        description: subProvider ? `${name} via ${subProvider}` : name,
        displayName: name,
        id: slug,
        inputModalities: modalities.includes("image")
          ? ["text", "image"]
          : ["text"],
        isDefault: false,
        model: slug,
        openCode: openCodeCapabilitiesForModel({
          agents,
          providerID: model.providerID,
          variants: (model.variants ?? []).map((variant) => variant.id),
        }),
        supportedReasoningEfforts: [],
      },
    ];
  });
  return models.sort((left, right) =>
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
  cachedStatuses.clear();
}

export function isOpenCodeEngineAvailable(status: OpenCodeEngineStatus) {
  return status.state === "ready" || status.state === "timeout_no_cache";
}

export function buildOpenCodeThreadState(input: {
  cwd?: string | null;
  generation?: OpenCodeGeneration | null;
  modelId?: string | null;
  selectedAgent?: string | null;
  selectedVariant?: string | null;
  sessionId: string;
  syncedMessageId?: string | null;
}): OpenCodeThreadState {
  return {
    cwd: input.cwd ?? null,
    generation: input.generation ?? null,
    modelId: input.modelId ?? null,
    selectedAgent: input.selectedAgent ?? null,
    selectedVariant: input.selectedVariant ?? null,
    sessionId: input.sessionId,
    syncedMessageId: input.syncedMessageId ?? null,
  };
}

export type OpenCodeRuntimeInstance = EngineBinaryInstance;

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
  const key = getInstanceRuntimeKey(options?.instance);
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

type OpenCodeServerInventory = {
  commands: OpenCodeCommandInfo[];
  models: OpenCodeModelInfo[];
};

function toCommandInfo(
  commands: ReadonlyArray<{ description?: string; name: string }>,
) {
  return commands.map((command) => ({
    ...(command.description ? { description: command.description } : {}),
    name: command.name,
  }));
}

/** Models and commands from a running server of either generation. */
export async function loadOpenCodeServerInventory(
  server: Pick<OpenCodeServerProcess, "authorization" | "generation" | "url">,
  directory: string,
): Promise<OpenCodeServerInventory> {
  if (server.generation === "v2") {
    const client = createOpenCode2Client({
      authorization: server.authorization,
      baseUrl: server.url,
    });
    const location = { directory };
    const [models, agents, providers, commands] = await Promise.all([
      client.model.list({ location }),
      client.agent.list({ location }),
      client.provider
        .list({ location })
        .then((result) => (result as { data?: unknown }).data)
        .catch(() => []),
      client.command
        .list({ location })
        .then((result) => result.data)
        .catch(() => []),
    ]);
    return {
      commands: toCommandInfo(commands),
      models: flattenOpenCode2Models({
        agents: agents.data,
        models: models.data,
        providers: Array.isArray(providers)
          ? (providers as Array<{ id: string; name?: string }>)
          : [],
      }),
    };
  }
  const client = createOpenCodeSdkClient({
    authorization: server.authorization,
    baseUrl: server.url,
    directory,
  });
  const [inventory, commands] = await Promise.all([
    loadOpenCodeInventory(client),
    client.command
      .list()
      .then((result) => result.data ?? [])
      .catch(() => []),
  ]);
  return {
    commands: toCommandInfo(commands),
    models: flattenOpenCodeModels(inventory),
  };
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

/**
 * Starts a server, reads its inventory and records the status snapshot.
 * Aborting `signal` kills the server (a hung request fails with it) and
 * skips the snapshot write.
 */
export async function probeOpenCodeEngineStatus(
  runtime: ResolvedOpenCodeRuntime & { cliPath: string },
  snapshotPath: string,
  signal?: AbortSignal,
  instance?: OpenCodeRuntimeInstance | null,
) {
  let server: OpenCodeServerProcess | null = null;
  let ownsServer = false;
  let cliVersion = runtime.cliVersion;
  let compatibilityAdvisory = resolveOpenCodeCompatibility(cliVersion);
  const closeOnAbort = () => {
    if (ownsServer) server?.close();
  };
  signal?.addEventListener("abort", closeOnAbort, { once: true });

  try {
    // The instance's own server answers when one is running; otherwise a
    // short-lived one is started (and closed) for the probe, so a probe
    // never keeps a server alive.
    server = peekOpenCodeServer({
      binaryPath: runtime.cliPath,
      env: runtime.env,
      instanceId: instance?.id ?? "opencode",
      runtimeKey: getInstanceRuntimeKey(instance),
      version: runtime.cliVersion,
    });
    if (!server) {
      ownsServer = true;
      server = await startOpenCodeServerProcess({
        binaryPath: runtime.cliPath,
        env: runtime.env,
        generation: getOpenCodeGeneration(cliVersion),
        signal,
        timeoutMs: OPENCODE_STATUS_PROBE_SERVER_START_TIMEOUT_MS,
      });
    }
    signal?.throwIfAborted();
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
    const inventory = await loadOpenCodeServerInventory(server, process.cwd());
    // A probe given up on must not overwrite a newer snapshot later.
    signal?.throwIfAborted();
    const recordedAt = new Date().toISOString();

    await writeOpenCodeStatusSnapshot(snapshotPath, {
      availableModels: inventory.models,
      cliPath: runtime.cliPath,
      cliVersion,
      commands: inventory.commands,
      recordedAt,
    }).catch(() => undefined);

    return buildOpenCodeEngineStatus({
      authReady: true,
      availableModels: inventory.models,
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion,
      commands: inventory.commands,
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
    signal?.removeEventListener("abort", closeOnAbort);
    if (ownsServer) server?.close();
  }
}

export async function getOpenCodeEngineStatus(options?: {
  forceRefresh?: boolean;
  instance?: OpenCodeRuntimeInstance | null;
}): Promise<OpenCodeEngineStatus> {
  const key = getInstanceRuntimeKey(options?.instance);
  const cached = cachedStatuses.get(key);
  if (!options?.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const snapshotPath = getOpenCodeStatusSnapshotPath(options?.instance);
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

    // The probe is bounded (its server killed) at the deadline; the UI only
    // waits for the shorter query window and the probe may finish later.
    const cliPath = runtime.cliPath;
    const probe = withTimeout(
      (signal) =>
        probeOpenCodeEngineStatus(
          { ...runtime, cliPath },
          snapshotPath,
          signal,
          options?.instance,
        ),
      OPENCODE_STATUS_PROBE_DEADLINE_MS,
    );
    const status = await withTimeout(probe, OPENCODE_STATUS_QUERY_TIMEOUT_MS);
    if (status) return status;

    const snapshot = await readOpenCodeStatusSnapshot(snapshotPath, {
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

  cachedStatuses.set(key, {
    expiresAt: Date.now() + OPENCODE_STATUS_CACHE_TTL_MS,
    promise,
  });

  return promise;
}

export type StartOpenCodeSessionInput = {
  cwd: string;
  /** The thread's instance: its binary and environment. */
  instance?: OpenCodeRuntimeInstance | null;
  model: OpenCodeModelRef;
  permissionMode: OpenCodeTurnSessionPermissionMode;
  /** The thread's persisted session, continued when it still exists. */
  resume?: { generation: OpenCodeGeneration | null; sessionId: string } | null;
  signal?: AbortSignal;
  title: string;
};

type OpenCodeTurnSessionPermissionMode = Parameters<
  typeof openOpenCodeSession
>[0]["permissionMode"];

/**
 * The thread's OpenCode session for one turn on the instance's pooled
 * server (started when none runs). Release it when the turn ends.
 */
export async function startOpenCodeSession(
  input: StartOpenCodeSessionInput,
): Promise<OpenCodeTurnSession> {
  const runtime = await resolveOpenCodeRuntime({ instance: input.instance });
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
  return await openOpenCodeSession({
    binaryPath: runtime.cliPath,
    cliVersion: runtime.cliVersion,
    cwd: input.cwd,
    env: runtime.env,
    instance: input.instance ?? null,
    model: input.model,
    permissionMode: input.permissionMode,
    resumeGeneration: input.resume?.generation ?? null,
    resumeSessionId: input.resume?.sessionId ?? null,
    signal: input.signal,
    title: input.title,
  });
}
