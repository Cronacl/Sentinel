import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import { setupAcpRunHarness, toolParts } from "../acp/__tests__/run-harness";

// Grok Build turns on the shared ACP runtime, against the mock agent playing
// Grok's recorded wire traits over real stdio (scripts/fixtures/agents/acp
// grokProfile, with `_x.ai/` and with canonical `x.ai/` method names): the
// completion race, background wake turns, exit_plan_mode, ask_user_question,
// the rate limit, cancel metadata, launch flags per permission mode, approval
// options and headless auth.

const h = await setupAcpRunHarness();
const grok = await import("@/lib/ai/chat/engines/acp/agents/grok");
const { acpProcessHoldCount } = await import("../acp/holds");
const { grokProfile } =
  await import("../../../../../../scripts/fixtures/agents/acp/profiles");

type Scenario = ReturnType<typeof grokProfile>;

/** Grok's descriptor, launching the mock agent with Grok's mode flags. */
const descriptor = h.support.mockDescriptor({
  ...grok.grokAcpAgent,
  cancelGraceMs: 1_000,
  launchArgsFor: ({ permissionMode }) => [
    h.support.MOCK_AGENT_PATH,
    ...grok.grokLaunchArgs(permissionMode),
  ],
  resolveBinary: h.support.mockDescriptor().resolveBinary,
});

beforeEach(() => h.reset());
afterEach(() => h.cleanup());
afterAll(() => h.removeDirs());

function textOf(message: ThreadUIMessage | null) {
  return (message?.parts ?? [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("")
    .trim();
}

const run = (
  scenario: Scenario,
  text: string,
  extra: Record<string, unknown> = {},
  instance = h.instanceFor(scenario),
) =>
  h.run(
    descriptor,
    scenario,
    text,
    { modelId: "grok-build", ...extra },
    instance,
  );

function promptParams(logPath: string) {
  return h
    .agentRequests(logPath, "session/prompt")
    .map((entry) => ("params" in entry ? entry.params : null)) as Array<{
    _meta?: { promptId?: string; requestId?: string };
  }>;
}

for (const [prefix, profile] of [
  ["_x.ai/", grokProfile()],
  ["x.ai/", grokProfile({ methodPrefix: "" })],
] as const) {
  describe(`Grok turns (${prefix} methods)`, () => {
    it("sends Grok's metadata and keeps the session's model for grok-build", async () => {
      const instance = await run(profile, "hello");
      const message = await h.waitFor(h.finished, "finish");

      expect(message.metadata?.status).toBe("completed");
      expect(textOf(message)).toBe("Working on it.");
      const [prompt] = promptParams(instance.logPath);
      expect(prompt?._meta?.promptId).toBe(message.metadata?.runId);
      expect(prompt?._meta?.requestId).toMatch(/^[0-9a-f-]{36}$/);
      // grok-build is never sent: the session keeps its model.
      expect(
        h
          .agentRequests(instance.logPath, "session/set_config_option")
          .filter(
            (entry) =>
              "params" in entry &&
              (entry.params as { configId?: string }).configId === "model",
          ),
      ).toEqual([]);
      const init = h.agentRequests(instance.logPath, "initialize")[0];
      expect(init && "params" in init ? init.params : null).toMatchObject({
        _meta: { clientType: "extension" },
      });
    });

    it("ends the turn on prompt_complete while the prompt request never answers", async () => {
      await run(profile, "race me");
      const message = await h.waitFor(h.finished, "finish");

      expect(message.metadata?.status).toBe("completed");
      expect(textOf(message)).toBe("Working on it.");
    });

    it("shows exit_plan_mode as a plan card and abandons Grok's own gate", async () => {
      const instance = await run(profile, "make a plan");
      const message = await h.waitFor(h.finished, "finish");

      const plan = toolParts(message).find(
        (part) => part.toolName === "create_plan",
      );
      expect(plan?.output).toEqual(
        expect.objectContaining({ document: "# Plan\n\n- step" }),
      );
      expect(h.clientResponses(instance.logPath)).toContainEqual(
        expect.objectContaining({ outcome: "abandoned" }),
      );
    });

    it("asks ask_user_question on the question card and answers by question text", async () => {
      const instance = await run(profile, "ask me");
      await h.waitFor(
        () => h.store.thread?.status === "awaiting_approval",
        "question",
      );
      const question = toolParts(h.assistant()).find(
        (part) => part.toolName === "grok_ask_question",
      );
      expect(question?.callProviderMetadata.sentinel.kind).toBe("user_input");

      await h.submit(descriptor, instance, {
        approved: true,
        response: "Which approach?: Fast",
      });
      const message = await h.waitFor(h.finished, "finish");
      expect(h.clientResponses(instance.logPath)).toContainEqual({
        answers: { "Which approach?": ["Fast"] },
        outcome: "accepted",
      });
      expect(textOf(message)).toContain("Going with the answer.");
    });
  });
}

describe("Grok background turns", () => {
  it("keeps a task-completed wake turn out of the reply and never lets it end the user turn", async () => {
    const wakeId = "task-completed-00000000-0000-4000-8000-0000000000aa";
    const profile = grokProfile();
    const user = (text: string) => ({
      notificationMeta: { promptId: "{{promptId}}" },
      text,
      type: "text" as const,
    });
    const scenario: Scenario = {
      ...profile,
      prompts: [
        {
          meta: { promptId: "{{promptId}}" },
          steps: [
            user("Started."),
            {
              method: "_x.ai/task_backgrounded",
              params: {
                sessionId: "{{sessionId}}",
                update: {
                  sessionUpdate: "task_backgrounded",
                  task_snapshot: { command: "sleep 8", task_id: "t1" },
                },
              },
              type: "extNotification",
            },
            {
              notificationMeta: { promptId: wakeId },
              text: "tock 3",
              type: "text",
            },
            {
              method: "_x.ai/session_notification",
              params: {
                sessionId: "{{sessionId}}",
                update: {
                  prompt_id: wakeId,
                  sessionUpdate: "turn_completed",
                  stop_reason: "end_turn",
                },
              },
              type: "extNotification",
            },
            {
              method: "_x.ai/task_completed",
              params: {
                sessionId: "{{sessionId}}",
                update: {
                  sessionUpdate: "task_completed",
                  task_snapshot: {
                    command: "sleep 8",
                    output: "tock 3",
                    status: "completed",
                    task_id: "t1",
                  },
                },
              },
              type: "extNotification",
            },
            { ms: 50, type: "delay" },
            user(" Done."),
          ],
        },
      ],
    };

    await run(scenario, "go");
    const message = await h.waitFor(h.finished, "finish");

    expect(message.metadata?.status).toBe("completed");
    expect(textOf(message)).toBe("Started. Done.");
    const parts = toolParts(message);
    expect(
      parts.find((part) => part.toolName === "grok_background_update")?.output,
    ).toEqual(expect.objectContaining({ text: "tock 3" }));
    const task = parts.find((part) => part.toolName === "grok_execute");
    expect(task?.input).toEqual(
      expect.objectContaining({ command: "sleep 8" }),
    );
    expect(task?.state).toBe("output-available");
  });

  it("finishes a turn whose wake turn follows the response", async () => {
    await run(grokProfile(), "background please");
    const message = await h.waitFor(h.finished, "finish");

    expect(message.metadata?.status).toBe("completed");
    expect(textOf(message)).toBe("Working on it.");
  });
});

describe("Grok errors, stop and launch", () => {
  it("names the rate limit", async () => {
    await run(grokProfile(), "rate limited?");
    const message = await h.waitFor(h.finished, "finish");

    expect(message.metadata?.status).toBe("error");
    expect(message.metadata?.errorMessage).toBe(
      "Grok usage limit reached: Rate limit exceeded. Try again in 1 min.",
    );
  });

  it("cancels with Grok's ctrl_c trigger", async () => {
    const scenario: Scenario = {
      ...grokProfile(),
      prompts: [{ steps: [{ type: "waitForCancel" }] }],
    };
    const instance = await run(scenario, "long");
    await h.waitFor(
      () => h.agentRequests(instance.logPath, "session/prompt").length > 0,
      "prompt",
    );
    await h.stopAcpThreadRun(
      descriptor,
      h.request(""),
      h.store.thread as never,
    );
    const message = await h.waitFor(h.finished, "finish");

    expect(message.metadata?.status).toBe("cancelled");
    const [cancel] = h.agentRequests(instance.logPath, "session/cancel");
    expect(cancel && "params" in cancel ? cancel.params : null).toMatchObject({
      _meta: { cancelTrigger: "ctrl_c" },
    });
  });

  it("starts a new agent when the permission mode (a launch flag) changes", async () => {
    const scenario = grokProfile();
    const instance = h.instanceFor(scenario);
    await run(scenario, "one", {}, instance);
    await h.waitFor(h.finished, "first");
    expect(h.agentRequests(instance.logPath, "initialize")).toHaveLength(1);

    h.settings.permissionMode = "full";
    await run(scenario, "two", {}, instance);
    await h.waitFor(
      () =>
        h.store.thread?.status === "idle" &&
        h.agentRequests(instance.logPath, "session/prompt").length === 2
          ? true
          : null,
      "second",
    );
    expect(h.agentRequests(instance.logPath, "initialize")).toHaveLength(2);
    // The second agent loads the session the first one created.
    expect(h.agentRequests(instance.logPath, "session/load")).toHaveLength(1);
  });
});

/** A user turn that settles only through prompt_complete. */
function hangingCompletion(params: Record<string, unknown>): Scenario {
  return {
    ...grokProfile(),
    prompts: [
      {
        steps: [
          {
            notificationMeta: { promptId: "{{promptId}}" },
            text: "Partial.",
            type: "text",
          },
          {
            method: "_x.ai/session/prompt_complete",
            params: { sessionId: "{{sessionId}}", ...params },
            type: "extNotification",
          },
          { type: "hang" },
        ],
      },
    ],
  };
}

const backgrounded = (taskId: string) => ({
  method: "_x.ai/task_backgrounded",
  params: {
    sessionId: "{{sessionId}}",
    update: {
      sessionUpdate: "task_backgrounded",
      task_snapshot: { command: "sleep 30", task_id: taskId },
    },
  },
  type: "extNotification" as const,
});

const taskCompleted = (taskId: string) => ({
  method: "_x.ai/task_completed",
  params: {
    sessionId: "{{sessionId}}",
    update: {
      sessionUpdate: "task_completed",
      task_snapshot: { status: "completed", task_id: taskId },
    },
  },
  type: "extNotification" as const,
});

function liveProcess() {
  const pool = h.getAcpProcessPool();
  const [key] = pool.keys();
  return key ? pool.peek(key) : null;
}

describe("Grok completion failures", () => {
  it("fails the turn on a rate_limit completion that wins the race", async () => {
    await run(
      hangingCompletion({ promptId: "{{promptId}}", stopReason: "rate_limit" }),
      "go",
    );
    const message = await h.waitFor(h.finished, "finish");

    expect(message.metadata?.status).toBe("error");
    expect(message.metadata?.errorMessage).toBe(
      "Grok usage limit reached. Try again later.",
    );
  });

  it("fails the turn on an error completion with Grok's text", async () => {
    await run(
      hangingCompletion({
        agentResult: "upstream overloaded",
        promptId: "{{promptId}}",
        stopReason: "error",
      }),
      "go",
    );
    const message = await h.waitFor(h.finished, "finish");

    expect(message.metadata?.status).toBe("error");
    expect(message.metadata?.errorMessage).toBe(
      "Grok ended the turn with an error: upstream overloaded",
    );
  });

  it("settles on a prompt_complete without a prompt id for the run's session", async () => {
    await run(hangingCompletion({ stopReason: "end_turn" }), "go");
    const message = await h.waitFor(h.finished, "finish");

    expect(message.metadata?.status).toBe("completed");
    expect(textOf(message)).toBe("Partial.");
  });

  it("ignores a prompt_complete of another session", async () => {
    const scenario = hangingCompletion({
      sessionId: "other-session",
      stopReason: "end_turn",
    });
    const instance = await run(scenario, "go");
    await h.waitFor(
      () => h.agentRequests(instance.logPath, "session/prompt").length > 0,
      "prompt",
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(h.finished()).toBeNull();
    await h.stopAcpThreadRun(
      descriptor,
      h.request(""),
      h.store.thread as never,
    );
    expect((await h.waitFor(h.finished, "stop")).metadata?.status).toBe(
      "cancelled",
    );
  });
});

describe("Grok session replay and background holds", () => {
  it("ignores xAI frames a session/load replays", async () => {
    const profile = grokProfile();
    const scenario: Scenario = {
      ...profile,
      session: {
        ...profile.session,
        load: {
          replayExt: [
            {
              method: "_x.ai/session/update",
              params: {
                sessionId: "{{sessionId}}",
                update: {
                  child_session_id: "child-replayed",
                  output: "old output",
                  sessionUpdate: "subagent_finished",
                  status: "completed",
                },
              },
            },
            {
              method: backgrounded("replayed-task").method,
              params: backgrounded("replayed-task").params,
            },
          ],
        },
      },
    };
    const instance = h.instanceFor(scenario);
    await run(scenario, "one", {}, instance);
    await h.waitFor(h.finished, "first");

    // A mode change respawns the agent, which loads (replays) the session.
    h.settings.permissionMode = "full";
    await run(scenario, "two", {}, instance);
    await h.waitFor(
      () =>
        h.store.thread?.status === "idle" &&
        h.agentRequests(instance.logPath, "session/prompt").length === 2
          ? true
          : null,
      "second",
    );
    expect(h.agentRequests(instance.logPath, "session/load")).toHaveLength(1);
    const parts = JSON.stringify(toolParts(h.assistant()));
    expect(parts).not.toContain("child-replayed");
    expect(parts).not.toContain("replayed-task");
    const process = liveProcess();
    expect(process && acpProcessHoldCount(process)).toBe(0);
  });

  it("keeps the agent pinned while a background task runs past the turn", async () => {
    const profile = grokProfile();
    const scenario: Scenario = {
      ...profile,
      prompts: [
        {
          meta: { promptId: "{{promptId}}" },
          steps: [
            backgrounded("bg-1"),
            {
              notificationMeta: { promptId: "{{promptId}}" },
              text: "Started.",
              type: "text",
            },
          ],
        },
      ],
    };
    await run(scenario, "go");
    const message = await h.waitFor(h.finished, "finish");

    expect(message.metadata?.status).toBe("completed");
    const process = liveProcess();
    expect(process && acpProcessHoldCount(process)).toBe(1);
  });

  it("releases the pin when the task finishes after the turn", async () => {
    const profile = grokProfile();
    const scenario: Scenario = {
      ...profile,
      prompts: [
        {
          afterResponse: [{ ms: 100, type: "delay" }, taskCompleted("bg-2")],
          meta: { promptId: "{{promptId}}" },
          steps: [backgrounded("bg-2")],
        },
      ],
    };
    await run(scenario, "go");
    await h.waitFor(h.finished, "finish");

    const process = liveProcess();
    expect(process).not.toBeNull();
    await h.waitFor(
      () => (acpProcessHoldCount(process!) === 0 ? true : null),
      "release",
    );
  });

  it("kills the agent on Stop so its background tasks die too", async () => {
    const scenario: Scenario = {
      ...grokProfile(),
      // The prompt never answers, the cancel included: Stop must not wait
      // the grace period for it.
      prompts: [{ steps: [backgrounded("bg-3"), { type: "hang" }] }],
    };
    const instance = await run(scenario, "long");
    await h.waitFor(
      () => h.agentRequests(instance.logPath, "session/prompt").length > 0,
      "prompt",
    );
    const process = liveProcess();
    const started = Date.now();
    await h.stopAcpThreadRun(
      descriptor,
      h.request(""),
      h.store.thread as never,
    );
    const message = await h.waitFor(h.finished, "finish");

    expect(message.metadata?.status).toBe("cancelled");
    expect(Date.now() - started).toBeLessThan(900);
    expect(process?.isAlive()).toBe(false);
    expect(h.getAcpProcessPool().keys()).toEqual([]);
  });
});

describe("Grok approvals and auth", () => {
  it("never answers with a project-wide always-allow grant", async () => {
    const scenario: Scenario = {
      ...grokProfile(),
      prompts: [
        {
          steps: [
            {
              options: [
                { kind: "allow_once", name: "Yes", optionId: "allow-once" },
                {
                  kind: "allow_always",
                  name: "Always allow in this project",
                  optionId: "always-allow",
                },
                { kind: "reject_once", name: "No", optionId: "reject-once" },
              ],
              toolCall: {
                kind: "execute",
                rawInput: { command: "ls" },
                title: "ls",
                toolCallId: "c1",
              },
              type: "requestPermission",
            },
            { text: "ran", type: "text" },
          ],
        },
      ],
    };
    const instance = await run(scenario, "run ls");
    await h.waitFor(
      () => h.store.thread?.status === "awaiting_approval",
      "approval",
    );
    await h.submit(descriptor, instance, {
      approved: true,
      decision: "acceptForSession",
    });
    await h.waitFor(h.finished, "finish");

    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { optionId: "allow-once", outcome: "selected" },
    });
  });

  it("authenticates with the cached login even in an unattended run", async () => {
    const scenario: Scenario = {
      ...grokProfile(),
      auth: { acceptMethodIds: ["cached_token"], requireAuth: true },
    };
    const instance = await run(scenario, "hello", { interactive: false });
    const message = await h.waitFor(h.finished, "finish");

    expect(message.metadata?.status).toBe("completed");
    expect(
      h
        .agentRequests(instance.logPath, "authenticate")
        .map((entry) => ("params" in entry ? entry.params : null)),
    ).toEqual([{ methodId: "cached_token" }]);
  });

  it("authenticates with xai.api_key when the instance has XAI_API_KEY", async () => {
    const scenario: Scenario = {
      ...grokProfile(),
      auth: { acceptMethodIds: ["xai.api_key"], requireAuth: true },
    };
    const instance = h.instanceFor(scenario);
    instance.env.XAI_API_KEY = "xai-test-key";
    await run(scenario, "hello", {}, instance);
    const message = await h.waitFor(h.finished, "finish");

    expect(message.metadata?.status).toBe("completed");
    expect(
      h
        .agentRequests(instance.logPath, "authenticate")
        .map((entry) => ("params" in entry ? entry.params : null)),
    ).toEqual([{ methodId: "xai.api_key" }]);
  });
});
