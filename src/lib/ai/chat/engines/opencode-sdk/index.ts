import "server-only";

import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

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

const OPENCODE_SERVER_READY_PREFIX = "opencode server listening";
const OPENCODE_RUNTIME_CACHE_TTL_MS = 15_000;
const OPENCODE_STATUS_CACHE_TTL_MS = 15_000;
const OPENCODE_STATUS_QUERY_TIMEOUT_MS = 4_000;
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

export type OpenCodeEngineStatus = {
  authReady: boolean;
  availableModels: OpenCodeModelInfo[];
  cliDetected: boolean;
  cliPath: string | null;
  cliVersion: string | null;
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

export type OpenCodeServerProcess = {
  close: () => void;
  stderr: () => string;
  stdout: () => string;
  url: string;
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
    engine: "opencode" as const,
    error: input.error,
    lastSuccessfulProbeAt: input.lastSuccessfulProbeAt,
    state: input.state,
    usedCachedStatus: input.usedCachedStatus,
  } satisfies OpenCodeEngineStatus;
}

function buildCachedOpenCodeStatus(input: {
  snapshot: OpenCodeStatusSnapshot;
}) {
  return buildOpenCodeEngineStatus({
    authReady: true,
    availableModels: input.snapshot.availableModels,
    cliDetected: true,
    cliPath: input.snapshot.cliPath,
    cliVersion: input.snapshot.cliVersion,
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
    server.listen(0, "127.0.0.1", () => {
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

function parseServerUrlFromOutput(output: string) {
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith(OPENCODE_SERVER_READY_PREFIX)) continue;
    const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
    return match?.[1] ?? null;
  }
  return null;
}

export async function startOpenCodeServerProcess(input: {
  binaryPath: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<OpenCodeServerProcess> {
  const port = await findAvailablePort();
  const child = spawn(
    input.binaryPath,
    ["serve", "--hostname=127.0.0.1", `--port=${port}`],
    {
      cwd: input.cwd,
      env: {
        ...(input.env ?? process.env),
        OPENCODE_CONFIG_CONTENT: JSON.stringify({}),
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

  return await new Promise((resolve, reject) => {
    const cleanupStartupListeners = () => {
      child.off("error", handleError);
      child.off("exit", handleExit);
      child.stdout.off("data", handleStdout);
      child.stderr.off("data", handleStderr);
      clearTimeout(timeoutId);
    };

    const close = () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanupStartupListeners();
      close();
      reject(error);
    };

    const handleError = (error: Error) => {
      fail(error);
    };

    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
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
    };

    const handleStdout = (chunk: string | Buffer) => {
      stdout += String(chunk);
      const url = parseServerUrlFromOutput(stdout);
      if (!url || settled) return;

      settled = true;
      cleanupStartupListeners();
      child.stdout.on("data", (nextChunk) => {
        stdout += String(nextChunk);
      });
      child.stderr.on("data", (nextChunk) => {
        stderr += String(nextChunk);
      });
      resolve({
        close,
        stderr: () => stderr,
        stdout: () => stdout,
        url,
      });
    };

    const handleStderr = (chunk: string | Buffer) => {
      stderr += String(chunk);
    };

    const timeoutId = setTimeout(() => {
      fail(
        new Error(
          `Timed out waiting for OpenCode server start after ${
            input.timeoutMs ?? OPENCODE_SERVER_START_TIMEOUT_MS
          }ms.`,
        ),
      );
    }, input.timeoutMs ?? OPENCODE_SERVER_START_TIMEOUT_MS);

    child.on("error", handleError);
    child.on("exit", handleExit);
    child.stdout.on("data", handleStdout);
    child.stderr.on("data", handleStderr);
  });
}

export function createOpenCodeSdkClient(input: {
  baseUrl: string;
  directory: string;
}) {
  return createOpencodeClient({
    baseUrl: input.baseUrl,
    directory: input.directory,
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

async function probeOpenCodeEngineStatus(runtime: ResolvedOpenCodeRuntime) {
  if (!runtime.cliDetected || !runtime.cliPath) {
    return buildOpenCodeEngineStatus({
      authReady: false,
      availableModels: [],
      cliDetected: false,
      cliPath: null,
      cliVersion: null,
      error: runtime.error,
      lastSuccessfulProbeAt: null,
      state: "missing_runtime",
      usedCachedStatus: false,
    });
  }

  let server: OpenCodeServerProcess | null = null;

  try {
    server = await startOpenCodeServerProcess({
      binaryPath: runtime.cliPath,
      env: runtime.env,
      timeoutMs: OPENCODE_SERVER_START_TIMEOUT_MS,
    });
    const client = createOpenCodeSdkClient({
      baseUrl: server.url,
      directory: process.cwd(),
    });
    const inventory = await loadOpenCodeInventory(client);
    const models = flattenOpenCodeModels(inventory);
    const recordedAt = new Date().toISOString();

    await writeOpenCodeStatusSnapshot({
      availableModels: models,
      cliPath: runtime.cliPath,
      cliVersion: runtime.cliVersion,
      recordedAt,
    }).catch(() => undefined);

    return buildOpenCodeEngineStatus({
      authReady: true,
      availableModels: models,
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion: runtime.cliVersion,
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
      cliVersion: runtime.cliVersion,
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
        error: runtime.error,
        lastSuccessfulProbeAt: null,
        state: "missing_runtime",
        usedCachedStatus: false,
      });
    }

    const status = await withTimeout(
      probeOpenCodeEngineStatus(runtime),
      OPENCODE_STATUS_QUERY_TIMEOUT_MS,
    );
    if (status) return status;

    const snapshot = await readOpenCodeStatusSnapshot({
      cliPath: runtime.cliPath,
    });
    if (snapshot) {
      return buildCachedOpenCodeStatus({ snapshot });
    }

    return buildOpenCodeEngineStatus({
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion: runtime.cliVersion,
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

  const server = await startOpenCodeServerProcess({
    binaryPath: runtime.cliPath,
    cwd: input.cwd,
    env: runtime.env,
  });
  const client = createOpenCodeSdkClient({
    baseUrl: server.url,
    directory: input.cwd,
  });
  const session = await client.session.create({
    permission: buildOpenCodePermissionRules(input.fullAccess),
    title: input.title,
  });

  if (!session.data?.id) {
    server.close();
    throw new Error("OpenCode session.create returned no session id.");
  }

  return {
    client,
    runtime,
    server,
    sessionId: session.data.id,
  } satisfies OpenCodeSession;
}
