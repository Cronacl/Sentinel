import { afterAll, describe, expect, it, mock } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-commit-"));
const executablePath = path.join(tempRoot, "claude");
const argsPath = path.join(tempRoot, "args.json");

// A stand-in for the user's npm Claude Code shim: a node-shebang script that
// is not on PATH, so only the resolved runtime path can reach it.
await writeFile(
  executablePath,
  [
    "#!/usr/bin/env node",
    'const fs = require("node:fs");',
    "fs.readFileSync(0);",
    "fs.writeFileSync(process.env.SENTINEL_TEST_ARGS_PATH, JSON.stringify({",
    "  args: process.argv.slice(2),",
    "  clientApp: process.env.CLAUDE_AGENT_SDK_CLIENT_APP,",
    "  path: process.env.PATH,",
    "}));",
    "process.stdout.write(JSON.stringify({",
    '  structured_output: { body: "", subject: "Use the resolved Claude CLI" },',
    "}));",
    "",
  ].join("\n"),
  "utf8",
);
await chmod(executablePath, 0o755);

const resolveClaudeCodeRuntime = mock(async () => ({
  binaryDetected: true,
  binaryVersion: "2.1.292 (Claude Code)",
  env: {
    ...process.env,
    PATH: "/managed/bin",
    SENTINEL_TEST_ARGS_PATH: argsPath,
  },
  executablePath,
}));

mock.module("@/lib/ai/chat/engines/claude-sdk", async () => {
  const { buildClaudeCliLaunch } =
    await import("@/lib/ai/chat/engines/claude-sdk/executable");
  return { buildClaudeCliLaunch, resolveClaudeCodeRuntime };
});

const { generateClaudeCommitMessage } = await import("./commit-message");

afterAll(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

describe("generateClaudeCommitMessage with the resolved Claude CLI", () => {
  it("runs the binary Sentinel resolved, with its managed env, instead of `claude` from PATH", async () => {
    const result = await generateClaudeCommitMessage({
      context: {
        branch: "feature/claude",
        patch: "diff --git a/file.ts b/file.ts",
        repoRoot: tempRoot,
        summary: "M file.ts",
      },
      modelId: "claude-fable-5-1",
      reasoningEffort: "medium",
    });

    const recorded = JSON.parse(await readFile(argsPath, "utf8")) as {
      args: string[];
      clientApp: string;
      path: string;
    };
    expect(resolveClaudeCodeRuntime).toHaveBeenCalled();
    expect(recorded.args).toEqual(
      expect.arrayContaining([
        "-p",
        "--model",
        "claude-fable-5-1",
        "--effort",
        "medium",
      ]),
    );
    expect(recorded.clientApp).toBe("sentinel");
    expect(recorded.path).toBe("/managed/bin");
    expect(result.subject).toBe("Use the resolved Claude CLI");
  });
});
