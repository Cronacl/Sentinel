import { afterEach, describe, expect, it, mock } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const originalEnv = {
  HOME: process.env.HOME,
  PATH: process.env.PATH,
  SENTINEL_CURSOR_PATH: process.env.SENTINEL_CURSOR_PATH,
  SHELL: process.env.SHELL,
};
const tempRoots: string[] = [];

const setLocalRuntimeEnvValueMock = mock(
  async (key: string, value: string | null | undefined) => {
    const normalizedValue = value?.trim() ?? "";
    if (normalizedValue) {
      process.env[key] = normalizedValue;
      return;
    }

    delete process.env[key];
  },
);

mock.module("server-only", () => ({}));
mock.module("@/lib/logger", () => ({
  createLogger: () => ({
    debug() {},
    error() {},
    info() {},
    warn() {},
  }),
}));
mock.module("@/lib/runtime/local-runtime-env", () => ({
  setLocalRuntimeEnvValue: setLocalRuntimeEnvValueMock,
}));

const {
  buildCursorThreadState,
  parseCursorShellLookupOutput,
  resetCursorRuntimeCache,
  resolveCursorRuntime,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./cursor-acp.ts?cursor-acp-test");

async function writeLaunchableCursorScript(
  rootPath: string,
  relativePath: string,
) {
  const scriptPath = path.join(rootPath, relativePath);
  await writeFile(
    scriptPath,
    process.platform === "win32"
      ? "@echo off\r\necho agent 1.0.0\r\n"
      : "#!/bin/sh\nprintf 'agent 1.0.0\\n'\n",
    "utf8",
  );

  if (process.platform !== "win32") {
    await chmod(scriptPath, 0o755);
  }

  return scriptPath;
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((rootPath) => rm(rootPath, { force: true, recursive: true })),
  );

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }

  setLocalRuntimeEnvValueMock.mockClear();
  resetCursorRuntimeCache();
});

describe("parseCursorShellLookupOutput", () => {
  it("extracts both the agent path and the shell PATH", () => {
    expect(
      parseCursorShellLookupOutput(`
        noise
        __SENTINEL_CURSOR_PATH_START__
        /opt/homebrew/bin/agent
        __SENTINEL_CURSOR_PATH_END__
        __SENTINEL_CURSOR_SHELL_PATH_START__
        /opt/homebrew/bin:/usr/local/bin:/usr/bin
        __SENTINEL_CURSOR_SHELL_PATH_END__
      `),
    ).toEqual({
      cursorPath: "/opt/homebrew/bin/agent",
      pathValue: "/opt/homebrew/bin:/usr/local/bin:/usr/bin",
    });
  });
});

describe("buildCursorThreadState", () => {
  it("stores only the persisted Cursor resume fields", () => {
    expect(
      buildCursorThreadState({
        cwd: "/tmp/project",
        modelId: "gpt-5.4",
        reasoningEffort: "high",
        sessionId: "cursor-session-1",
      }),
    ).toEqual({
      cwd: "/tmp/project",
      modelId: "gpt-5.4",
      reasoningEffort: "high",
      sessionId: "cursor-session-1",
    });
  });
});

describe("resolveCursorRuntime", () => {
  it("uses SENTINEL_CURSOR_PATH when it points to a launchable binary", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "cursor-acp-runtime-test-"),
    );
    tempRoots.push(tempRoot);
    const executableName = process.platform === "win32" ? "agent.cmd" : "agent";
    const scriptPath = await writeLaunchableCursorScript(
      tempRoot,
      executableName,
    );

    process.env.SENTINEL_CURSOR_PATH = scriptPath;
    resetCursorRuntimeCache();

    const runtime = await resolveCursorRuntime();

    expect(runtime.cliDetected).toBe(true);
    expect(runtime.cliPath).toBe(scriptPath);
    expect(process.env.SENTINEL_CURSOR_PATH).toBe(scriptPath);
  });
});
