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

// desktop.env as an older Sentinel left it.
let savedDesktopEnv: Record<string, string> = {};
const readLocalRuntimeEnvValueMock = mock(
  async (key: string) => savedDesktopEnv[key] ?? null,
);

const constructedClientOptions: unknown[] = [];
const clientStart = mock(async () => {});

const clientStop = mock(async (): Promise<Error[]> => []);

class MockCopilotClient {
  constructor(options: unknown) {
    constructedClientOptions.push(options);
  }

  forceStop = mock(async () => {});
  start = clientStart;
  stop = clientStop;
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
  readLocalRuntimeEnvValue: readLocalRuntimeEnvValueMock,
  setLocalRuntimeEnvValue: setLocalRuntimeEnvValueMock,
}));

const {
  buildCopilotClientOptions,
  buildCopilotThreadState,
  getCopilotClientManager,
  normalizeCopilotErrorMessage,
  parseCopilotShellLookupOutput,
  resetCopilotRuntimeCache,
  resolveCopilotLoginCli,
  resolveCopilotRuntime,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./copilot-sdk.ts?copilot-sdk-test");
const { retireInstanceResources } =
  await import("./platform/instance-resources");
const { getInstanceRuntimeKey } =
  await import("./platform/runtime/resolve-binary");
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
  savedDesktopEnv = {};
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
    expect(setLocalRuntimeEnvValueMock).not.toHaveBeenCalled();
  });

  it("ranks a SENTINEL_COPILOT_PATH saved in desktop.env after the bundled runtime", async () => {
    const tempRoot = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "copilot-sdk-runtime-saved-")),
    );
    tempRoots.push(tempRoot);
    const bundledCliPath = await writeBundledCopilotRuntime(tempRoot);
    const binRoot = path.join(tempRoot, "bin");
    await mkdir(binRoot);
    const scriptPath = await writeLaunchableCopilotScript(
      binRoot,
      process.platform === "win32" ? "copilot.cmd" : "copilot",
    );

    process.chdir(tempRoot);
    clearCopilotPathOverrides();
    // An older Sentinel saved the CLI it found; desktop.env loads it back.
    savedDesktopEnv = { SENTINEL_COPILOT_PATH: scriptPath };
    process.env.SENTINEL_COPILOT_PATH = scriptPath;
    resetCopilotRuntimeCache();

    expect(await resolveCopilotRuntime()).toMatchObject({
      cliDetected: true,
      cliPath: bundledCliPath,
      source: "bundled",
    });

    // Without a bundled runtime the saved CLI is still used.
    await rm(path.join(tempRoot, "node_modules"), {
      force: true,
      recursive: true,
    });
    process.env.HOME = tempRoot;
    process.env.PATH = process.platform === "win32" ? "" : "/usr/bin:/bin";
    resetCopilotRuntimeCache();

    expect(await resolveCopilotRuntime()).toMatchObject({
      cliDetected: true,
      cliPath: scriptPath,
      source: "user_cli",
    });
    expect(setLocalRuntimeEnvValueMock).not.toHaveBeenCalled();
  });

  it("treats a SENTINEL_COPILOT_PATH other than the saved one as an override", async () => {
    const tempRoot = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "copilot-sdk-runtime-explicit-")),
    );
    tempRoots.push(tempRoot);
    await writeBundledCopilotRuntime(tempRoot);
    const scriptPath = await writeLaunchableCopilotScript(
      tempRoot,
      process.platform === "win32" ? "copilot.cmd" : "copilot",
    );

    process.chdir(tempRoot);
    clearCopilotPathOverrides();
    savedDesktopEnv = {
      SENTINEL_COPILOT_PATH: path.join(tempRoot, "old", "copilot"),
    };
    process.env.SENTINEL_COPILOT_PATH = scriptPath;
    resetCopilotRuntimeCache();

    expect(await resolveCopilotRuntime()).toMatchObject({
      cliPath: scriptPath,
      source: "env_override",
    });
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
    // The override is used as given; nothing is written back.
    expect(process.env.SENTINEL_COPILOT_PATH).toBe(relativePath);
    expect(setLocalRuntimeEnvValueMock).not.toHaveBeenCalled();
  });
});

describe("resolveCopilotLoginCli", () => {
  it("finds the user's own copilot next to the bundled runtime, which cannot sign in", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "copilot-sdk-login-cli-")),
    );
    tempRoots.push(tempRoot);
    const bundledCliPath = await writeBundledCopilotRuntime(tempRoot);
    const binRoot = path.join(tempRoot, "bin");
    await mkdir(binRoot);
    const userCliPath = await writeLaunchableCopilotScript(binRoot, "copilot");

    process.chdir(tempRoot);
    process.env.HOME = tempRoot;
    process.env.PATH = binRoot;
    clearCopilotPathOverrides();
    resetCopilotRuntimeCache();

    expect((await resolveCopilotRuntime()).cliPath).toBe(bundledCliPath);
    const loginCli = await resolveCopilotLoginCli();
    expect(loginCli).toMatchObject({
      cliPath: userCliPath,
      nodeScript: false,
    });
    expect(loginCli?.env.PATH?.split(path.delimiter)[0]).toBe(binRoot);
  });

  it("uses the instance's runtime when it is a CLI, under Node for a script", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "copilot-sdk-login-cli-js-"),
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

    await expect(resolveCopilotLoginCli()).resolves.toMatchObject({
      cliPath: entrypointPath,
      nodeScript: true,
    });
  });
});

describe("resolveCopilotRuntime for an instance", () => {
  it("prefers a non-default instance's binaryPath over the bundled runtime and ignores legacy overrides", async () => {
    const tempRoot = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "copilot-sdk-runtime-instance-")),
    );
    tempRoots.push(tempRoot);
    await writeBundledCopilotRuntime(tempRoot);
    const workBin = path.join(tempRoot, "work");
    await mkdir(workBin);
    const configured = await writeLaunchableCopilotScript(
      workBin,
      process.platform === "win32" ? "copilot.cmd" : "copilot",
    );

    process.chdir(tempRoot);
    clearCopilotPathOverrides();
    process.env.COPILOT_CLI_PATH = path.join(tempRoot, "legacy", "copilot");
    resetCopilotRuntimeCache();

    const instance = {
      config: { binaryPath: configured },
      envOverrides: { COPILOT_HOME: path.join(tempRoot, "home") },
      envUnset: [],
      id: "copilot-work",
      isDefault: false,
    };
    expect(await resolveCopilotRuntime({ instance })).toMatchObject({
      cliDetected: true,
      cliPath: configured,
      env: expect.objectContaining({
        COPILOT_HOME: path.join(tempRoot, "home"),
      }),
      installSource: "config",
      source: "env_override",
    });

    // Without a binaryPath the instance skips the legacy variables.
    expect(
      await resolveCopilotRuntime({
        instance: { ...instance, config: {}, id: "copilot-other" },
      }),
    ).toMatchObject({ installSource: "sdk-bundled", source: "bundled" });
    expect(setLocalRuntimeEnvValueMock).not.toHaveBeenCalled();
  });
});

describe("buildCopilotClientOptions", () => {
  it("spawns the resolved runtime over stdio with the SDK 1.x options", () => {
    const options = buildCopilotClientOptions({
      env: {
        DROPPED: undefined,
        ENCRYPTION_KEY: "a".repeat(64),
        HOME: "/home/user",
        PATH: "/usr/bin",
      },
      runtimePath: "/opt/copilot/copilot-runtime",
    });

    expect(options).toEqual({
      clientInfo: { applicationName: "sentinel" },
      connection: {
        // Unset values and Sentinel's ENCRYPTION_KEY are left out.
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

describe("per-instance Copilot clients", () => {
  it("gives an instance its own client, home and runtime, and stops replaced ones", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "copilot-sdk-instance-client-"),
    );
    tempRoots.push(tempRoot);
    const binaryPath = await writeLaunchableCopilotScript(
      tempRoot,
      process.platform === "win32" ? "copilot.cmd" : "copilot",
    );
    const work = {
      config: { binaryPath },
      envOverrides: { COPILOT_HOME: path.join(tempRoot, "home-work") },
      envUnset: [],
      id: "copilot-work",
      isDefault: false,
    };

    const manager = getCopilotClientManager(work);
    expect(getCopilotClientManager(work)).toBe(manager);
    expect(manager).not.toBe(getCopilotClientManager());

    await manager.getClient();
    expect(constructedClientOptions.at(-1)).toEqual(
      expect.objectContaining({
        baseDirectory: path.join(tempRoot, "home-work"),
        connection: expect.objectContaining({
          env: expect.objectContaining({
            COPILOT_HOME: path.join(tempRoot, "home-work"),
          }),
          path: binaryPath,
        }),
      }),
    );

    clientStop.mockClear();
    const moved = {
      ...work,
      envOverrides: { COPILOT_HOME: path.join(tempRoot, "home-moved") },
    };
    expect(getCopilotClientManager(moved)).not.toBe(manager);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Only handling the instance change ends the old runtime.
    expect(clientStop).not.toHaveBeenCalled();
    expect(getCopilotClientManager(work)).toBe(manager);

    await retireInstanceResources(work.id, getInstanceRuntimeKey(moved));
    expect(clientStop).toHaveBeenCalledTimes(1);
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
