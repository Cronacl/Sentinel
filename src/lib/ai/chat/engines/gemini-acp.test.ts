import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

const initializeMock = mock(async () => ({ authMethods: [] }));
const authenticateMock = mock(async () => ({}));

mock.module("./acp-client", () => ({
  AcpClient: class {
    async authenticate(params: unknown) {
      return await authenticateMock(params);
    }
    async close() {}
    async initialize(params: unknown) {
      return await initializeMock(params);
    }
  },
}));

const {
  getGeminiEngineStatus,
  resetGeminiEngineStatusCache,
  resolveGeminiCli,
  // @ts-expect-error Bun cache-busting import for test isolation.
} = await import("./gemini-acp.ts?gemini-acp-test");

const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalGeminiPath = process.env.SENTINEL_GEMINI_PATH;

beforeEach(() => {
  initializeMock.mockReset();
  authenticateMock.mockReset();
  initializeMock.mockImplementation(async () => ({ authMethods: [] }));
  authenticateMock.mockImplementation(async () => ({}));
});

afterEach(() => {
  process.env.PATH = originalPath;
  process.env.HOME = originalHome;
  if (originalGeminiPath) {
    process.env.SENTINEL_GEMINI_PATH = originalGeminiPath;
  } else {
    delete process.env.SENTINEL_GEMINI_PATH;
  }
  resetGeminiEngineStatusCache();
  mock.restore();
});

async function createExecutable(filePath: string) {
  await writeFile(filePath, "#!/bin/sh\nprintf 'gemini 1.2.3'\n", {
    encoding: "utf8",
    mode: 0o755,
  });
}

describe("resolveGeminiCli", () => {
  it("detects gemini from PATH", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-gemini-"));
    const executablePath = path.join(tempRoot, "gemini");

    try {
      await createExecutable(executablePath);
      process.env.HOME = tempRoot;
      process.env.PATH = `${tempRoot}${path.delimiter}${originalPath ?? ""}`;

      const resolved = await resolveGeminiCli({ forceRefresh: true });

      expect(resolved?.command).toBe(executablePath);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});

describe("getGeminiEngineStatus", () => {
  it("returns a structured uncached status when no snapshot is available", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-gemini-"));

    try {
      process.env.HOME = tempRoot;
      process.env.PATH = tempRoot;
      delete process.env.SENTINEL_GEMINI_PATH;

      const status = await getGeminiEngineStatus({ forceRefresh: true });

      expect(status.engine).toBe("gemini");
      expect(status.usedCachedStatus).toBe(false);
      if (status.cliDetected) {
        expect([
          "auth_unavailable",
          "error",
          "ready",
          "timeout_no_cache",
        ]).toContain(status.state);
      } else {
        expect(status.state).toBe("missing_cli");
      }
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("writes a snapshot after a successful probe", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-gemini-"));
    const executablePath = path.join(tempRoot, "gemini");

    try {
      await createExecutable(executablePath);
      process.env.HOME = tempRoot;
      process.env.PATH = `${tempRoot}${path.delimiter}${originalPath ?? ""}`;

      const status = await getGeminiEngineStatus({ forceRefresh: true });
      const snapshot = JSON.parse(
        await readFile(
          path.join(tempRoot, ".sentinel", "gemini-status.json"),
          "utf8",
        ),
      ) as { availableModels: Array<{ id: string }>; cliPath: string };

      expect(status).toEqual(
        expect.objectContaining({
          authReady: true,
          cliDetected: true,
          state: "ready",
        }),
      );
      expect(snapshot.cliPath).toBe(executablePath);
      expect(Array.isArray(snapshot.availableModels)).toBe(true);
      expect(snapshot.availableModels.length).toBeGreaterThan(0);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("treats auth failures as auth_unavailable", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-gemini-"));
    const executablePath = path.join(tempRoot, "gemini");

    try {
      await createExecutable(executablePath);
      process.env.HOME = tempRoot;
      process.env.PATH = `${tempRoot}${path.delimiter}${originalPath ?? ""}`;
      initializeMock.mockImplementation(async () => ({
        authMethods: [{ methodId: "oauth" }],
      }));
      authenticateMock.mockImplementation(async () => {
        throw new Error("Authentication required");
      });

      const status = await getGeminiEngineStatus({ forceRefresh: true });
      expect(status).toEqual(
        expect.objectContaining({
          authReady: false,
          state: "auth_unavailable",
        }),
      );
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
