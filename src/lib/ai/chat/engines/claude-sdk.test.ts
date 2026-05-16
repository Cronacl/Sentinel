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

afterEach(async () => {
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
});
