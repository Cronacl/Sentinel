import { afterEach, describe, expect, it, mock } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  applyCursorSessionConfig,
  buildCursorThreadState,
  CursorAcpClient,
  getCursorEngineStatus,
  parseCursorShellLookupOutput,
  resetCursorEngineStatusCache,
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
  resetCursorEngineStatusCache();
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

describe("getCursorEngineStatus timeout", () => {
  it.skipIf(process.platform === "win32")(
    "kills the probe's agent process when the probe times out",
    async () => {
      const tempRoot = await mkdtemp(
        path.join(os.tmpdir(), "cursor-acp-timeout-test-"),
      );
      tempRoots.push(tempRoot);
      const pidPath = path.join(tempRoot, "agent.pid");
      const scriptPath = path.join(tempRoot, "agent");
      // Answers --version, then never answers ACP: `exec` keeps the pid.
      await writeFile(
        scriptPath,
        [
          "#!/bin/sh",
          'if [ "$1" = "--version" ]; then echo "agent 1.0.0"; exit 0; fi',
          `echo $$ > '${pidPath}'`,
          "exec sleep 600",
        ].join("\n"),
        "utf8",
      );
      await chmod(scriptPath, 0o755);
      process.env.SENTINEL_CURSOR_PATH = scriptPath;

      const status = await getCursorEngineStatus({ forceRefresh: true });
      expect(status.state).toBe("timeout_no_cache");

      const pid = Number((await readFile(pidPath, "utf8")).trim());
      const isAlive = () => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      for (let attempt = 0; attempt < 50 && isAlive(); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(isAlive()).toBe(false);
    },
    10_000,
  );
});

describe("CursorAcpClient.cancel", () => {
  it.skipIf(process.platform === "win32")(
    "sends session/cancel as a notification and never waits for a reply",
    async () => {
      const tempRoot = await mkdtemp(
        path.join(os.tmpdir(), "cursor-acp-cancel-test-"),
      );
      tempRoots.push(tempRoot);
      const recordPath = path.join(tempRoot, "stdin.jsonl");
      const scriptPath = path.join(tempRoot, "agent");
      // Records stdin and never answers, like an agent that ignores cancel.
      await writeFile(scriptPath, `#!/bin/sh\ncat > "${recordPath}"\n`);
      await chmod(scriptPath, 0o755);

      const client = new CursorAcpClient({
        command: scriptPath,
        cwd: tempRoot,
        env: process.env,
      });

      try {
        expect(client.cancel("cursor-session-1")).toBeUndefined();

        let recorded = "";
        for (let attempt = 0; attempt < 100 && !recorded.trim(); attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          recorded = await readFile(recordPath, "utf8").catch(() => "");
        }

        expect(JSON.parse(recorded.trim())).toEqual({
          jsonrpc: "2.0",
          method: "session/cancel",
          params: { sessionId: "cursor-session-1" },
        });
      } finally {
        client.close();
      }

      // After close the client is inert; cancel must not throw.
      expect(() => client.cancel("cursor-session-1")).not.toThrow();
    },
  );
});

describe("applyCursorSessionConfig reasoning", () => {
  const reasoningOption = {
    category: "thought_level",
    currentValue: "medium",
    id: "reasoning",
    options: ["low", "medium", "high", "extra-high"].map((value) => ({
      value,
    })),
  };

  for (const [effort, expected] of [
    ["high", "high"],
    ["xhigh", "extra-high"],
    // Sentinel's max is Cursor's top level.
    ["max", "extra-high"],
  ] as const) {
    it(`sends ${expected} for ${effort}`, async () => {
      const setSessionConfigOption = mock(async () => ({
        configOptions: [reasoningOption],
      }));

      await applyCursorSessionConfig({
        client: { setSessionConfigOption },
        configOptions: [reasoningOption],
        reasoningEffort: effort,
        sessionId: "session-1",
      });

      expect(setSessionConfigOption).toHaveBeenCalledWith({
        configId: "reasoning",
        sessionId: "session-1",
        value: expected,
      });
    });
  }
});
