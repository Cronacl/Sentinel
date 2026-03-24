import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  parseShellLookupOutput,
  resetCodexCliResolutionCache,
  resolveCodexCli,
} from "./codex-cli";

const originalPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = originalPath;
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
      process.env.PATH = `${tempRoot}${path.delimiter}${originalPath ?? ""}`;

      const resolved = await resolveCodexCli({ forceRefresh: true });

      expect(resolved).not.toBeNull();
      expect(resolved?.command).toBe(executablePath);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
