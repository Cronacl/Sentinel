import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { writeFile } from "node:fs/promises";
import { PassThrough } from "node:stream";

import {
  buildCommitMessagePrompt,
  formatCommitMessage,
  generateClaudeCommitMessage,
  generateCodexCommitMessage,
  parseCommitMessage,
  sanitizeCommitSubject,
} from "./commit-message";

function createFakeChildProcess(options?: {
  exitCode?: number;
  stderr?: string;
  stdout?: string;
}) {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let input = "";

  const child = {
    kill: () => undefined,
    on: (
      event: "close" | "error",
      listener: ((code: number | null) => void) | ((error: Error) => void),
    ) => {
      emitter.on(event, listener as (...args: unknown[]) => void);
    },
    stderr,
    stdin: {
      end: (chunk?: string) => {
        input += chunk ?? "";
        if (options?.stdout) {
          stdout.write(options.stdout);
        }
        if (options?.stderr) {
          stderr.write(options.stderr);
        }
        stdout.end();
        stderr.end();
        queueMicrotask(() => {
          emitter.emit("close", options?.exitCode ?? 0);
        });
      },
    },
    stdout,
  };

  return {
    child,
    getInput: () => input,
  };
}

describe("buildCommitMessagePrompt", () => {
  it("includes branch, summary, patch, and truncation markers", () => {
    const result = buildCommitMessagePrompt({
      branch: "feature/commit-message",
      patch: `${"diff\n".repeat(20_000)}tail`,
      summary: "M README.md",
    });

    expect(result).toContain("Branch: feature/commit-message");
    expect(result).toContain("Changed files:");
    expect(result).toContain("Working tree patch:");
    expect(result).toContain("M README.md");
    expect(result).toContain("[truncated]");
    expect(result).toContain("Return a JSON object with keys: subject, body.");
  });
});

describe("commit message formatting", () => {
  it("formats and parses subject/body pairs", () => {
    const message = formatCommitMessage("Update repository.", "- add tests");
    expect(message).toBe("Update repository\n\n- add tests");
    expect(parseCommitMessage(message)).toEqual({
      body: "- add tests",
      subject: "Update repository",
    });
  });

  it("sanitizes subjects to one line without trailing periods", () => {
    expect(
      sanitizeCommitSubject(
        "  Add important change with extra detail.\nnext line",
      ),
    ).toBe("Add important change with extra detail");
  });
});

describe("generateCodexCommitMessage", () => {
  it("uses low effort by default and sanitizes subject/body output", async () => {
    let receivedArgs: string[] = [];
    const fakeProcess = createFakeChildProcess();

    const result = await generateCodexCommitMessage(
      {
        context: {
          branch: "feature/codex-commit",
          patch: "diff --git a/file.ts b/file.ts",
          repoRoot: globalThis.process.cwd(),
          summary: "M file.ts",
        },
        modelId: "gpt-5.4",
      },
      {
        createProcess: async ({ args }) => {
          receivedArgs = args;
          const outputPath = args[args.indexOf("--output-last-message") + 1]!;
          await writeFile(
            outputPath,
            JSON.stringify({
              body: "\n- add migration\n- update tests\n",
              subject:
                "  Add important change to the system with too much detail and a trailing period.\nignored",
            }),
            "utf8",
          );
          return fakeProcess.child;
        },
      },
    );

    expect(receivedArgs).toContain("--output-schema");
    expect(receivedArgs).toContain("--output-last-message");
    expect(receivedArgs).toContain('model_reasoning_effort="low"');
    expect(receivedArgs).not.toContain("--ephemeral");
    expect(fakeProcess.getInput()).toContain("Branch: feature/codex-commit");
    expect(result.subject.length).toBeLessThanOrEqual(72);
    expect(result.subject.endsWith(".")).toBe(false);
    expect(result.body).toBe("- add migration\n- update tests");
  });

  it("throws when codex returns invalid structured output", async () => {
    const fakeProcess = createFakeChildProcess();

    await expect(
      generateCodexCommitMessage(
        {
          context: {
            branch: "feature/codex-commit",
            patch: "diff --git a/file.ts b/file.ts",
            repoRoot: globalThis.process.cwd(),
            summary: "M file.ts",
          },
          modelId: "gpt-5.4",
          reasoningEffort: "high",
        },
        {
          createProcess: async ({ args }) => {
            const outputPath = args[args.indexOf("--output-last-message") + 1]!;
            await writeFile(outputPath, JSON.stringify({ nope: true }), "utf8");
            return fakeProcess.child;
          },
        },
      ),
    ).rejects.toBeTruthy();
  });
});

describe("generateClaudeCommitMessage", () => {
  it("maps effort into claude CLI args and parses the structured envelope", async () => {
    let receivedArgs: string[] = [];
    let receivedEnv: NodeJS.ProcessEnv | undefined;
    const fakeProcess = createFakeChildProcess({
      stdout: JSON.stringify({
        structured_output: {
          body: "Body",
          subject: "Improve orchestration flow",
        },
      }),
    });

    const result = await generateClaudeCommitMessage(
      {
        context: {
          branch: "feature/claude-commit",
          patch: "diff --git a/file.ts b/file.ts",
          repoRoot: globalThis.process.cwd(),
          summary: "M file.ts",
        },
        modelId: "claude-sonnet-4-5",
        reasoningEffort: "high",
      },
      {
        spawnProcess: ({ args, env }) => {
          receivedArgs = args;
          receivedEnv = env;
          return fakeProcess.child;
        },
      },
    );

    expect(receivedArgs).toContain("--json-schema");
    expect(receivedArgs).toContain("--effort");
    expect(receivedArgs).toContain("high");
    expect(receivedEnv?.CLAUDE_AGENT_SDK_CLIENT_APP).toBe("sentinel");
    expect(fakeProcess.getInput()).toContain("Branch: feature/claude-commit");
    expect(result).toEqual({
      body: "Body",
      message: "Improve orchestration flow\n\nBody",
      subject: "Improve orchestration flow",
    });
  });

  it("throws when claude returns invalid json output", async () => {
    const fakeProcess = createFakeChildProcess({
      stdout: "{not json",
    });

    await expect(
      generateClaudeCommitMessage(
        {
          context: {
            branch: "feature/claude-commit",
            patch: "diff --git a/file.ts b/file.ts",
            repoRoot: globalThis.process.cwd(),
            summary: "M file.ts",
          },
          modelId: "claude-sonnet-4-5",
          reasoningEffort: "minimal",
        },
        {
          spawnProcess: () => fakeProcess.child,
        },
      ),
    ).rejects.toBeTruthy();
  });
});
