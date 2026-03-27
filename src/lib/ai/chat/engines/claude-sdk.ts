import "server-only";

import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import {
  query,
  type AccountInfo,
  type ModelInfo,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";

import { createLogger } from "@/lib/logger";
import type {
  ClaudePermissionMode,
  ClaudeThreadState,
} from "@/lib/ai/chat/engines/types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";

const log = createLogger("ClaudeSdk");
const CLAUDE_STATUS_CACHE_TTL_MS = 15_000;
const CLAUDE_SETTING_SOURCES = ["user", "project", "local"] as const;

type ClaudeSdkEffort = "low" | "medium" | "high" | "max";

export type ClaudeModelInfo = {
  contextWindow?: number;
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

export type ClaudeEngineStatus = {
  account: AccountInfo | null;
  authReady: boolean;
  availableModels: ClaudeModelInfo[];
  engine: "claude";
  error: string | null;
  sdkDetected: boolean;
};

let cachedStatus: {
  expiresAt: number;
  promise: Promise<ClaudeEngineStatus>;
} | null = null;

function normalizeClaudeEffort(effort: ClaudeSdkEffort): ReasoningEffort {
  switch (effort) {
    case "low":
    case "medium":
    case "high":
      return effort;
    case "max":
      return "high";
  }
}

function normalizeClaudeReasoningEfforts(model: ModelInfo) {
  const levels = (model.supportedEffortLevels ?? ["low", "medium", "high"])
    .map(normalizeClaudeEffort)
    .filter(
      (effort, index, array) =>
        array.indexOf(effort) === index &&
        (effort === "low" || effort === "medium" || effort === "high"),
    );

  return levels.map((effort) => ({
    description: `${model.displayName} supports ${effort} reasoning effort.`,
    effort,
    label: effort[0]!.toUpperCase() + effort.slice(1),
  }));
}

function getClaudeModelInputModalities(model: ModelInfo) {
  return model.description.toLowerCase().includes("vision")
    ? ["text", "image"]
    : ["text"];
}

const CLAUDE_CONTEXT_WINDOWS: Record<string, number> = {
  "claude-opus-4-6": 1_000_000,
  "claude-sonnet-4-6": 1_000_000,
  "claude-opus-4-5": 200_000,
  "claude-haiku-4-5": 200_000,
  "claude-sonnet-4-5": 200_000,
  "claude-sonnet-4-5-20250929": 200_000,
  "claude-opus-4-1": 200_000,
  "claude-opus-4-0": 200_000,
  "claude-sonnet-4-0": 200_000,
  "claude-4-sonnet-20250514": 200_000,
  "claude-3-7-sonnet-latest": 200_000,
  "claude-3-7-sonnet-20250219": 200_000,
  "claude-3-5-sonnet-20241022": 200_000,
  "claude-3-5-haiku-latest": 200_000,
  "claude-3-5-haiku-20241022": 200_000,
};

function resolveClaudeContextWindow(model: ModelInfo) {
  return CLAUDE_CONTEXT_WINDOWS[model.value];
}

function toClaudeModelInfo(model: ModelInfo): ClaudeModelInfo {
  const supportedReasoningEfforts = normalizeClaudeReasoningEfforts(model);

  return {
    contextWindow: resolveClaudeContextWindow(model),
    defaultReasoningEffort: supportedReasoningEfforts[0]?.effort ?? "medium",
    description: model.description,
    displayName: model.displayName,
    id: model.value,
    inputModalities: getClaudeModelInputModalities(model),
    isDefault: false,
    model: model.value,
    supportedReasoningEfforts,
  };
}

export function resolveClaudeSdkExecutable(command: string) {
  if (command === "node" || command === "bun") {
    return process.execPath;
  }

  return command;
}

export function buildClaudeSdkBaseOptions(options?: Partial<Options>): Options {
  return {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLAUDE_AGENT_SDK_CLIENT_APP:
        process.env.CLAUDE_AGENT_SDK_CLIENT_APP ?? "sentinel",
    },
    spawnClaudeCodeProcess: (spawnOptions) => {
      const child: ChildProcessByStdio<Writable, Readable, null> = spawn(
        resolveClaudeSdkExecutable(spawnOptions.command),
        spawnOptions.args,
        {
          cwd: spawnOptions.cwd,
          env: {
            ...spawnOptions.env,
            NODE_ENV: spawnOptions.env.NODE_ENV ?? process.env.NODE_ENV,
          } as NodeJS.ProcessEnv,
          signal: spawnOptions.signal,
          stdio: ["pipe", "pipe", "ignore"],
          windowsHide: true,
        },
      );

      return {
        stdin: child.stdin,
        stdout: child.stdout,
        get killed() {
          return child.killed;
        },
        get exitCode() {
          return child.exitCode;
        },
        kill: child.kill.bind(child),
        on: child.on.bind(child),
        once: child.once.bind(child),
        off: child.off.bind(child),
      };
    },
    persistSession: true,
    settingSources: [...CLAUDE_SETTING_SOURCES],
    systemPrompt: { type: "preset", preset: "claude_code" },
    tools: { type: "preset", preset: "claude_code" },
    ...(options ?? {}),
  };
}

async function readClaudeStatus(): Promise<ClaudeEngineStatus> {
  let claudeQuery: ReturnType<typeof query> | null = null;

  try {
    claudeQuery = query({
      prompt: "",
      options: buildClaudeSdkBaseOptions({
        cwd: process.cwd(),
        includePartialMessages: false,
        maxTurns: 1,
        persistSession: false,
      }),
    });

    const [models, account] = await Promise.all([
      claudeQuery.supportedModels(),
      claudeQuery.accountInfo().catch(() => null),
    ]);

    return {
      account,
      authReady: models.length > 0,
      availableModels: models.map(toClaudeModelInfo),
      engine: "claude",
      error: null,
      sdkDetected: true,
    };
  } catch (error) {
    log.warn("status_probe_failed", { error });

    return {
      account: null,
      authReady: false,
      availableModels: [],
      engine: "claude",
      error:
        error instanceof Error
          ? error.message
          : "Claude Code is unavailable in this Sentinel runtime.",
      sdkDetected: true,
    };
  } finally {
    claudeQuery?.close();
  }
}

export async function getClaudeEngineStatus(options?: {
  forceRefresh?: boolean;
}) {
  const forceRefresh = options?.forceRefresh ?? false;
  const now = Date.now();

  if (!forceRefresh && cachedStatus && cachedStatus.expiresAt > now) {
    return await cachedStatus.promise;
  }

  const pending = readClaudeStatus();
  cachedStatus = {
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
