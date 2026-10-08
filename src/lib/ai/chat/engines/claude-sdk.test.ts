import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const setLocalRuntimeEnvValueMock = mock(
  async (key: string, value: string | null | undefined) => {
    const normalizedValue = value?.trim() ?? "";
    if (normalizedValue) {
      process.env[key] = normalizedValue;
    } else {
      delete process.env[key];
    }

    const homePath = process.env.HOME;
    if (!homePath) {
      return;
    }

    const envDir = path.join(homePath, ".sentinel");
    const envPath = path.join(envDir, "desktop.env");
    await mkdir(envDir, { recursive: true });

    let current = "";
    try {
      current = await readFile(envPath, "utf8");
    } catch {
      current = "";
    }

    const nextLines = current
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith(`${key}=`));
    if (normalizedValue) {
      const escapedValue = normalizedValue
        .replaceAll("\\", "\\\\")
        .replaceAll('"', '\\"');
      nextLines.push(`${key}="${escapedValue}"`);
    }

    await writeFile(
      envPath,
      nextLines.length > 0 ? `${nextLines.join("\n")}\n` : "",
      "utf8",
    );
  },
);

mock.module("server-only", () => ({}));
mock.module("@/lib/runtime/local-runtime-env", () => ({
  setLocalRuntimeEnvValue: setLocalRuntimeEnvValueMock,
}));

const {
  buildClaudeSdkBaseOptions,
  getClaudeExecutableNames,
  parseClaudeShellLookupOutput,
  resetClaudeCodeRuntimeCache,
  resolveClaudeCodeRuntime,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./claude-sdk.ts?claude-sdk-test");

const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalSentinelClaudePath = process.env.SENTINEL_CLAUDE_PATH;
const originalClaudePath = process.env.CLAUDE_PATH;
const originalSentinelStatePath = process.env.SENTINEL_STATE_PATH;
const originalTestMarker = process.env.SENTINEL_CLAUDE_TEST_MARKER;

afterEach(async () => {
  if (originalTestMarker) {
    process.env.SENTINEL_CLAUDE_TEST_MARKER = originalTestMarker;
  } else {
    delete process.env.SENTINEL_CLAUDE_TEST_MARKER;
  }
  process.env.PATH = originalPath;
  process.env.HOME = originalHome;
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
  setLocalRuntimeEnvValueMock.mockClear();
  resetClaudeCodeRuntimeCache();
});

describe("parseClaudeShellLookupOutput", () => {
  it("extracts the Claude path and shell PATH markers even with extra shell noise", () => {
    const parsed = parseClaudeShellLookupOutput(`
Welcome to zsh
__SENTINEL_CLAUDE_PATH_START__
/Users/test/.local/bin/claude
__SENTINEL_CLAUDE_PATH_END__
startup banner
__SENTINEL_CLAUDE_SHELL_PATH_START__
/Users/test/.local/bin:/opt/homebrew/bin:/usr/bin
__SENTINEL_CLAUDE_SHELL_PATH_END__
`);

    expect(parsed).toEqual({
      claudePath: "/Users/test/.local/bin/claude",
      pathValue: "/Users/test/.local/bin:/opt/homebrew/bin:/usr/bin",
    });
  });
});

describe("resolveClaudeCodeRuntime", () => {
  it("detects claude directly from the current PATH", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));
    const executablePath = path.join(tempRoot, "claude");

    try {
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      process.env.HOME = tempRoot;
      process.env.PATH = `${tempRoot}${path.delimiter}${originalPath ?? ""}`;
      delete process.env.SENTINEL_STATE_PATH;

      const resolved = await resolveClaudeCodeRuntime({ forceRefresh: true });

      expect(resolved.executablePath).toBe(executablePath);
      expect(resolved.binaryDetected).toBe(true);
      expect(resolved.binaryVersion).toBeNull();
      expect(resolved.env.PATH).toContain(tempRoot);
      expect(process.env.SENTINEL_CLAUDE_PATH).toBe(executablePath);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("detects claude from common user bin locations when PATH is stripped", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));
    const bunBinRoot = path.join(tempRoot, ".bun", "bin");
    const executablePath = path.join(bunBinRoot, "claude");

    try {
      await mkdir(bunBinRoot, { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      process.env.HOME = tempRoot;
      process.env.PATH = "/usr/bin:/bin";
      delete process.env.SENTINEL_STATE_PATH;

      const resolved = await resolveClaudeCodeRuntime({ forceRefresh: true });
      const savedEnv = await readFile(
        path.join(tempRoot, ".sentinel", "desktop.env"),
        "utf8",
      );

      expect(resolved.executablePath).toBe(executablePath);
      expect(resolved.binaryDetected).toBe(true);
      expect(resolved.env.PATH).toContain(bunBinRoot);
      expect(process.env.SENTINEL_CLAUDE_PATH).toBe(executablePath);
      expect(savedEnv).toContain(`SENTINEL_CLAUDE_PATH="${executablePath}"`);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("retains a stale override when the configured claude binary cannot run", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));
    const executablePath = path.join(tempRoot, "claude");

    try {
      await writeFile(executablePath, "#!/bin/sh\nexit 1\n", "utf8");
      await chmod(executablePath, 0o755);
      process.env.HOME = tempRoot;
      process.env.PATH = "/usr/bin:/bin";
      process.env.SENTINEL_CLAUDE_PATH = executablePath;
      delete process.env.CLAUDE_PATH;
      delete process.env.SENTINEL_STATE_PATH;

      const resolved = await resolveClaudeCodeRuntime({ forceRefresh: true });

      expect(resolved.binaryDetected).toBe(false);
      expect(resolved.binaryVersion).toBeNull();
      expect(resolved.executablePath).toBeNull();
      expect(process.env.SENTINEL_CLAUDE_PATH).toBe(executablePath);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("verifies an npm node shim through process.execPath when PATH has no node", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));
    const executablePath = path.join(tempRoot, "claude");

    try {
      await writeFile(
        executablePath,
        [
          "#!/usr/bin/env node",
          'console.log("2.1.292 (Claude Code) " + (process.env.ELECTRON_RUN_AS_NODE ?? "direct"));',
          "",
        ].join("\n"),
        "utf8",
      );
      await chmod(executablePath, 0o755);
      process.env.HOME = tempRoot;
      process.env.PATH = tempRoot;
      process.env.SENTINEL_CLAUDE_PATH = executablePath;
      delete process.env.CLAUDE_PATH;
      delete process.env.SENTINEL_STATE_PATH;

      const resolved = await resolveClaudeCodeRuntime({ forceRefresh: true });

      expect(resolved.executablePath).toBe(executablePath);
      expect(resolved.binaryVersion).toBe("2.1.292 (Claude Code) 1");
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});

describe("resolveClaudeCodeRuntime for an instance", () => {
  it("verifies a non-default instance's binaryPath under the instance env", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));
    const configured = path.join(tempRoot, "work", "claude");

    try {
      await mkdir(path.dirname(configured), { recursive: true });
      await writeFile(
        configured,
        '#!/bin/sh\necho "2.1.300 (Claude Code) $CLAUDE_CONFIG_DIR"\n',
        "utf8",
      );
      await chmod(configured, 0o755);
      process.env.HOME = tempRoot;
      process.env.SENTINEL_CLAUDE_PATH = "/somewhere/else/claude";
      delete process.env.SENTINEL_STATE_PATH;

      const resolved = await resolveClaudeCodeRuntime({
        forceRefresh: true,
        instance: {
          config: { binaryPath: configured },
          envOverrides: { CLAUDE_CONFIG_DIR: "/homes/claude-work" },
          envUnset: [],
          id: "claude-work",
          isDefault: false,
        },
      });

      expect(resolved).toEqual(
        expect.objectContaining({
          binaryDetected: true,
          binaryVersion: "2.1.300 (Claude Code) /homes/claude-work",
          executablePath: configured,
          source: "config",
        }),
      );
      expect(resolved.env.CLAUDE_CONFIG_DIR).toBe("/homes/claude-work");
      expect(setLocalRuntimeEnvValueMock).not.toHaveBeenCalled();
      expect(process.env.SENTINEL_CLAUDE_PATH).toBe("/somewhere/else/claude");
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});

describe("getClaudeExecutableNames", () => {
  it("only looks for PATHEXT names on Windows, so npm's sh script is skipped", () => {
    expect(
      getClaudeExecutableNames("claude", {
        pathExt: ".COM;.EXE;.BAT;.CMD",
        platform: "win32",
      }),
    ).toEqual(["claude.COM", "claude.EXE", "claude.BAT", "claude.CMD"]);
    expect(
      getClaudeExecutableNames("claude.cmd", {
        pathExt: ".EXE;.CMD",
        platform: "win32",
      }),
    ).toEqual(["claude.cmd"]);
    expect(getClaudeExecutableNames("claude", { platform: "darwin" })).toEqual([
      "claude",
    ]);
  });
});

describe("buildClaudeSdkBaseOptions", () => {
  it("merges the runtime env over process.env because options.env replaces it", () => {
    process.env.SENTINEL_CLAUDE_TEST_MARKER = "inherited";

    const options = buildClaudeSdkBaseOptions({
      env: { PATH: "/managed/bin" },
    });

    expect(options.env).toEqual(
      expect.objectContaining({
        CLAUDE_AGENT_SDK_CLIENT_APP: "sentinel",
        PATH: "/managed/bin",
        SENTINEL_CLAUDE_TEST_MARKER: "inherited",
      }),
    );
  });

  it("always sets a permission mode and keeps the Task tools available", () => {
    const options = buildClaudeSdkBaseOptions({
      allowedTools: ["Read"],
    });

    expect(options.permissionMode).toBe("default");
    expect(options.tools).toEqual({ preset: "claude_code", type: "preset" });
    expect(options.allowedTools).toEqual([
      "TaskCreate",
      "TaskGet",
      "TaskList",
      "TaskUpdate",
      "Read",
    ]);
    expect(
      buildClaudeSdkBaseOptions({ permissionMode: "plan" }).permissionMode,
    ).toBe("plan");
  });

  it("never pre-approves Grep or Glob, so searches outside the workspace still reach canUseTool", () => {
    // Chat mode: default permissions with the sandbox on.
    const chatOptions = buildClaudeSdkBaseOptions({
      permissionMode: "default",
      sandbox: { enabled: true, failIfUnavailable: false },
    });
    const planOptions = buildClaudeSdkBaseOptions({ permissionMode: "plan" });

    for (const options of [chatOptions, planOptions]) {
      expect(options.allowedTools).not.toContain("Grep");
      expect(options.allowedTools).not.toContain("Glob");
      // The preset stays whole: no explicit list that could drop tools.
      expect(options.tools).toEqual({ preset: "claude_code", type: "preset" });
    }
  });

  it("installs Sentinel's spawner only for Node-script CLIs", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-claude-"));
    const nativePath = path.join(tempRoot, "claude");

    try {
      await writeFile(nativePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(nativePath, 0o755);

      expect(
        buildClaudeSdkBaseOptions({ pathToClaudeCodeExecutable: nativePath })
          .spawnClaudeCodeProcess,
      ).toBeUndefined();
      expect(
        buildClaudeSdkBaseOptions({
          pathToClaudeCodeExecutable: path.join(tempRoot, "cli.js"),
        }).spawnClaudeCodeProcess,
      ).toBeFunction();
      expect(
        buildClaudeSdkBaseOptions().spawnClaudeCodeProcess,
      ).toBeUndefined();
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
