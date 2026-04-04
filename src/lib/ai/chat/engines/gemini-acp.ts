import "server-only";

import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  readFile,
  readdir,
  readFile as readFileFs,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createLogger } from "@/lib/logger";
import { setLocalRuntimeEnvValue } from "@/lib/runtime/local-runtime-env";
import {
  getDefaultReasoningEffort,
  getModelsForProvider,
  getSupportedReasoningEfforts,
  type ReasoningEffort,
} from "@/lib/ai/providers/models";
import type { McpServerRuntimeEntry } from "@/lib/mcp/runtime";

import { AcpClient, type AcpServerRequest } from "./acp-client";

const log = createLogger("GeminiAcp");
const GEMINI_STATUS_CACHE_TTL_MS = 15_000;
const GEMINI_STATUS_QUERY_TIMEOUT_MS = 20_000;
const GEMINI_STATUS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const GEMINI_CLI_VERSION_TIMEOUT_MS = 1_200;
const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_STATE_FILE_MODE = 0o600;
const GEMINI_STATUS_SNAPSHOT_FILE = "gemini-status.json";
const PROTOCOL_VERSION = 1;

export type GeminiModelInfo = {
  defaultReasoningEffort: ReasoningEffort;
  description: string;
  displayName: string;
  id: string;
  inputModalities: string[];
  isDefault: boolean;
  model: string;
  supportedReasoningEfforts: Array<{
    description: string;
    effort: ReasoningEffort;
    label: string;
  }>;
};

export type GeminiEngineState =
  | "auth_unavailable"
  | "error"
  | "missing_cli"
  | "ready"
  | "timeout_no_cache"
  | "timeout_using_cache";

export type GeminiEngineStatus = {
  authReady: boolean;
  availableModels: GeminiModelInfo[];
  cliDetected: boolean;
  cliVersion: string | null;
  engine: "gemini";
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  state: GeminiEngineState;
  usedCachedStatus: boolean;
};

export type ResolvedGeminiCli = {
  command: string;
  env: NodeJS.ProcessEnv;
};

type GeminiStatusSnapshot = {
  availableModels: GeminiModelInfo[];
  cliPath: string;
  cliVersion: string | null;
  recordedAt: string;
};

type GeminiFsProxyOptions = {
  sessionId: string;
  workspaceRoot: string | null;
};

let cachedStatus: {
  expiresAt: number;
  promise: Promise<GeminiEngineStatus>;
} | null = null;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(null);
    }, timeoutMs);

    void promise
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function getLocalStateDirectory() {
  return path.join(process.env.HOME?.trim() || os.homedir(), ".sentinel");
}

function getGeminiStatusSnapshotPath() {
  return path.join(getLocalStateDirectory(), GEMINI_STATUS_SNAPSHOT_FILE);
}

function isPersistableGeminiPath(command: string) {
  const normalized = command.replaceAll("\\", "/");
  return !normalized.includes("/fnm_multishells/");
}

async function persistResolvedGeminiCli(command: string | null) {
  const persist = Boolean(command?.trim());

  try {
    if (persist) {
      await setLocalRuntimeEnvValue("SENTINEL_GEMINI_PATH", command);
      return;
    }

    await setLocalRuntimeEnvValue("SENTINEL_GEMINI_PATH", null);
  } catch {
    if (command?.trim()) {
      process.env.SENTINEL_GEMINI_PATH = command;
      return;
    }

    delete process.env.SENTINEL_GEMINI_PATH;
  }
}

function getExecutableNames(command: string) {
  if (process.platform !== "win32") {
    return [command];
  }

  const pathExt = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);

  const names = new Set<string>([command]);
  const lowerCommand = command.toLowerCase();
  for (const extension of pathExt) {
    if (lowerCommand.endsWith(extension.toLowerCase())) {
      continue;
    }

    names.add(`${command}${extension}`);
  }

  return [...names];
}

async function isExecutable(candidatePath: string) {
  try {
    await access(
      candidatePath,
      process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

async function findExecutableInPath(
  command: string,
  pathValue?: string | null,
) {
  if (!pathValue) {
    return null;
  }

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

function getPreferredPathValue(pathValue?: string | null) {
  const homePath = process.env.HOME ?? os.homedir();
  const candidateEntries =
    process.platform === "win32"
      ? []
      : [
          path.join(homePath, ".bun", "bin"),
          path.join(homePath, ".local", "bin"),
          path.join(homePath, "bin"),
          path.join(homePath, ".volta", "bin"),
          path.join(homePath, ".asdf", "shims"),
          path.join(homePath, ".nodenv", "shims"),
          path.join(homePath, "Library", "pnpm"),
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/opt/local/bin",
          "/usr/bin",
          "/bin",
        ];

  return Array.from(
    new Set(
      [pathValue, ...candidateEntries]
        .flatMap((value) => (value ?? "").split(path.delimiter))
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ).join(path.delimiter);
}

async function resolveExecutableFromOverride() {
  const override = process.env.SENTINEL_GEMINI_PATH?.trim();
  if (!override) {
    return null;
  }

  if (await isExecutable(override)) {
    return override;
  }

  await persistResolvedGeminiCli(null);
  return null;
}

export async function resolveGeminiCli(options?: { forceRefresh?: boolean }) {
  void options;
  const override = await resolveExecutableFromOverride();
  if (override) {
    return {
      command: override,
      env: {
        ...process.env,
        PATH: getPreferredPathValue(process.env.PATH),
      },
    } satisfies ResolvedGeminiCli;
  }

  const preferredPath = getPreferredPathValue(process.env.PATH);
  const detected = await findExecutableInPath("gemini", preferredPath);
  if (!detected) {
    await persistResolvedGeminiCli(null);
    return null;
  }

  await persistResolvedGeminiCli(
    isPersistableGeminiPath(detected) ? detected : null,
  );

  return {
    command: detected,
    env: {
      ...process.env,
      PATH: preferredPath,
    },
  } satisfies ResolvedGeminiCli;
}

export async function readGeminiCliVersion(
  resolvedCli: ResolvedGeminiCli,
): Promise<string | null> {
  return await new Promise((resolve) => {
    execFile(
      resolvedCli.command,
      ["--version"],
      {
        env: resolvedCli.env,
        timeout: GEMINI_CLI_VERSION_TIMEOUT_MS,
      },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }

        const normalized = stdout.trim();
        resolve(normalized.length > 0 ? normalized : null);
      },
    );
  });
}

export function buildFallbackGeminiModels() {
  const allowedIds = new Set([
    "gemini-3.1-pro-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ]);

  const catalogModels = getModelsForProvider("google")
    .filter((model) => allowedIds.has(model.id))
    .map((model) => ({
      defaultReasoningEffort:
        getDefaultReasoningEffort("google", model.id) ?? "medium",
      description: model.description,
      displayName: model.displayName,
      id: model.id,
      inputModalities: model.capabilities.includes("vision")
        ? ["text", "image"]
        : ["text"],
      isDefault: model.id === "gemini-2.5-pro",
      model: model.id,
      supportedReasoningEfforts: getSupportedReasoningEfforts(
        "google",
        model.id,
      ).map((effort) => ({
        description: `${model.displayName} supports ${effort} reasoning effort.`,
        effort,
        label: effort[0]!.toUpperCase() + effort.slice(1),
      })),
    }));

  if (catalogModels.length > 0) {
    return catalogModels;
  }

  return [
    {
      description: "Balanced Gemini model for complex coding and reasoning.",
      displayName: "Gemini 2.5 Pro",
      id: "gemini-2.5-pro",
      isDefault: true,
    },
    {
      description: "Fast Gemini model for everyday interactive tasks.",
      displayName: "Gemini 2.5 Flash",
      id: "gemini-2.5-flash",
      isDefault: false,
    },
    {
      description: "Preview Gemini model with enhanced reasoning depth.",
      displayName: "Gemini 3.1 Pro Preview",
      id: "gemini-3.1-pro-preview",
      isDefault: false,
    },
  ].map((model) => ({
    defaultReasoningEffort:
      getDefaultReasoningEffort("google", model.id) ?? "medium",
    description: model.description,
    displayName: model.displayName,
    id: model.id,
    inputModalities: ["text", "image"],
    isDefault: model.isDefault,
    model: model.id,
    supportedReasoningEfforts: getSupportedReasoningEfforts(
      "google",
      model.id,
    ).map((effort) => ({
      description: `${model.displayName} supports ${effort} reasoning effort.`,
      effort,
      label: effort[0]!.toUpperCase() + effort.slice(1),
    })),
  }));
}

function buildGeminiEngineStatus(input: {
  authReady: boolean;
  availableModels: GeminiModelInfo[];
  cliDetected: boolean;
  cliVersion: string | null;
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  state: GeminiEngineState;
  usedCachedStatus: boolean;
}) {
  return {
    authReady: input.authReady,
    availableModels: input.availableModels,
    cliDetected: input.cliDetected,
    cliVersion: input.cliVersion,
    engine: "gemini" as const,
    error: input.error,
    lastSuccessfulProbeAt: input.lastSuccessfulProbeAt,
    state: input.state,
    usedCachedStatus: input.usedCachedStatus,
  } satisfies GeminiEngineStatus;
}

async function writeGeminiStatusSnapshot(snapshot: GeminiStatusSnapshot) {
  const snapshotPath = getGeminiStatusSnapshotPath();
  const localStateDirectory = getLocalStateDirectory();

  await mkdir(localStateDirectory, {
    mode: LOCAL_STATE_DIRECTORY_MODE,
    recursive: true,
  });
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), {
    encoding: "utf8",
    mode: LOCAL_STATE_FILE_MODE,
  });
  await chmod(localStateDirectory, LOCAL_STATE_DIRECTORY_MODE);
  await chmod(snapshotPath, LOCAL_STATE_FILE_MODE);
}

async function readGeminiStatusSnapshot(options: { cliPath: string }) {
  try {
    const rawSnapshot = await readFile(getGeminiStatusSnapshotPath(), "utf8");
    const parsed = JSON.parse(rawSnapshot) as Partial<GeminiStatusSnapshot>;
    if (
      typeof parsed.cliPath !== "string" ||
      parsed.cliPath !== options.cliPath ||
      typeof parsed.recordedAt !== "string" ||
      !Array.isArray(parsed.availableModels)
    ) {
      return null;
    }

    const recordedAt = new Date(parsed.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) {
      return null;
    }

    if (Date.now() - recordedAt.getTime() > GEMINI_STATUS_SNAPSHOT_MAX_AGE_MS) {
      return null;
    }

    return {
      availableModels: parsed.availableModels as GeminiModelInfo[],
      cliPath: parsed.cliPath,
      cliVersion:
        typeof parsed.cliVersion === "string" ? parsed.cliVersion : null,
      recordedAt: recordedAt.toISOString(),
    } satisfies GeminiStatusSnapshot;
  } catch {
    return null;
  }
}

function buildCachedGeminiStatus(input: {
  cliVersion: string | null;
  snapshot: GeminiStatusSnapshot;
}) {
  return buildGeminiEngineStatus({
    authReady: true,
    availableModels: input.snapshot.availableModels,
    cliDetected: true,
    cliVersion: input.cliVersion,
    error: null,
    lastSuccessfulProbeAt: input.snapshot.recordedAt,
    state: "ready",
    usedCachedStatus: true,
  });
}

function buildInitializeParams(mcpServers: unknown[] = []) {
  return {
    clientCapabilities: {
      fs: {
        readTextFile: true,
        writeTextFile: true,
      },
      terminal: false,
    },
    clientInfo: {
      name: "Sentinel",
      version: "0.1.0-alpha.1",
    },
    ...(mcpServers.length > 0 ? { mcpServers } : {}),
    protocolVersion: PROTOCOL_VERSION,
  };
}

function toAcpMcpServerEntry(entry: McpServerRuntimeEntry) {
  if (entry.transport === "stdio") {
    return {
      args: entry.config.args,
      command: entry.config.command,
      ...(entry.config.cwd ? { cwd: entry.config.cwd } : {}),
      env: [
        ...entry.config.envPassthrough.map((key) => ({
          key,
          value: process.env[key] ?? "",
        })),
        ...entry.config.envVars.map((row) => ({
          key: row.key,
          value: row.value,
        })),
      ],
      name: entry.name,
    };
  }

  const headers = [
    ...entry.config.headers.map((row) => ({ key: row.key, value: row.value })),
    ...entry.config.headersFromEnv.map((row) => ({
      key: row.key,
      value: process.env[row.value] ?? "",
    })),
  ];

  if (entry.config.bearerTokenEnvVar) {
    headers.push({
      key: "Authorization",
      value: `Bearer ${process.env[entry.config.bearerTokenEnvVar] ?? ""}`,
    });
  }

  return {
    headers,
    name: entry.name,
    transport: "http",
    url: entry.config.url,
  };
}

function ensureWithinWorkspaceRoot(
  workspaceRoot: string | null,
  targetPath: string,
) {
  const resolvedTarget = path.resolve(targetPath);
  if (!workspaceRoot) {
    throw new Error(
      "Gemini file access is unavailable without a workspace root.",
    );
  }

  const resolvedRoot = path.resolve(workspaceRoot);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  ) {
    return resolvedTarget;
  }

  throw new Error("Gemini attempted to access a path outside the workspace.");
}

function sliceLines(
  content: string,
  line?: number | null,
  limit?: number | null,
) {
  const lines = content.split("\n");
  const startLine = Math.max((line ?? 1) - 1, 0);
  const bounded = lines.slice(
    startLine,
    limit != null ? startLine + Math.max(limit, 0) : undefined,
  );
  return bounded.join("\n");
}

export function registerGeminiFsProxy(
  client: AcpClient,
  options: GeminiFsProxyOptions,
) {
  const unregisterRead = client.onRequest(
    "fs/read_text_file",
    async (request) => {
      const params = (request.params ?? {}) as {
        limit?: number | null;
        line?: number | null;
        path: string;
      };
      const resolvedPath = ensureWithinWorkspaceRoot(
        options.workspaceRoot,
        params.path,
      );
      const content = await readFileFs(resolvedPath, "utf8");
      return {
        content: sliceLines(content, params.line, params.limit),
      };
    },
  );

  const unregisterWrite = client.onRequest(
    "fs/write_text_file",
    async (request) => {
      const params = (request.params ?? {}) as {
        content: string;
        path: string;
      };
      const resolvedPath = ensureWithinWorkspaceRoot(
        options.workspaceRoot,
        params.path,
      );
      await mkdir(path.dirname(resolvedPath), { recursive: true });
      await writeFile(resolvedPath, params.content, "utf8");
      return {};
    },
  );

  return () => {
    unregisterRead();
    unregisterWrite();
  };
}

export async function createGeminiAcpClient() {
  const resolvedCli = await resolveGeminiCli({ forceRefresh: false });
  if (!resolvedCli) {
    throw new Error("Gemini CLI is not installed or not available on PATH.");
  }

  return new AcpClient({
    args: ["--acp"],
    command: resolvedCli.command,
    env: resolvedCli.env,
  });
}

async function probeGeminiStatus(input: {
  cliVersion: string | null;
  fallbackSnapshot: GeminiStatusSnapshot | null;
  resolvedCli: ResolvedGeminiCli;
}): Promise<GeminiEngineStatus> {
  const client = new AcpClient({
    args: ["--acp"],
    command: input.resolvedCli.command,
    env: input.resolvedCli.env,
  });

  try {
    const initialized = await withTimeout(
      client.initialize(buildInitializeParams()),
      GEMINI_STATUS_QUERY_TIMEOUT_MS,
    );
    if (!initialized) {
      if (input.fallbackSnapshot) {
        return buildCachedGeminiStatus({
          cliVersion: input.cliVersion,
          snapshot: input.fallbackSnapshot,
        });
      }

      return buildGeminiEngineStatus({
        authReady: false,
        availableModels: [],
        cliDetected: true,
        cliVersion: input.cliVersion,
        error: "Timed out while initializing Gemini ACP mode.",
        lastSuccessfulProbeAt: null,
        state: "timeout_no_cache",
        usedCachedStatus: false,
      });
    }

    const authMethods =
      (
        initialized as {
          authMethods?: Array<{ id?: string; methodId?: string }>;
        }
      )?.authMethods ?? [];
    if (authMethods.length > 0) {
      const authResult = await withTimeout(
        client.authenticate({
          methodId: authMethods[0]?.methodId ?? authMethods[0]?.id ?? "default",
        }),
        GEMINI_STATUS_QUERY_TIMEOUT_MS,
      );
      if (!authResult) {
        if (input.fallbackSnapshot) {
          return buildCachedGeminiStatus({
            cliVersion: input.cliVersion,
            snapshot: input.fallbackSnapshot,
          });
        }

        return buildGeminiEngineStatus({
          authReady: false,
          availableModels: [],
          cliDetected: true,
          cliVersion: input.cliVersion,
          error: "Timed out while authenticating Gemini CLI.",
          lastSuccessfulProbeAt: null,
          state: "timeout_no_cache",
          usedCachedStatus: false,
        });
      }
    }

    const availableModels = buildFallbackGeminiModels();
    const recordedAt = new Date().toISOString();
    await writeGeminiStatusSnapshot({
      availableModels,
      cliPath: input.resolvedCli.command,
      cliVersion: input.cliVersion,
      recordedAt,
    });

    return buildGeminiEngineStatus({
      authReady: true,
      availableModels,
      cliDetected: true,
      cliVersion: input.cliVersion,
      error: null,
      lastSuccessfulProbeAt: recordedAt,
      state: "ready",
      usedCachedStatus: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (input.fallbackSnapshot) {
      return buildCachedGeminiStatus({
        cliVersion: input.cliVersion,
        snapshot: input.fallbackSnapshot,
      });
    }

    return buildGeminiEngineStatus({
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliVersion: input.cliVersion,
      error: message,
      lastSuccessfulProbeAt: null,
      state: /auth|required|login|sign in/i.test(message)
        ? "auth_unavailable"
        : "error",
      usedCachedStatus: false,
    });
  } finally {
    await client.close().catch(() => {});
  }
}

export function isGeminiEngineAvailable(status: GeminiEngineStatus) {
  return status.state === "ready" || status.state === "timeout_using_cache";
}

export function resetGeminiEngineStatusCache() {
  cachedStatus = null;
}

export async function getGeminiEngineStatus(options?: {
  forceRefresh?: boolean;
}): Promise<GeminiEngineStatus> {
  const forceRefresh = options?.forceRefresh ?? false;
  const now = Date.now();

  if (!forceRefresh && cachedStatus && cachedStatus.expiresAt > now) {
    return await cachedStatus.promise;
  }

  const pending = (async () => {
    const resolvedCli = await resolveGeminiCli({ forceRefresh });
    if (!resolvedCli) {
      return buildGeminiEngineStatus({
        authReady: false,
        availableModels: [],
        cliDetected: false,
        cliVersion: null,
        error: "Gemini CLI is not installed or not available on PATH.",
        lastSuccessfulProbeAt: null,
        state: "missing_cli",
        usedCachedStatus: false,
      });
    }

    const cliVersion = await readGeminiCliVersion(resolvedCli);
    const snapshot = await readGeminiStatusSnapshot({
      cliPath: resolvedCli.command,
    });

    if (!forceRefresh && snapshot) {
      return buildCachedGeminiStatus({
        cliVersion,
        snapshot,
      });
    }

    const status = await probeGeminiStatus({
      cliVersion,
      fallbackSnapshot: snapshot,
      resolvedCli,
    });

    if (
      status.usedCachedStatus &&
      status.state === "ready" &&
      snapshot &&
      !forceRefresh
    ) {
      return {
        ...status,
        state: "timeout_using_cache" as const,
      } satisfies GeminiEngineStatus;
    }

    return status;
  })();

  cachedStatus = {
    expiresAt: now + GEMINI_STATUS_CACHE_TTL_MS,
    promise: pending,
  };

  return await pending;
}

export async function initializeGeminiSessionClient(input: {
  client: AcpClient;
  mcpServers: McpServerRuntimeEntry[];
  workspaceRoot: string | null;
}) {
  const enabledServers = input.mcpServers
    .filter((entry) => entry.isEnabled)
    .map(toAcpMcpServerEntry);

  const initializeResult = await input.client.initialize(
    buildInitializeParams(enabledServers),
  );
  const authMethods =
    (
      initializeResult as {
        authMethods?: Array<{ id?: string; methodId?: string }>;
      }
    )?.authMethods ?? [];

  if (authMethods.length > 0) {
    await input.client.authenticate({
      methodId: authMethods[0]?.methodId ?? authMethods[0]?.id ?? "default",
    });
  }

  return initializeResult;
}

export async function setupGeminiFsProxy(input: {
  client: AcpClient;
  sessionId: string;
  workspaceRoot: string | null;
}) {
  return registerGeminiFsProxy(input.client, {
    sessionId: input.sessionId,
    workspaceRoot: input.workspaceRoot,
  });
}

export async function validateGeminiWorkspaceRoot(
  workspaceRoot: string | null,
) {
  if (!workspaceRoot) {
    return null;
  }

  const metadata = await stat(workspaceRoot).catch(() => null);
  if (!metadata?.isDirectory()) {
    return null;
  }

  return workspaceRoot;
}

export async function listGeminiWorkspaceFiles(workspaceRoot: string | null) {
  if (!workspaceRoot) {
    return [];
  }

  return await readdir(workspaceRoot).catch(() => []);
}
