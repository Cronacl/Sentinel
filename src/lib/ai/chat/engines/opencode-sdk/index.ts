import "server-only";

import {
  execFile,
  spawn,
  spawnSync,
  type ChildProcessByStdio,
} from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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

import type { OpenCodeThreadState } from "@/lib/ai/chat/engines/types";
import {
  applyPrivateFsMode,
  getSentinelStateRoot,
} from "@/lib/runtime/local-state";
import { setLocalRuntimeEnvValue } from "@/lib/runtime/local-runtime-env";
import {
  buildManagedExecutablePathValue,
  buildPreferredExecutablePathValue,
} from "@/lib/runtime/platform-paths";

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
// 1.18 listens before it bootstraps any project instance (serve runs with
// `instance: false`), and 1.3.17 measured ~1 s here, so 5 s stays a sensible
// bound for the listen step. Instance bootstrap happens on the first request.
const OPENCODE_SERVER_START_TIMEOUT_MS = 5_000;
const OPENCODE_CLI_VERIFY_TIMEOUT_MS = 1_500;
const OPENCODE_SHELL_LOOKUP_TIMEOUT_MS = 1_200;
const OPENCODE_STATUS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_STATE_FILE_MODE = 0o600;
const OPENCODE_STATUS_SNAPSHOT_FILE = "opencode-status.json";
const OPENCODE_PATH_START_MARKER = "__SENTINEL_OPENCODE_PATH_START__";
const OPENCODE_PATH_END_MARKER = "__SENTINEL_OPENCODE_PATH_END__";
const OPENCODE_SHELL_PATH_START_MARKER =
  "__SENTINEL_OPENCODE_SHELL_PATH_START__";
const OPENCODE_SHELL_PATH_END_MARKER = "__SENTINEL_OPENCODE_SHELL_PATH_END__";

// Oldest `opencode-ai` server that speaks everything this adapter consumes:
// 1.2.0 added the `message.part.delta` event (see its release notes) and
// already had the question reply/reject and permission reply routes, the
// `permission` ruleset on session.create and `variant` on prompt_async.
// Older servers get state "error" instead of a half-working run.
export const OPENCODE_MINIMUM_VERSION = "1.2.0";
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

type OpenCodeCommandResult = {
  code: number;
  stderr: string;
  stdout: string;
};

type OpenCodeShellLookupResult = {
  openCodePath: string | null;
  pathValue: string | null;
};

let cachedRuntime: {
  expiresAt: number;
  promise: Promise<ResolvedOpenCodeRuntime>;
} | null = null;

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

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    void promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function normalizeCandidatePath(candidatePath: string) {
  const trimmedPath = candidatePath.trim();
  if (!trimmedPath) return null;
  return path.isAbsolute(trimmedPath)
    ? path.normalize(trimmedPath)
    : path.resolve(process.cwd(), trimmedPath);
}

async function isExecutable(candidatePath: string) {
  const normalizedPath = normalizeCandidatePath(candidatePath);
  if (!normalizedPath) return false;

  try {
    await access(
      normalizedPath,
      process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

function getExecutableNames(command: string) {
  if (process.platform !== "win32") return [command];

  const pathExt = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);

  const names = new Set<string>([command]);
  const lowerCommand = command.toLowerCase();
  for (const extension of pathExt) {
    if (!lowerCommand.endsWith(extension.toLowerCase())) {
      names.add(`${command}${extension}`);
    }
  }

  return [...names];
}

async function findExecutableInPath(
  command: string,
  pathValue?: string | null,
) {
  if (!pathValue) return null;

  const searchPaths = pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const directory of searchPaths) {
    for (const executableName of getExecutableNames(command)) {
      const candidatePath = path.join(directory, executableName);
      if (await isExecutable(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

function buildLoginShellLookupArgs(script: string) {
  return ["-l", "-c", script];
}

function buildPosixShellLookupScript() {
  return [
    "if command -v opencode >/dev/null 2>&1; then",
    `  printf '%s\\n' '${OPENCODE_PATH_START_MARKER}'`,
    "  command -v opencode",
    `  printf '%s\\n' '${OPENCODE_PATH_END_MARKER}'`,
    "fi",
    `printf '%s\\n' '${OPENCODE_SHELL_PATH_START_MARKER}'`,
    `printf '%s\\n' "$PATH"`,
    `printf '%s\\n' '${OPENCODE_SHELL_PATH_END_MARKER}'`,
  ].join("\n");
}

function buildFishShellLookupScript() {
  return [
    "if command -v opencode >/dev/null 2>/dev/null",
    `  printf '%s\\n' '${OPENCODE_PATH_START_MARKER}'`,
    "  command -v opencode",
    `  printf '%s\\n' '${OPENCODE_PATH_END_MARKER}'`,
    "end",
    `printf '%s\\n' '${OPENCODE_SHELL_PATH_START_MARKER}'`,
    "printf '%s\\n' (string join : -- $PATH)",
    `printf '%s\\n' '${OPENCODE_SHELL_PATH_END_MARKER}'`,
  ].join("\n");
}

function extractMarkerValue(
  output: string,
  startMarker: string,
  endMarker: string,
) {
  const startIndex = output.indexOf(startMarker);
  const endIndex = output.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  return (
    output
      .slice(startIndex + startMarker.length, endIndex)
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  );
}

function parseShellLookupOutput(stdout: string): OpenCodeShellLookupResult {
  return {
    openCodePath: extractMarkerValue(
      stdout,
      OPENCODE_PATH_START_MARKER,
      OPENCODE_PATH_END_MARKER,
    ),
    pathValue: extractMarkerValue(
      stdout,
      OPENCODE_SHELL_PATH_START_MARKER,
      OPENCODE_SHELL_PATH_END_MARKER,
    ),
  };
}

async function execShellLookup(
  shellPath: string,
  script: string,
): Promise<OpenCodeShellLookupResult | null> {
  return await new Promise((resolve) => {
    const child = execFile(
      shellPath,
      buildLoginShellLookupArgs(script),
      {
        timeout: OPENCODE_SHELL_LOOKUP_TIMEOUT_MS,
        windowsHide: true,
      },
      (_error, stdout) => {
        resolve(parseShellLookupOutput(stdout));
      },
    );
    child.on("error", () => resolve(null));
  });
}

async function resolveOpenCodeCliFromShell() {
  if (process.platform === "win32") return null;

  const shellCandidates = [
    process.env.SHELL,
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
    "/opt/homebrew/bin/fish",
    "/usr/local/bin/fish",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const shellPath of [...new Set(shellCandidates)]) {
    const isFish = path.basename(shellPath).includes("fish");
    const result = await execShellLookup(
      shellPath,
      isFish ? buildFishShellLookupScript() : buildPosixShellLookupScript(),
    );
    if (result?.openCodePath || result?.pathValue) {
      return result;
    }
  }

  return null;
}

async function runOpenCodeCommand(input: {
  args: string[];
  binaryPath: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<OpenCodeCommandResult> {
  return await new Promise((resolve, reject) => {
    execFile(
      input.binaryPath,
      input.args,
      {
        cwd: input.cwd,
        env: input.env,
        timeout: input.timeoutMs ?? OPENCODE_CLI_VERIFY_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const code = error ? 1 : 0;
        if (error && code === 1 && !stdout && !stderr) {
          reject(error);
          return;
        }
        resolve({ code, stderr, stdout });
      },
    ).on("error", reject);
  });
}

async function verifyOpenCodeCli(
  candidatePath: string,
  env: NodeJS.ProcessEnv,
) {
  try {
    const result = await runOpenCodeCommand({
      args: ["--version"],
      binaryPath: candidatePath,
      env,
    });
    return {
      cliPath: candidatePath,
      cliVersion: parseOpenCodeVersion(result.stdout || result.stderr),
    };
  } catch {
    return null;
  }
}

function parseOpenCodeVersion(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.split(/\r?\n/)[0]?.trim() ?? null;
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

function isPersistableOpenCodePath(executablePath: string) {
  const normalized = executablePath.replaceAll("\\", "/");
  return !normalized.includes("/fnm_multishells/");
}

async function persistResolvedOpenCodeCli(
  executablePath: string | null,
  options?: { persist?: boolean },
) {
  if (!executablePath?.trim()) {
    return;
  }

  const persist = options?.persist ?? true;

  try {
    if (persist) {
      await setLocalRuntimeEnvValue("SENTINEL_OPENCODE_PATH", executablePath);
      return;
    }

    process.env.SENTINEL_OPENCODE_PATH = executablePath;
  } catch {
    process.env.SENTINEL_OPENCODE_PATH = executablePath;
    // Best effort only; runtime discovery still works without the persisted hint.
  }
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

function isOpenCodeAuthErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("auth") ||
    normalized.includes("login") ||
    normalized.includes("unauth") ||
    normalized.includes("permission denied")
  );
}

export function resetOpenCodeRuntimeCache() {
  cachedRuntime = null;
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

export async function resolveOpenCodeRuntime(options?: {
  forceRefresh?: boolean;
}): Promise<ResolvedOpenCodeRuntime> {
  if (
    !options?.forceRefresh &&
    cachedRuntime &&
    cachedRuntime.expiresAt > Date.now()
  ) {
    return cachedRuntime.promise;
  }

  const promise = (async () => {
    const explicitPath = process.env.SENTINEL_OPENCODE_PATH?.trim();
    const preferredPathValue = buildPreferredExecutablePathValue(
      process.env.PATH,
    );
    const managedPathValue =
      await buildManagedExecutablePathValue(preferredPathValue);
    const env = {
      ...process.env,
      PATH: managedPathValue,
    };

    const explicitCandidate = explicitPath
      ? await verifyOpenCodeCli(explicitPath, env)
      : null;

    if (explicitCandidate?.cliPath) {
      await persistResolvedOpenCodeCli(explicitCandidate.cliPath, {
        persist: isPersistableOpenCodePath(explicitCandidate.cliPath),
      });
      return {
        cliDetected: true,
        cliPath: explicitCandidate.cliPath,
        cliVersion: explicitCandidate.cliVersion,
        env,
        error: null,
      } satisfies ResolvedOpenCodeRuntime;
    }

    const shellLookup = await resolveOpenCodeCliFromShell();
    const candidatePath =
      (await findExecutableInPath(
        "opencode",
        shellLookup?.pathValue ?? managedPathValue,
      )) ??
      shellLookup?.openCodePath ??
      null;

    if (!candidatePath) {
      return {
        cliDetected: false,
        cliPath: explicitPath ?? null,
        cliVersion: null,
        env,
        error: explicitPath
          ? "OpenCode CLI path is retained but is not currently launchable."
          : "OpenCode CLI (`opencode`) was not found in PATH.",
      } satisfies ResolvedOpenCodeRuntime;
    }

    const verified = await verifyOpenCodeCli(candidatePath, env);
    await persistResolvedOpenCodeCli(candidatePath, {
      persist: isPersistableOpenCodePath(candidatePath),
    });

    return {
      cliDetected: true,
      cliPath: candidatePath,
      cliVersion: verified?.cliVersion ?? null,
      env,
      error: null,
    } satisfies ResolvedOpenCodeRuntime;
  })();

  cachedRuntime = {
    expiresAt: Date.now() + OPENCODE_RUNTIME_CACHE_TTL_MS,
    promise,
  };

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

// Adapted from @opencode-ai/sdk dist/process.js `stop()` (MIT): on Windows the
// spawn goes through a shell, so the tree is killed with taskkill. Elsewhere a
// SIGTERM (the npm launcher forwards it) escalates to SIGKILL after a grace
// period so a wedged server cannot outlive the run.
function stopOpenCodeServerChild(child: OpenCodeServerChild) {
  if (hasOpenCodeServerExited(child)) return;

  if (process.platform === "win32" && child.pid) {
    const result = spawnSync(
      "taskkill",
      ["/pid", String(child.pid), "/T", "/F"],
      { windowsHide: true },
    );
    if (!result.error && result.status === 0) return;
  }

  child.kill("SIGTERM");
  const escalation = setTimeout(() => {
    if (!hasOpenCodeServerExited(child)) {
      child.kill("SIGKILL");
    }
  }, OPENCODE_SERVER_KILL_GRACE_MS);
  escalation.unref?.();
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
  const child: OpenCodeServerChild = spawn(
    input.binaryPath,
    ["serve", `--hostname=${OPENCODE_SERVER_HOSTNAME}`, `--port=${port}`],
    {
      cwd: input.cwd,
      env: {
        ...baseEnv,
        // Keep a caller's or the user's OPENCODE_CONFIG_CONTENT; forcing "{}"
        // clobbered it (t3code resolveOpenCodeConfigContent).
        OPENCODE_CONFIG_CONTENT: baseEnv.OPENCODE_CONFIG_CONTENT ?? "{}",
        OPENCODE_SERVER_PASSWORD: password,
        OPENCODE_SERVER_USERNAME,
      },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

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
      timeoutMs: OPENCODE_SERVER_START_TIMEOUT_MS,
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
    return buildOpenCodeEngineStatus({
      authReady: !isOpenCodeAuthErrorMessage(message),
      availableModels: [],
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion,
      compatibilityAdvisory,
      error: message,
      lastSuccessfulProbeAt: null,
      state: isOpenCodeAuthErrorMessage(message) ? "auth_unavailable" : "error",
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
