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
