import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const originalEnv = {
  COPILOT_CLI_PATH: process.env.COPILOT_CLI_PATH,
  COPILOT_PATH: process.env.COPILOT_PATH,
  HOME: process.env.HOME,
  PATH: process.env.PATH,
  SENTINEL_COPILOT_PATH: process.env.SENTINEL_COPILOT_PATH,
  SHELL: process.env.SHELL,
};
const originalCwd = process.cwd();
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

const constructedClientOptions: unknown[] = [];
const clientStart = mock(async () => {});

class MockCopilotClient {
  constructor(options: unknown) {
    constructedClientOptions.push(options);
  }

  start = clientStart;
}

mock.module("server-only", () => ({}));
mock.module("@github/copilot-sdk", () => ({
  CopilotClient: MockCopilotClient,
  RuntimeConnection: {
    forStdio: (options: Record<string, unknown>) => ({
      kind: "stdio",
      ...options,
    }),
  },
}));
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
  buildCopilotClientOptions,
  buildCopilotThreadState,
  getCopilotClientManager,
  normalizeCopilotErrorMessage,
  parseCopilotShellLookupOutput,
  resetCopilotRuntimeCache,
  resolveCopilotRuntime,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./copilot-sdk.ts?copilot-sdk-test");
const { getCopilotRuntimePlatform } =
  await import("./copilot-sdk/bundled-runtime");

// Lays out `@github/copilot-sdk-<host platform>` the way the SDK publishes it.
async function writeBundledCopilotRuntime(rootPath: string) {
  const runtimePlatform = getCopilotRuntimePlatform();
  if (!runtimePlatform) {
    throw new Error("No Copilot runtime platform for this test host.");
  }

  const packageRoot = path.join(
    rootPath,
    "node_modules",
    "@github",
    `copilot-sdk-${runtimePlatform}`,
  );
  const prebuildRoot = path.join(packageRoot, "prebuilds", runtimePlatform);
  const cliPath = path.join(
    prebuildRoot,
    runtimePlatform.startsWith("win32")
      ? "copilot-runtime.exe"
      : "copilot-runtime",
  );
  await mkdir(prebuildRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name: `@github/copilot-sdk-${runtimePlatform}` }),
  );
  await writeFile(cliPath, "#!/bin/sh\nexit 0\n");
  await writeFile(path.join(prebuildRoot, "runtime.node"), "native");
  if (process.platform !== "win32") {
    await chmod(cliPath, 0o755);
  }

  return cliPath;
}

function clearCopilotPathOverrides() {
  delete process.env.SENTINEL_COPILOT_PATH;
  delete process.env.COPILOT_CLI_PATH;
  delete process.env.COPILOT_PATH;
}

async function writeLaunchableCopilotScript(
  rootPath: string,
  relativePath: string,
) {
  const scriptPath = path.join(rootPath, relativePath);
  await writeFile(
    scriptPath,
    process.platform === "win32"
      ? "@echo off\r\necho copilot help\r\n"
      : "#!/bin/sh\nprintf 'copilot help\\n'\n",
    "utf8",
  );

  if (process.platform !== "win32") {
    await chmod(scriptPath, 0o755);
  }

  return scriptPath;
}

async function writeCopilotJsEntrypoint(
  rootPath: string,
  relativePath: string,
) {
  const entrypointPath = path.join(rootPath, relativePath);
  await writeFile(
    entrypointPath,
    "if (process.argv.includes('--help')) process.exit(0);\nprocess.exit(0);\n",
    "utf8",
  );
  return entrypointPath;
}

async function writeFailingCopilotScript(
  rootPath: string,
  relativePath: string,
) {
  const scriptPath = path.join(rootPath, relativePath);
  await mkdir(path.dirname(scriptPath), { recursive: true });
  await writeFile(
    scriptPath,
    process.platform === "win32"
      ? "@echo off\r\necho Failed to extract bundled package 1>&2\r\nexit /b 1\r\n"
      : "#!/bin/sh\nprintf 'Failed to extract bundled package\\n' >&2\nexit 1\n",
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
  process.chdir(originalCwd);

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }

  setLocalRuntimeEnvValueMock.mockClear();
  clientStart.mockReset();
  clientStart.mockImplementation(async () => {});
  constructedClientOptions.length = 0;
  resetCopilotRuntimeCache();
});

describe("normalizeCopilotErrorMessage", () => {
  it("returns an actionable Node.js version error for unsupported runtimes", () => {
    expect(
      normalizeCopilotErrorMessage(
        new Error("GitHub Copilot CLI requires Node.js v24 or newer."),
      ),
    ).toContain("newer Node.js runtime");
  });

  it("returns an actionable Node.js version error for missing node:sqlite support", () => {
    expect(
      normalizeCopilotErrorMessage(
        new Error(
          "Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite",
        ),
      ),
    ).toContain("newer Node.js runtime");
  });
});

describe("parseCopilotShellLookupOutput", () => {
  it("extracts both the copilot executable path and the shell PATH", () => {
    expect(
      parseCopilotShellLookupOutput(`
        noise
        __SENTINEL_COPILOT_PATH_START__
        /opt/homebrew/bin/copilot
        __SENTINEL_COPILOT_PATH_END__
        __SENTINEL_COPILOT_SHELL_PATH_START__
        /opt/homebrew/bin:/usr/local/bin:/usr/bin
        __SENTINEL_COPILOT_SHELL_PATH_END__
      `),
    ).toEqual({
      copilotPath: "/opt/homebrew/bin/copilot",
      pathValue: "/opt/homebrew/bin:/usr/local/bin:/usr/bin",
    });
  });
});

describe("resolveCopilotRuntime", () => {
  it("uses SENTINEL_COPILOT_PATH when it points to a launchable binary", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "copilot-sdk-runtime-test-"),
    );
    tempRoots.push(tempRoot);
    const executableName =
      process.platform === "win32" ? "copilot.cmd" : "copilot";
    const scriptPath = await writeLaunchableCopilotScript(
      tempRoot,
      executableName,
    );

    process.env.SENTINEL_COPILOT_PATH = scriptPath;
    delete process.env.COPILOT_CLI_PATH;
    delete process.env.COPILOT_PATH;
    resetCopilotRuntimeCache();

    const runtime = await resolveCopilotRuntime();

    expect(runtime.cliDetected).toBe(true);
    expect(runtime.cliPath).toBe(scriptPath);
    expect(runtime.source).toBe("env_override");
    expect(process.env.SENTINEL_COPILOT_PATH).toBe(scriptPath);
  });

  it("prefers an override over the bundled runtime without persisting COPILOT_CLI_PATH", async () => {
    const tempRoot = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "copilot-sdk-runtime-cli-path-")),
    );
    tempRoots.push(tempRoot);
    await writeBundledCopilotRuntime(tempRoot);
    const scriptPath = await writeLaunchableCopilotScript(
      tempRoot,
      process.platform === "win32" ? "copilot.cmd" : "copilot",
    );

    process.chdir(tempRoot);
    clearCopilotPathOverrides();
    process.env.COPILOT_CLI_PATH = scriptPath;
    resetCopilotRuntimeCache();

    const runtime = await resolveCopilotRuntime();

    expect(runtime.cliPath).toBe(scriptPath);
    expect(runtime.source).toBe("env_override");
    expect(setLocalRuntimeEnvValueMock).not.toHaveBeenCalled();
    expect(process.env.SENTINEL_COPILOT_PATH).toBeUndefined();
  });

  it("uses the SDK's bundled platform runtime when no override is set", async () => {
    const tempRoot = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "copilot-sdk-runtime-bundled-")),
    );
    tempRoots.push(tempRoot);
    const bundledCliPath = await writeBundledCopilotRuntime(tempRoot);
    // A user-installed copilot on PATH loses to the bundled runtime.
    const binRoot = path.join(tempRoot, "bin");
    await mkdir(binRoot);
    await writeLaunchableCopilotScript(
      binRoot,
      process.platform === "win32" ? "copilot.cmd" : "copilot",
    );

    process.chdir(tempRoot);
    process.env.HOME = tempRoot;
    process.env.PATH = binRoot;
    clearCopilotPathOverrides();
    resetCopilotRuntimeCache();

    const runtime = await resolveCopilotRuntime();

    expect(runtime).toMatchObject({
      cliDetected: true,
      cliPath: bundledCliPath,
      error: null,
      source: "bundled",
    });
    expect(setLocalRuntimeEnvValueMock).not.toHaveBeenCalled();
    expect(process.env.SENTINEL_COPILOT_PATH).toBeUndefined();
  });

  it("falls back to a user-installed copilot without persisting its path", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "copilot-sdk-runtime-user-cli-")),
    );
    tempRoots.push(tempRoot);
    const binRoot = path.join(tempRoot, "bin");
    await mkdir(binRoot);
    const scriptPath = await writeLaunchableCopilotScript(binRoot, "copilot");

    process.chdir(tempRoot);
    process.env.HOME = tempRoot;
    process.env.PATH = binRoot;
    clearCopilotPathOverrides();
    resetCopilotRuntimeCache();

    const runtime = await resolveCopilotRuntime();

    expect(runtime.cliPath).toBe(scriptPath);
    expect(runtime.source).toBe("user_cli");
    expect(setLocalRuntimeEnvValueMock).not.toHaveBeenCalled();
    expect(process.env.SENTINEL_COPILOT_PATH).toBeUndefined();
  });

  it("accepts a JS CLI entrypoint when explicitly configured", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "copilot-sdk-runtime-js-test-"),
    );
    tempRoots.push(tempRoot);
    const entrypointPath = await writeCopilotJsEntrypoint(
      tempRoot,
      "copilot.js",
    );

    process.env.SENTINEL_COPILOT_PATH = entrypointPath;
    delete process.env.COPILOT_CLI_PATH;
    delete process.env.COPILOT_PATH;
    resetCopilotRuntimeCache();

    const runtime = await resolveCopilotRuntime();

    expect(runtime.cliDetected).toBe(true);
    expect(runtime.cliPath).toBe(entrypointPath);
    expect(process.env.SENTINEL_COPILOT_PATH).toBe(entrypointPath);
  });

  it("resolves a relative workspace Copilot path even when the probe exits non-zero", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "copilot-sdk-runtime-relative-test-"),
    );
    tempRoots.push(tempRoot);
    const relativePath =
      process.platform === "win32"
        ? "node_modules\\.bin\\copilot.cmd"
        : "node_modules/.bin/copilot";
    const scriptPath = await writeFailingCopilotScript(tempRoot, relativePath);

    process.chdir(tempRoot);
    process.env.HOME = tempRoot;
    process.env.PATH = process.platform === "win32" ? "" : "/usr/bin:/bin";
    process.env.SENTINEL_COPILOT_PATH = relativePath;
    delete process.env.COPILOT_CLI_PATH;
    delete process.env.COPILOT_PATH;
    resetCopilotRuntimeCache();

    const runtime = await resolveCopilotRuntime();
    const canonicalScriptPath = await realpath(scriptPath);

    expect(runtime.cliDetected).toBe(true);
    expect(runtime.cliPath).toBe(canonicalScriptPath);
    expect(process.env.SENTINEL_COPILOT_PATH).toBe(canonicalScriptPath);
  });
});

describe("buildCopilotClientOptions", () => {
  it("spawns the resolved runtime over stdio with the SDK 1.x options", () => {
    const options = buildCopilotClientOptions({
      env: { DROPPED: undefined, HOME: "/home/user", PATH: "/usr/bin" },
      runtimePath: "/opt/copilot/copilot-runtime",
    });

    expect(options).toEqual({
      clientInfo: { applicationName: "sentinel" },
      connection: {
        env: { HOME: "/home/user", PATH: "/usr/bin" },
        kind: "stdio",
        path: "/opt/copilot/copilot-runtime",
      },
      logLevel: "error",
      workingDirectory: process.cwd(),
    });
    // Nothing else: the SDK 1.x client has no CLI path, cwd or top-level env
    // (env cannot be set on both the client and the connection).
    expect(Object.keys(options).sort()).toEqual([
      "clientInfo",
      "connection",
      "logLevel",
      "workingDirectory",
    ]);
  });
});

describe("getCopilotClientManager", () => {
  it("reuses one client, starts it on every use and rebuilds it after a failed start", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "copilot-sdk-client-manager-"),
    );
    tempRoots.push(tempRoot);
    process.env.SENTINEL_COPILOT_PATH = await writeLaunchableCopilotScript(
      tempRoot,
      process.platform === "win32" ? "copilot.cmd" : "copilot",
    );
    resetCopilotRuntimeCache();

    const manager = getCopilotClientManager();
    const first = await manager.getClient();
    const second = await manager.getClient();

    expect(second).toBe(first);
    expect(constructedClientOptions).toHaveLength(1);
    expect(clientStart).toHaveBeenCalledTimes(2);

    clientStart.mockImplementationOnce(async () => {
      throw new Error("runtime exited");
    });
    await expect(manager.getClient()).rejects.toThrow("runtime exited");

    const rebuilt = await manager.getClient();
    expect(rebuilt).not.toBe(first);
    expect(constructedClientOptions).toHaveLength(2);
  });
});

describe("buildCopilotThreadState", () => {
  it("preserves the normalized reasoning effort stored for Copilot threads", () => {
    expect(
      buildCopilotThreadState({
        cwd: "/workspace",
        modelId: "gpt-5",
        reasoningEffort: "low",
        sessionId: "session-1",
      }),
    ).toEqual({
      cwd: "/workspace",
      modelId: "gpt-5",
      reasoningEffort: "low",
      sessionId: "session-1",
    });
  });
});
