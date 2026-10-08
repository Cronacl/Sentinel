import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, mock } from "bun:test";

process.env.SENTINEL_STATE_PATH ??= path.join(
  await mkdtemp(path.join(os.tmpdir(), "sentinel-cursor-state-")),
  "state.json",
);

const legacyWrites: Array<[string, string]> = [];
mock.module("server-only", () => ({}));
mock.module("@/lib/runtime/local-runtime-env", () => ({
  setLocalRuntimeEnvValue: async (key: string, value: string) => {
    legacyWrites.push([key, value]);
  },
}));

const cursor = await import("./cursor");
const { createAssistantMirror } =
  await import("@/lib/ai/chat/runtime/external/mirror");
const { makeFakeInstance } =
  await import("@/lib/ai/chat/engines/contract/testing");

const roots: string[] = [];

afterEach(async () => {
  cursor.cursorAcpAgent.invalidate?.();
  legacyWrites.length = 0;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function binDir(scripts: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sentinel-cursor-bin-"));
  roots.push(root);
  for (const [name, version] of Object.entries(scripts)) {
    const file = path.join(root, name);
    await writeFile(file, `#!/bin/sh\necho '${version}'\n`, "utf8");
    await chmod(file, 0o755);
  }
  return root;
}

function instanceWith(env: Record<string, string>, overrides = {}) {
  return makeFakeInstance({
    driver: "cursor",
    env: { HOME: os.tmpdir(), SHELL: "/nonexistent-shell", ...env },
    id: "cursor",
    isDefault: true,
    ...overrides,
  });
}

describe.skipIf(process.platform === "win32")("resolveCursorBinary", () => {
  it("prefers cursor-agent and records it for the default instance", async () => {
    const dir = await binDir({
      agent: "2026.08.04-aaa",
      "cursor-agent": "2026.08.04-bbb",
    });
    const result = await cursor.resolveCursorBinary(
      instanceWith({ PATH: dir }),
      { forceRefresh: true },
    );
    expect(result.binary).toEqual(
      expect.objectContaining({
        path: path.join(dir, "cursor-agent"),
        source: "managed-path",
        version: "2026.08.04-bbb",
      }),
    );
    expect(legacyWrites).toContainEqual([
      "SENTINEL_CURSOR_PATH",
      path.join(dir, "cursor-agent"),
    ]);
  });

  it("only accepts a generic `agent` binary that prints a Cursor Agent version", async () => {
    const other = await binDir({ agent: "agent 1.0.0 (some other tool)" });
    expect(
      (
        await cursor.resolveCursorBinary(instanceWith({ PATH: other }), {
          forceRefresh: true,
        })
      ).binary,
    ).toBeNull();

    const real = await binDir({ agent: "2026.08.04-aaa8809" });
    expect(
      (
        await cursor.resolveCursorBinary(instanceWith({ PATH: real }), {
          forceRefresh: true,
        })
      ).binary?.path,
    ).toBe(path.join(real, "agent"));
  });

  it("uses an instance's configured binary path and never writes it as the legacy override", async () => {
    const dir = await binDir({ custom: "2026.09.01" });
    const result = await cursor.resolveCursorBinary(
      instanceWith(
        { PATH: "/nonexistent" },
        {
          config: { binaryPath: path.join(dir, "custom") },
          id: "cursor-work",
          isDefault: false,
        },
      ),
      { forceRefresh: true },
    );
    expect(result.binary).toEqual(
      expect.objectContaining({
        path: path.join(dir, "custom"),
        source: "config",
      }),
    );
    expect(legacyWrites).toEqual([]);
  });

  it("explains what is missing", async () => {
    const result = await cursor.resolveCursorBinary(
      instanceWith({ PATH: "/nonexistent" }),
      { forceRefresh: true },
    );
    expect(result).toEqual({
      binary: null,
      error: "Cursor Agent was not found in PATH.",
    });
  });
});

describe("Cursor wire shapes", () => {
  it("reads cursor/list_available_models with each model's reasoning option", () => {
    const models = cursor.readCursorModelList({
      models: [
        {
          configOptions: [
            {
              category: "thought_level",
              currentValue: "medium",
              id: "reasoning",
              name: "Reasoning",
              options: [
                { name: "Low", value: "low" },
                { name: "Medium", value: "medium" },
              ],
              type: "select",
            },
            {
              category: "model_config",
              currentValue: "false",
              id: "fast",
              name: "Fast",
              options: [],
              type: "select",
            },
          ],
          name: "GPT-5.4",
          value: "gpt-5.4",
        },
        { name: "Composer 2", value: "composer-2" },
        { name: "no value" },
      ],
    });
    expect(
      models.map((model) => [
        model.id,
        model.name,
        model.effortOption?.id ?? null,
      ]),
    ).toEqual([
      ["gpt-5.4", "GPT-5.4", "reasoning"],
      ["composer-2", "Composer 2", null],
    ]);
  });

  it("reads every cursor/ask_question question, multi-select aware", () => {
    expect(
      cursor.readCursorQuestions({
        questions: [
          {
            id: "db",
            options: [{ id: "pg", label: "Postgres" }],
            prompt: "Which?",
          },
          { allowMultiple: true, id: "x", options: [], prompt: "Extras?" },
          { id: "skip" },
        ],
        title: "Setup",
      }),
    ).toEqual([
      {
        header: "Setup",
        id: "db",
        multiSelect: false,
        options: [{ id: "pg", label: "Postgres" }],
        question: "Which?",
      },
      { id: "x", multiSelect: true, options: [], question: "Extras?" },
    ]);
  });

  function context(
    response: Awaited<
      ReturnType<Parameters<typeof cursor.answerCursorQuestions>[1]["askUser"]>
    >,
    interactive = true,
  ) {
    const mirror = createAssistantMirror({
      agentLabel: "Cursor",
      toolPrefix: "cursor_",
    });
    return {
      askUser: mock(async () => response),
      interactive,
      log: () => {},
      mirror,
      update: mock(() => {}),
    };
  }

  it("answers questions with option ids, or skips them", async () => {
    const params = {
      questions: [
        {
          id: "db",
          options: [{ id: "pg", label: "Postgres" }],
          prompt: "Which?",
        },
      ],
      toolCallId: "q1",
    };
    expect(
      await cursor.answerCursorQuestions(
        params,
        context({
          additionalContext: null,
          answers: [{ questionId: "db", selectedOptionIds: ["pg"] }],
        }),
      ),
    ).toEqual({
      outcome: {
        answers: [{ questionId: "db", selectedOptionIds: ["pg"] }],
        outcome: "answered",
      },
    });
    expect(
      await cursor.answerCursorQuestions(
        params,
        context({
          additionalContext: null,
          answers: [{ questionId: "db", selectedOptionIds: [], text: "MySQL" }],
        }),
      ),
    ).toEqual({ outcome: { outcome: "skipped", reason: "MySQL" } });
    expect(await cursor.answerCursorQuestions(params, context(null))).toEqual({
      outcome: { outcome: "cancelled" },
    });
  });

  it("merges cursor/update_todos when asked to", () => {
    const ctx = context(null);
    cursor.updateCursorTodos(
      {
        todos: [
          { content: "Split", id: "1", status: "in_progress" },
          { content: "Test", id: "2", status: "pending" },
        ],
      },
      ctx,
    );
    cursor.updateCursorTodos(
      {
        merge: true,
        todos: [{ content: "Split", id: "1", status: "completed" }],
      },
      ctx,
    );
    const output = ctx.mirror.getTool("cursor-todos")?.output as {
      tasks: Array<{ status: string; title: string }>;
    };
    expect(output.tasks.map((task) => [task.title, task.status])).toEqual([
      ["Split", "completed"],
      ["Test", "pending"],
    ]);
  });

  it("turns cursor/task into a subagent card on the same tool call", () => {
    const ctx = context(null);
    ctx.mirror.upsertTool({
      id: "t1",
      kind: "other",
      status: "in_progress",
      title: "Task",
    });
    cursor.describeCursorTask(
      {
        description: "Explore the repo",
        prompt: "Find X",
        subagentType: "explore",
        toolCallId: "t1",
      },
      ctx,
    );
    expect(ctx.mirror.getTool("t1")).toEqual(
      expect.objectContaining({
        input: { description: "Explore the repo", prompt: "Find X" },
        kind: "subagent",
        title: "Explore the repo",
      }),
    );
  });
});

describe("cursorPermissionDisposition", () => {
  const base = {
    interactive: true,
    permissionMode: "default" as const,
    toolsEnabled: true,
  };

  it("asks before a web search or fetch, which Cursor sends as search and fetch", () => {
    for (const kind of ["search", "read", "think"] as const) {
      expect(cursor.cursorPermissionDisposition({ ...base, kind })).toBe("ask");
      expect(
        cursor.cursorPermissionDisposition({
          ...base,
          kind,
          permissionMode: "accept_edits",
        }),
      ).toBe("ask");
      expect(
        cursor.cursorPermissionDisposition({
          ...base,
          interactive: false,
          kind,
        }),
      ).toBe("deny");
      expect(
        cursor.cursorPermissionDisposition({
          ...base,
          kind,
          permissionMode: "full",
        }),
      ).toBe("allow");
    }
  });

  it("leaves every other kind to the shared policy", () => {
    for (const kind of ["edit", "execute", "fetch", "other"] as const) {
      expect(cursor.cursorPermissionDisposition({ ...base, kind })).toBeNull();
    }
  });
});
