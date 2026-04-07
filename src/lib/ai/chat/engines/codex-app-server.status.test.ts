import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

const resolveCodexCliMock = mock(async () => ({
  command: "/Users/test/.local/bin/codex",
  env: process.env,
}));
const readCodexCliVersionMock = mock(async () => "codex-cli 0.98.0");
const spawnCodexCliMock = mock(() => {
  throw new Error("spawnCodexCli should not be called in status tests");
});

mock.module("./codex-cli", () => ({
  readCodexCliVersion: readCodexCliVersionMock,
  resolveCodexCli: resolveCodexCliMock,
  spawnCodexCli: spawnCodexCliMock,
}));

const {
  getCodexAppServerManager,
  resetCodexEngineStatusCache,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./codex-app-server.ts?codex-app-server-status-test");

const originalHome = process.env.HOME;
const originalSentinelCodexPath = process.env.SENTINEL_CODEX_PATH;
const originalSentinelStatePath = process.env.SENTINEL_STATE_PATH;

function buildCodexModel() {
  return {
    defaultReasoningEffort: "medium" as const,
    description: "Codex flagship model.",
    displayName: "GPT-5 Codex",
    id: "gpt-5-codex",
    inputModalities: ["text"],
    isDefault: true,
    model: "gpt-5-codex",
    supportedReasoningEfforts: [
      {
        description: "GPT-5 Codex supports medium reasoning effort.",
        effort: "medium" as const,
        label: "Medium",
      },
    ],
    supportsPersonality: false,
  };
}

beforeEach(() => {
  resolveCodexCliMock.mockReset();
  readCodexCliVersionMock.mockReset();
  spawnCodexCliMock.mockReset();
  delete process.env.SENTINEL_STATE_PATH;

  resolveCodexCliMock.mockImplementation(async () => ({
    command: "/Users/test/.local/bin/codex",
    env: process.env,
  }));
  readCodexCliVersionMock.mockImplementation(async () => "codex-cli 0.98.0");

  const manager = getCodexAppServerManager() as any;
  manager.ensureStarted = mock(async () => undefined);
  manager.readAccount = mock(async () => ({
    account: {
      email: "codex@example.com",
      planType: "plus",
      type: "chatgpt" as const,
    },
    requiresOpenaiAuth: false,
  }));
  manager.listModels = mock(async () => [buildCodexModel()]);
  manager.reloadRuntime = mock(async () => undefined);
});

afterEach(() => {
  process.env.HOME = originalHome;
  if (originalSentinelCodexPath) {
    process.env.SENTINEL_CODEX_PATH = originalSentinelCodexPath;
  } else {
    delete process.env.SENTINEL_CODEX_PATH;
  }
  if (originalSentinelStatePath) {
    process.env.SENTINEL_STATE_PATH = originalSentinelStatePath;
  } else {
    delete process.env.SENTINEL_STATE_PATH;
  }
  resetCodexEngineStatusCache();
});

describe("CodexAppServerManager.getStatus", () => {
  it("writes a last-known-good snapshot after a successful probe", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));

    try {
      process.env.HOME = tempRoot;
      resolveCodexCliMock.mockImplementation(async () => ({
        command: path.join(tempRoot, ".local", "bin", "codex"),
        env: process.env,
      }));

      const manager = getCodexAppServerManager();
      const status = await manager.getStatus({ forceRefresh: true });
      const snapshot = JSON.parse(
        await readFile(
          path.join(tempRoot, ".sentinel", "codex-status.json"),
          "utf8",
        ),
      ) as {
        availableModels: Array<{ id: string }>;
        cliPath: string;
        cliVersion: string | null;
        recordedAt: string;
      };

      expect(status).toEqual(
        expect.objectContaining({
          authReady: true,
          cliDetected: true,
          cliVersion: "codex-cli 0.98.0",
          lastSuccessfulProbeAt: expect.any(String),
          state: "ready",
          usedCachedStatus: false,
        }),
      );
      expect(snapshot.cliPath).toBe(
        path.join(tempRoot, ".local", "bin", "codex"),
      );
      expect(snapshot.cliVersion).toBe("codex-cli 0.98.0");
      expect(snapshot.availableModels[0]?.id).toBe("gpt-5-codex");
      expect(snapshot.recordedAt).toBe(status.lastSuccessfulProbeAt);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("reuses cached account and models when the live probe times out", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));

    try {
      process.env.HOME = tempRoot;
      resolveCodexCliMock.mockImplementation(async () => ({
        command: path.join(tempRoot, ".local", "bin", "codex"),
        env: process.env,
      }));

      const manager = getCodexAppServerManager() as any;
      const readyStatus = await manager.getStatus({ forceRefresh: true });

      manager.readAccount.mockImplementation(
        () => new Promise(() => undefined),
      );
      manager.listModels.mockImplementation(() => new Promise(() => undefined));
      resetCodexEngineStatusCache();

      const degradedStatus = await manager.getStatus({ forceRefresh: true });

      expect(readyStatus.state).toBe("ready");
      expect(degradedStatus).toEqual(
        expect.objectContaining({
          account: readyStatus.account,
          authReady: true,
          availableModels: readyStatus.availableModels,
          cliDetected: true,
          cliVersion: "codex-cli 0.98.0",
          error: null,
          lastSuccessfulProbeAt: readyStatus.lastSuccessfulProbeAt,
          state: "ready",
          usedCachedStatus: true,
        }),
      );
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }, 2_500);

  it("returns snapshot-backed status immediately before a background refresh completes", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));

    try {
      process.env.HOME = tempRoot;
      resolveCodexCliMock.mockImplementation(async () => ({
        command: path.join(tempRoot, ".local", "bin", "codex"),
        env: process.env,
      }));

      const manager = getCodexAppServerManager() as any;
      const readyStatus = await manager.getStatus({ forceRefresh: true });

      manager.readAccount.mockImplementation(
        async () =>
          await new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  account: readyStatus.account,
                  requiresOpenaiAuth: false,
                }),
              25,
            ),
          ),
      );
      manager.listModels.mockImplementation(
        async () =>
          await new Promise((resolve) =>
            setTimeout(() => resolve(readyStatus.availableModels), 25),
          ),
      );
      resetCodexEngineStatusCache();

      const snapshotBackedStatus = await manager.getStatus();

      expect(snapshotBackedStatus).toEqual(
        expect.objectContaining({
          account: readyStatus.account,
          authReady: true,
          availableModels: readyStatus.availableModels,
          error: null,
          lastSuccessfulProbeAt: readyStatus.lastSuccessfulProbeAt,
          state: "ready",
          usedCachedStatus: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 60));
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("reuses cached data when Codex reports as unauthenticated", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));

    try {
      process.env.HOME = tempRoot;
      resolveCodexCliMock.mockImplementation(async () => ({
        command: path.join(tempRoot, ".local", "bin", "codex"),
        env: process.env,
      }));

      const manager = getCodexAppServerManager() as any;
      const readyStatus = await manager.getStatus({ forceRefresh: true });

      manager.readAccount.mockImplementation(async () => ({
        account: null,
        requiresOpenaiAuth: true,
      }));
      manager.listModels.mockImplementation(async () => []);
      resetCodexEngineStatusCache();

      const status = await manager.getStatus({ forceRefresh: true });

      expect(status).toEqual(
        expect.objectContaining({
          account: expect.objectContaining({
            email: "codex@example.com",
          }),
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

  it("ignores a stale snapshot when the resolved Codex path changes", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));

    try {
      process.env.HOME = tempRoot;
      const firstPath = path.join(tempRoot, ".local", "bin", "codex");
      const secondPath = path.join(tempRoot, ".bun", "bin", "codex");
      resolveCodexCliMock.mockImplementation(async () => ({
        command: firstPath,
        env: process.env,
      }));

      const manager = getCodexAppServerManager() as any;
      await manager.getStatus({ forceRefresh: true });

      resolveCodexCliMock.mockImplementation(async () => ({
        command: secondPath,
        env: process.env,
      }));
      manager.readAccount.mockImplementation(
        () => new Promise(() => undefined),
      );
      manager.listModels.mockImplementation(() => new Promise(() => undefined));
      resetCodexEngineStatusCache();

      const status = await manager.getStatus({ forceRefresh: true });

      expect(status).toEqual(
        expect.objectContaining({
          account: null,
          authReady: false,
          availableModels: [],
          error: "Timed out while querying Codex runtime.",
          state: "timeout_no_cache",
          usedCachedStatus: false,
        }),
      );
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }, 2_500);
});
