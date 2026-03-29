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

mock.module("server-only", () => ({}));

const {
  parseShellLookupOutput,
  resetCodexCliResolutionCache,
  resolveCodexCli,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./codex-cli.ts?codex-cli-test");

const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalSentinelCodexPath = process.env.SENTINEL_CODEX_PATH;

afterEach(async () => {
  process.env.PATH = originalPath;
  process.env.HOME = originalHome;
  if (originalSentinelCodexPath) {
    process.env.SENTINEL_CODEX_PATH = originalSentinelCodexPath;
  } else {
    delete process.env.SENTINEL_CODEX_PATH;
  }
  resetCodexCliResolutionCache();
});

describe("parseShellLookupOutput", () => {
  it("extracts the codex path and shell PATH markers even with extra shell noise", () => {
    const parsed = parseShellLookupOutput(`
Welcome to zsh
__SENTINEL_CODEX_PATH_START__
/Users/test/.local/state/fnm_multishells/123/bin/codex
__SENTINEL_CODEX_PATH_END__
some extra line
__SENTINEL_PATH_START__
/Users/test/.local/state/fnm_multishells/123/bin:/opt/homebrew/bin:/usr/bin
__SENTINEL_PATH_END__
`);

    expect(parsed).toEqual({
      codexPath: "/Users/test/.local/state/fnm_multishells/123/bin/codex",
      pathValue:
        "/Users/test/.local/state/fnm_multishells/123/bin:/opt/homebrew/bin:/usr/bin",
    });
  });
});

describe("resolveCodexCli", () => {
  it("detects codex directly from the current PATH", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));
    const executablePath = path.join(tempRoot, "codex");

    try {
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      process.env.HOME = tempRoot;
      process.env.PATH = `${tempRoot}${path.delimiter}${originalPath ?? ""}`;

      const resolved = await resolveCodexCli({ forceRefresh: true });

      expect(resolved).not.toBeNull();
      expect(resolved?.command).toBe(executablePath);
      expect(process.env.SENTINEL_CODEX_PATH).toBe(executablePath);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("detects codex from common user bin locations when PATH is stripped", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));
    const bunBinRoot = path.join(tempRoot, ".bun", "bin");
    const executablePath = path.join(bunBinRoot, "codex");

    try {
      await mkdir(bunBinRoot, { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      process.env.HOME = tempRoot;
      process.env.PATH = "/usr/bin:/bin";

      const resolved = await resolveCodexCli({ forceRefresh: true });
      const savedEnv = await readFile(
        path.join(tempRoot, ".sentinel", "desktop.env"),
        "utf8",
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.command).toBe(executablePath);
      expect(resolved?.env.PATH).toContain(bunBinRoot);
      expect(process.env.SENTINEL_CODEX_PATH).toBe(executablePath);
      expect(savedEnv).toContain(`SENTINEL_CODEX_PATH="${executablePath}"`);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
