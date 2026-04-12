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

mock.module("server-only", () => ({}));
mock.module("@github/copilot-sdk", () => ({
  CopilotClient: class {},
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
  buildCopilotThreadState,
  normalizeCopilotErrorMessage,
  parseCopilotShellLookupOutput,
  resetCopilotRuntimeCache,
  resolveCopilotRuntime,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./copilot-sdk.ts?copilot-sdk-test");

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
    expect(process.env.SENTINEL_COPILOT_PATH).toBe(scriptPath);
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
