import { afterEach, describe, expect, it, mock } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

const {
  parseClaudeShellLookupOutput,
  resetClaudeCodeRuntimeCache,
  resolveClaudeCodeRuntime,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./claude-sdk.ts?claude-sdk-test");

const originalPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = originalPath;
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
      process.env.PATH = `${tempRoot}${path.delimiter}${originalPath ?? ""}`;

      const resolved = await resolveClaudeCodeRuntime({ forceRefresh: true });

      expect(resolved.executablePath).toBe(executablePath);
      expect(resolved.env.PATH).toContain(tempRoot);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
