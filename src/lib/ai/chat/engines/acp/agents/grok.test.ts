import { afterAll, describe, expect, it, mock } from "bun:test";

import type { ProbeOptions } from "@/lib/ai/chat/engines/platform/driver";

// The Grok descriptor's pure parts, and its probe against the mock agent
// playing Grok's recorded wire traits (scripts/fixtures/agents/acp
// grokProfile) over real stdio. Turns are covered in runtime/grok.
mock.module("server-only", () => ({}));

const grok = await import("./grok");
const { probeAcpAgent } = await import("../probe");
const support = await import("../__tests__/mock-agent");
const { grokProfile } =
  await import("../../../../../../../scripts/fixtures/agents/acp/profiles");

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) support.removeTempDir(dir);
});

function probeOptions(): ProbeOptions {
  return {
    depth: "full",
    forceRefresh: true,
    reason: "user",
    signal: new AbortController().signal,
  };
}

describe("grokLaunchArgs", () => {
  it("puts the permission mode on the command line (no accept-edits mode)", () => {
    expect(grok.grokLaunchArgs("default")).toEqual([
      "--permission-mode",
      "default",
      "agent",
      "stdio",
    ]);
    expect(grok.grokLaunchArgs("auto")).toEqual([
      "--permission-mode",
      "auto",
      "agent",
      "stdio",
    ]);
    expect(grok.grokLaunchArgs("full")).toEqual([
      "agent",
      "--always-approve",
      "stdio",
    ]);
    expect(grok.grokLaunchArgs("accept_edits")).toEqual(
      grok.grokLaunchArgs("default"),
    );
    expect(grok.grokAcpAgent.permissionModes).toEqual([
      "default",
      "auto",
      "full",
    ]);
  });
});

describe("Grok auth method", () => {
  const methodId = grok.grokAcpAgent.auth.methodId;

  it("authenticates with XAI_API_KEY when the instance sets it, else the cached login", () => {
    expect(methodId([], { env: { XAI_API_KEY: "xai-1" } })).toBe("xai.api_key");
    expect(methodId([], { env: { XAI_API_KEY: "  " } })).toBe("cached_token");
    expect(methodId([])).toBe("cached_token");
    expect(grok.grokAcpAgent.auth.headless).toBe(true);
  });
});

describe("readGrokInitializeModels", () => {
  it("lists grok-build first, then the modelState models with their efforts", () => {
    const init = grokProfile().initialize?.response;
    const models = grok.readGrokInitializeModels(init);

    expect(models.map((model) => model.id)).toEqual([
      "grok-build",
      "grok-4.7",
      "grok-4.7-build-fast",
      "grok-4.5",
    ]);
    expect(models[0]).toEqual({
      id: "grok-build",
      isDefault: true,
      name: "Grok Build",
    });
    expect(models[1]?.effortOption).toMatchObject({
      category: "thought_level",
      currentValue: "high",
    });
    expect(models[1]?.effortOption?.values.map((value) => value.value)).toEqual(
      ["xhigh", "high", "medium", "low"],
    );
    expect(models[3]?.effortOption?.values).toHaveLength(3);
  });

  it("reads string efforts and tolerates a missing model state", () => {
    expect(grok.readGrokInitializeModels({})).toEqual([]);
    expect(
      grok
        .readGrokInitializeModels({
          _meta: {
            modelState: {
              availableModels: [
                {
                  _meta: { reasoningEfforts: ["low", "high"] },
                  modelId: "grok-x",
                  name: "",
                },
                { modelId: "grok-build", name: "dup" },
              ],
              currentModelId: "grok-x",
            },
          },
        })
        .map((model) => [model.id, model.name, model.effortOption?.values]),
    ).toEqual([
      ["grok-build", "Grok Build", undefined],
      [
        "grok-x",
        "grok-x",
        [
          { description: null, name: "low", value: "low" },
          { description: null, name: "high", value: "high" },
        ],
      ],
    ]);
  });
});

describe("Grok approvals", () => {
  it("offers allow once, decline and only the session-scoped edit grant", () => {
    expect(
      grok
        .grokPermissionOptions([
          { kind: "allow_once", name: "Yes", optionId: "allow-once" },
          {
            kind: "allow_always",
            name: "Yes, allow all edits during this session",
            optionId: "allow-edits-session",
          },
          {
            kind: "allow_always",
            name: "Always allow in this project",
            optionId: "always-allow",
          },
          { kind: "reject_once", name: "No", optionId: "reject-once" },
          { kind: "reject_always", name: "Never", optionId: "reject-always" },
        ])
        .map((option) => option.optionId),
    ).toEqual(["allow-once", "allow-edits-session", "reject-once"]);
  });

  it("asks about every request Grok sends unless the run has full access", () => {
    const base = {
      interactive: true,
      permissionMode: "default" as const,
      toolsEnabled: true,
    };
    for (const kind of ["read", "search", "edit", "execute"] as const) {
      expect(grok.grokPermissionDisposition({ ...base, kind })).toBe("ask");
      expect(
        grok.grokPermissionDisposition({
          ...base,
          editScope: "inside",
          kind,
          permissionMode: "auto",
        }),
      ).toBe("ask");
      expect(
        grok.grokPermissionDisposition({ ...base, interactive: false, kind }),
      ).toBe("deny");
      expect(
        grok.grokPermissionDisposition({
          ...base,
          kind,
          permissionMode: "full",
        }),
      ).toBeNull();
    }
  });
});

describe("Grok errors", () => {
  it("names the rate limit (-32003) and leaves other errors alone", () => {
    expect(
      grok.grokPromptErrorMessage(
        Object.assign(new Error("Rate limit exceeded"), {
          code: -32003,
          data: { retryAfterSeconds: 90 },
        }),
      ),
    ).toBe(
      "Grok usage limit reached: Rate limit exceeded. Try again in 2 min.",
    );
    expect(
      grok.grokPromptErrorMessage(Object.assign(new Error("x"), { code: -1 })),
    ).toBeNull();
    expect(grok.grokPromptErrorMessage(new Error("boom"))).toBeNull();
  });
});

describe("Grok completion failures", () => {
  it("turns rate_limit and error completions into the turn's failure", () => {
    const limited = grok.grokCompletionFailure("rate_limit", null);
    expect(limited && grok.grokPromptErrorMessage(limited)).toBe(
      "Grok usage limit reached. Try again later.",
    );
    expect(
      grok.grokCompletionFailure("error", " model overloaded ")?.message,
    ).toBe("Grok ended the turn with an error: model overloaded");
    expect(grok.grokCompletionFailure("error", { raw: 1 })?.message).toBe(
      "Grok ended the turn with an error.",
    );
    expect(
      grok.grokCompletionFailure("error", "x".repeat(900))?.message.length,
    ).toBeLessThan(600);
    expect(grok.grokCompletionFailure("end_turn", null)).toBeNull();
    expect(grok.grokCompletionFailure(null, null)).toBeNull();
  });
});

describe("Grok plan file", () => {
  const env = { GROK_HOME: "/opt/grok-home", HOME: "/home/dev" };

  it("matches only Grok's session plan file", () => {
    expect(
      grok.isGrokPlanPath("/home/dev/.grok/sessions/-ws/s1/plan.md", env),
    ).toBe(true);
    expect(
      grok.isGrokPlanPath("/opt/grok-home/sessions/-ws/s1/plan.md", env),
    ).toBe(true);
    expect(
      grok.isGrokPlanPath("/Users/someone/.grok/sessions/-ws/s1/plan.md", {}),
    ).toBe(true);
    expect(grok.isGrokPlanPath("/home/dev/project/docs/plan.md", env)).toBe(
      false,
    );
    expect(
      grok.isGrokPlanPath("/home/dev/project/.grok/sessions/x/plan.md", env),
    ).toBe(false);
    expect(
      grok.isGrokPlanPath("/home/dev/.grok/sessions/../../etc/plan.md", env),
    ).toBe(false);
    expect(grok.isGrokPlanPath("/home/dev/.grok/sessions/plan.md", env)).toBe(
      false,
    );
  });

  it("reads the plan from a raw write, else a diff, never a workspace plan.md", () => {
    const planPath = "/home/dev/.grok/sessions/-ws/s1/plan.md";
    expect(
      grok.readGrokPlanWrite(
        { rawInput: { content: "# Raw plan", file_path: planPath } },
        env,
      ),
    ).toBe("# Raw plan");
    expect(
      grok.readGrokPlanWrite(
        { content: [{ newText: "# Diff plan", path: planPath, type: "diff" }] },
        env,
      ),
    ).toBe("# Diff plan");
    expect(
      grok.readGrokPlanWrite(
        {
          content: [
            {
              newText: "# Docs",
              path: "/home/dev/ws/docs/plan.md",
              type: "diff",
            },
          ],
          rawInput: { content: "# Docs", path: "/home/dev/ws/docs/plan.md" },
        },
        env,
      ),
    ).toBeNull();
  });
});

describe("Grok background tasks", () => {
  it("reads the task id and command from the snapshot, the update, then the tool call", () => {
    expect(
      grok.readGrokTask({
        update: {
          command: "sleep 8",
          task_id: "t1",
          task_snapshot: { status: "completed" },
        },
      }),
    ).toMatchObject({ command: "sleep 8", taskId: "t1" });
    expect(
      grok.readGrokTask({
        update: { task_snapshot: { command: "ls", task_id: "t2" } },
      }),
    ).toMatchObject({ command: "ls", taskId: "t2" });
    expect(
      grok.readGrokTask({
        update: { command: "make", tool_call_id: "call-3" },
      }),
    ).toMatchObject({ command: "make", taskId: "call-3" });
    expect(grok.readGrokTask({ update: { command: "x" } })).toBeNull();
  });
});

describe("Grok questions", () => {
  const params = {
    method: "x.ai/ask_user_question",
    params: {
      questions: [
        {
          id: "approach",
          multiSelect: null,
          options: [
            { description: "Ship it today.", label: "Fast" },
            { label: "Safe" },
          ],
          question: "Which approach?",
        },
        {
          options: [{ label: "A" }, { label: "B" }],
          multiSelect: true,
          question: "Extras?",
        },
      ],
      toolCallId: "ask-1",
    },
  };

  it("reads wrapped questions with labels as option ids", () => {
    const questions = grok.readGrokQuestions(params);
    expect(questions.map((question) => question.id)).toEqual([
      "approach",
      "question-2",
    ]);
    expect(questions[0]?.options[0]).toEqual({
      description: "Ship it today.",
      id: "Fast",
      label: "Fast",
    });
    expect(questions[1]?.multiSelect).toBe(true);
  });

  it("answers by question text with labels, free text as Other with notes", () => {
    const questions = grok.readGrokQuestions(params);
    expect(
      grok.toGrokAnswers(questions, {
        additionalContext: null,
        answers: [
          { questionId: "approach", selectedOptionIds: ["Fast"] },
          {
            questionId: "question-2",
            selectedOptionIds: [],
            text: "neither",
          },
        ],
      }),
    ).toEqual({
      annotations: { "Extras?": { notes: "neither" } },
      answers: { "Extras?": ["Other"], "Which approach?": ["Fast"] },
      outcome: "accepted",
    });
  });

  it("keys answers by Grok's question verbatim and shows it trimmed", () => {
    const questions = grok.readGrokQuestions({
      questions: [{ options: [{ label: "Yes" }], question: "  Proceed?\n" }],
    });
    expect(questions[0]?.question).toBe("Proceed?");
    expect(
      grok.toGrokAnswers(questions, {
        additionalContext: null,
        answers: [{ questionId: "question-1", selectedOptionIds: ["Yes"] }],
      }).answers,
    ).toEqual({ "  Proceed?\n": ["Yes"] });
  });
});

describe("Grok probe", () => {
  it("initializes with clientType extension and lists the initialize models, without a session", async () => {
    const dir = support.makeTempDir("grok-probe");
    dirs.push(dir);
    const instance = support.mockInstance(grokProfile(), dir, {
      driver: "grok",
      id: "grok",
      label: "Grok",
    });
    const descriptor = support.mockDescriptor({
      ...grok.grokAcpAgent,
      launchArgs: [support.MOCK_AGENT_PATH],
      launchArgsFor: undefined,
      resolveBinary: support.mockDescriptor().resolveBinary,
    });

    const result = await probeAcpAgent(descriptor, instance, probeOptions());

    expect(result.status).toBe("ready");
    expect(result.defaultModelId).toBe("grok-build");
    expect(result.models.map((model) => model.id)).toEqual([
      "grok-build",
      "grok-4.7",
      "grok-4.7-build-fast",
      "grok-4.5",
    ]);
    expect(
      result.models[1]?.options[0]?.type === "select"
        ? result.models[1].options[0].choices.map((choice) => choice.id)
        : null,
    ).toEqual(["xhigh", "high", "medium", "low"]);
    const log = support.readMockLog(instance.logPath);
    const init = log.find(
      (entry) => entry.kind === "request" && entry.method === "initialize",
    );
    expect(init && "params" in init ? init.params : null).toMatchObject({
      _meta: { clientType: "extension" },
    });
    expect(
      log.flatMap((entry) => (entry.kind === "request" ? [entry.method] : [])),
    ).toEqual(["initialize"]);
  });
});
