import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { disposeShellSession } from "./shell";
import { resolveRunTaskCommand, streamRunTask } from "./run-task";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-run-task-"));
}

afterEach(async () => {
  await disposeShellSession("thread-run-task");
});

describe("run_task", () => {
  it("resolves the nearest package script", async () => {
    const defaultDirectory = await createDirectory();
    await mkdir(path.join(defaultDirectory, "app", "src"), { recursive: true });
    await writeFile(
      path.join(defaultDirectory, "app", "package.json"),
      JSON.stringify({
        packageManager: "bun@1.3.6",
        scripts: {
          typecheck: "tsc --noEmit",
        },
      }),
    );

    const result = await resolveRunTaskCommand({
      defaultDirectory,
      input: {
        path: "app/src",
        rationale: "Verify types",
        task: "typecheck",
      },
      permissionMode: "default",
    });

    expect(result.command).toBe("bun run typecheck");
    expect(result.script).toBe("typecheck");
    expect(result.cwd).toBe(path.join(defaultDirectory, "app"));
  });

  it("runs a task through the shared shell session", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(
      path.join(defaultDirectory, "package.json"),
      JSON.stringify({
        packageManager: "bun@1.3.6",
        scripts: {
          test: "node -e \"console.log('task-ok')\"",
        },
      }),
    );

    const events = [];

    for await (const event of streamRunTask({
      allowedRoot: defaultDirectory,
      defaultDirectory,
      input: {
        rationale: "Run tests",
        task: "test",
      },
      permissionMode: "default",
      threadId: "thread-run-task",
    })) {
      events.push(event);
    }

    const completed = events
      .filter((event) => event.type === "completed")
      .at(-1);

    expect(
      completed && "output" in completed ? completed.output : null,
    ).toMatchObject({
      boundaryRoot: defaultDirectory,
      command: "bun run test",
      exitCode: 0,
      failureKind: null,
      phase: "completed",
      suggestedNextAction: "none",
      stdout: "task-ok",
      task: "test",
    });
  });

  it("surfaces missing command failures as remediation metadata", async () => {
    const defaultDirectory = await createDirectory();
    const missingBinary = "sentinel_missing_binary_for_run_task_test";
    await writeFile(
      path.join(defaultDirectory, "package.json"),
      JSON.stringify({
        packageManager: "npm@10.0.0",
        scripts: {
          test: missingBinary,
        },
      }),
    );

    const events = [];

    for await (const event of streamRunTask({
      allowedRoot: defaultDirectory,
      defaultDirectory,
      input: {
        rationale: "Run tests",
        task: "test",
      },
      permissionMode: "default",
      threadId: "thread-run-task",
    })) {
      events.push(event);
    }

    const completed = events
      .filter((event) => event.type === "completed")
      .at(-1);

    expect(
      completed && "output" in completed ? completed.output : null,
    ).toMatchObject({
      exitCode: 127,
      failureKind: "missing_command",
      missingCommand: missingBinary,
      suggestedNextAction: "install",
      task: "test",
    });
  });

  it("rejects missing scripts and absolute paths in default mode", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(
      path.join(defaultDirectory, "package.json"),
      JSON.stringify({
        packageManager: "bun@1.3.6",
        scripts: {},
      }),
    );

    await expect(
      resolveRunTaskCommand({
        defaultDirectory,
        input: {
          rationale: "Run lint",
          task: "lint",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/No lint script/i);

    await expect(
      resolveRunTaskCommand({
        defaultDirectory,
        input: {
          path: defaultDirectory,
          rationale: "Run lint",
          task: "lint",
        },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/relative paths/i);
  });
});
