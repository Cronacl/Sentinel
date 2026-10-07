import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

const closeMock = mock(() => undefined);
let initializationResultFactory: () => Promise<{
  account?: { email?: string | null } | null;
  models?: Array<{
    description: string;
    displayName: string;
    supportedEffortLevels?: Array<"low" | "medium" | "high" | "xhigh" | "max">;
    value: string;
  }>;
} | null> = async () => ({
  account: { email: "claude@example.com" },
  models: [
    {
      description: "Vision-capable Claude model",
      displayName: "Claude Sonnet 4.5",
      supportedEffortLevels: ["high"],
      value: "claude-sonnet-4-5",
    },
  ],
});

const queryMock = mock(
  (_input: { options?: Record<string, unknown>; prompt: unknown }) => ({
    close: closeMock,
    initializationResult: () => initializationResultFactory(),
  }),
);

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: queryMock,
}));

const {
  getClaudeEngineStatus,
  resetClaudeCodeRuntimeCache,
  resetClaudeEngineStatusCache,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./claude-sdk.ts?claude-sdk-status-test");

const originalHome = process.env.HOME;
const originalPath = process.env.PATH;
const originalSentinelClaudePath = process.env.SENTINEL_CLAUDE_PATH;
const originalClaudePath = process.env.CLAUDE_PATH;
const originalSentinelStatePath = process.env.SENTINEL_STATE_PATH;

beforeEach(() => {
  queryMock.mockClear();
  closeMock.mockClear();
  delete process.env.SENTINEL_STATE_PATH;
  initializationResultFactory = async () => ({
    account: { email: "claude@example.com" },
    models: [
      {
        description: "Vision-capable Claude model",
        displayName: "Claude Sonnet 4.5",
        supportedEffortLevels: ["high"],
        value: "claude-sonnet-4-5",
      },
    ],
  });
});

afterEach(() => {
  process.env.HOME = originalHome;
  process.env.PATH = originalPath;
  if (originalSentinelClaudePath) {
    process.env.SENTINEL_CLAUDE_PATH = originalSentinelClaudePath;
  } else {
    delete process.env.SENTINEL_CLAUDE_PATH;
  }
  if (originalClaudePath) {
    process.env.CLAUDE_PATH = originalClaudePath;
  } else {
    delete process.env.CLAUDE_PATH;
  }
  if (originalSentinelStatePath) {
    process.env.SENTINEL_STATE_PATH = originalSentinelStatePath;
  } else {
    delete process.env.SENTINEL_STATE_PATH;
  }
  resetClaudeCodeRuntimeCache();
  resetClaudeEngineStatusCache();
});

async function createClaudeExecutable(tempRoot: string) {
  const executablePath = path.join(tempRoot, "claude");
  await writeFile(
    executablePath,
    "#!/bin/sh\necho '2.1.39 (Claude Code)'\nexit 0\n",
    "utf8",
  );
  await chmod(executablePath, 0o755);
  process.env.HOME = tempRoot;
  process.env.PATH = tempRoot;
  delete process.env.CLAUDE_PATH;
  delete process.env.SENTINEL_CLAUDE_PATH;
  delete process.env.SENTINEL_STATE_PATH;
  return executablePath;
}

describe("getClaudeEngineStatus", () => {
  it("writes a last-known-good snapshot after a successful probe", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));

    try {
      const executablePath = await createClaudeExecutable(tempRoot);

      const status = await getClaudeEngineStatus({ forceRefresh: true });
      const snapshot = JSON.parse(
        await readFile(
          path.join(tempRoot, ".sentinel", "claude-status.json"),
          "utf8",
        ),
      ) as {
        availableModels: Array<{ id: string }>;
        binaryPath: string;
        binaryVersion: string | null;
        recordedAt: string;
      };

      expect(status).toEqual(
        expect.objectContaining({
          authReady: true,
          binaryDetected: true,
          binaryPath: executablePath,
          binaryVersion: "2.1.39 (Claude Code)",
          lastSuccessfulProbeAt: expect.any(String),
          state: "ready",
          usedCachedStatus: false,
        }),
      );
      expect(snapshot.binaryPath).toBe(executablePath);
      expect(snapshot.binaryVersion).toBe("2.1.39 (Claude Code)");
      expect(snapshot.availableModels[0]?.id).toBe("claude-sonnet-4-5");
      expect(snapshot.recordedAt).toBe(status.lastSuccessfulProbeAt);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("reuses cached models when the live probe times out", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));

    try {
      const executablePath = await createClaudeExecutable(tempRoot);

      const readyStatus = await getClaudeEngineStatus({ forceRefresh: true });

      initializationResultFactory = () => new Promise(() => undefined);
      resetClaudeCodeRuntimeCache();
      resetClaudeEngineStatusCache();

      const degradedStatus = await getClaudeEngineStatus({
        forceRefresh: true,
      });

      expect(readyStatus.state).toBe("ready");
      expect(degradedStatus).toEqual(
        expect.objectContaining({
          authReady: true,
          availableModels: readyStatus.availableModels,
          binaryDetected: true,
          binaryPath: executablePath,
          binaryVersion: "2.1.39 (Claude Code)",
          error: null,
          lastSuccessfulProbeAt: readyStatus.lastSuccessfulProbeAt,
          state: "ready",
          usedCachedStatus: true,
        }),
      );
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }, 8_000);

  it("returns snapshot-backed status immediately before a background refresh completes", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));

    try {
      const executablePath = await createClaudeExecutable(tempRoot);
      const readyStatus = await getClaudeEngineStatus({ forceRefresh: true });

      initializationResultFactory = () => new Promise(() => undefined);
      resetClaudeCodeRuntimeCache();
      resetClaudeEngineStatusCache();

      const snapshotBackedStatus = await getClaudeEngineStatus();

      expect(snapshotBackedStatus).toEqual(
        expect.objectContaining({
          authReady: true,
          availableModels: readyStatus.availableModels,
          binaryDetected: true,
          binaryPath: executablePath,
          binaryVersion: "2.1.39 (Claude Code)",
          error: null,
          lastSuccessfulProbeAt: readyStatus.lastSuccessfulProbeAt,
          state: "ready",
          usedCachedStatus: true,
        }),
      );
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("reports timeout_no_cache when no snapshot is available", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));

    try {
      const executablePath = await createClaudeExecutable(tempRoot);
      initializationResultFactory = () => new Promise(() => undefined);

      const status = await getClaudeEngineStatus({ forceRefresh: true });

      expect(status).toEqual(
        expect.objectContaining({
          authReady: false,
          availableModels: [],
          binaryDetected: true,
          binaryPath: executablePath,
          error: "Timed out while querying Claude Code runtime.",
          state: "timeout_no_cache",
          usedCachedStatus: false,
        }),
      );
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }, 8_000);

  it("reuses cached models when Claude reports as unauthenticated", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));

    try {
      await createClaudeExecutable(tempRoot);
      const readyStatus = await getClaudeEngineStatus({ forceRefresh: true });

      initializationResultFactory = async () => ({
        account: null,
        models: [],
      });
      resetClaudeCodeRuntimeCache();
      resetClaudeEngineStatusCache();

      const status = await getClaudeEngineStatus({ forceRefresh: true });

      expect(status).toEqual(
        expect.objectContaining({
          authReady: true,
          availableModels: readyStatus.availableModels,
          error: null,
          lastSuccessfulProbeAt: readyStatus.lastSuccessfulProbeAt,
          state: "ready",
          usedCachedStatus: true,
        }),
      );
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("probes with a prompt that never yields and isolated, explicit options", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));

    try {
      const executablePath = await createClaudeExecutable(tempRoot);

      await getClaudeEngineStatus({ forceRefresh: true });

      const input = queryMock.mock.calls[0]?.[0];
      expect(typeof input?.prompt).not.toBe("string");
      expect(input?.options).toEqual(
        expect.objectContaining({
          mcpServers: {},
          pathToClaudeCodeExecutable: executablePath,
          permissionMode: "default",
          persistSession: false,
          settings: { disableAllHooks: true },
          strictMcpConfig: true,
        }),
      );
      expect(input?.options?.env).toEqual(
        expect.objectContaining({
          CLAUDE_AGENT_SDK_CLIENT_APP: "sentinel",
          CLAUDE_CODE_AUTO_CONNECT_IDE: "0",
          ENABLE_CLAUDEAI_MCP_SERVERS: "false",
          HOME: tempRoot,
        }),
      );
      // A native binary is left to the SDK's own spawn.
      expect(input?.options?.spawnClaudeCodeProcess).toBeUndefined();
      expect(closeMock).toHaveBeenCalled();

      // The idle prompt ends once the probe is done instead of hanging.
      const iterator = (input?.prompt as AsyncIterable<unknown>)[
        Symbol.asyncIterator
      ]();
      await expect(iterator.next()).resolves.toEqual({
        done: true,
        value: undefined,
      });
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("reports xhigh effort and context windows from Claude Code 2.1 model info", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));

    try {
      await createClaudeExecutable(tempRoot);
      initializationResultFactory = async () => ({
        account: { email: "claude@example.com" },
        models: [
          {
            description: "Opus 5.5 · Most capable for complex work",
            displayName: "Opus 5.5",
            supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
            value: "claude-opus-5-5",
          },
        ],
      });

      const status = await getClaudeEngineStatus({ forceRefresh: true });

      expect(status.availableModels).toEqual([
        expect.objectContaining({
          contextWindow: 200_000,
          defaultReasoningEffort: "medium",
          id: "claude-opus-5-5",
          supportedReasoningEfforts: [
            expect.objectContaining({ effort: "low" }),
            expect.objectContaining({ effort: "medium" }),
            expect.objectContaining({ effort: "high" }),
            expect.objectContaining({ effort: "xhigh" }),
          ],
        }),
      ]);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
