import { afterEach, describe, expect, it } from "bun:test";

import * as acp from "@agentclientprotocol/sdk";

import {
  killAllFixtures,
  splitLfLines,
  waitFor,
  withTimeout,
} from "../shared/test-support";
import {
  antigravityProfile,
  cursorProfile,
  devinProfile,
  grokProfile,
} from "./profiles";
import type { AcpLegacyModelState, AcpMockScenario } from "./scenario";
import {
  startAcpHarness,
  type AcpClientHandlers,
  type AcpHarness,
} from "./test-harness";

const TEST_TIMEOUT = 20_000;
const harnesses: AcpHarness[] = [];

function start(
  scenario: AcpMockScenario,
  handlers?: AcpClientHandlers,
  stdoutTap?: (chunk: string) => void,
) {
  const harness = startAcpHarness(scenario, handlers, { stdoutTap });
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.dispose()));
  await killAllFixtures();
});

const allow = () => ({
  outcome: { outcome: "selected" as const, optionId: "allow-once" },
});

describe("ACP agent profiles", () => {
  it(
    "cursor: lazy login, per-model effort options and cursor/* extensions",
    async () => {
      const harness = start(cursorProfile(), {
        requestPermission: allow,
        extRequests: {
          "cursor/create_plan": () => ({ accepted: true }),
          "cursor/ask_question": () => ({
            answers: { db: "pg", extras: ["auth"] },
          }),
        },
        extNotifications: ["cursor/update_todos"],
      });
      const init = await harness.initialize({
        clientCapabilities: { _meta: { parameterizedModelPicker: true } },
      });
      expect(init.authMethods?.map((method) => method.id)).toEqual([
        "cursor_login",
      ]);
      const denied = await harness
        .newSession()
        .catch((error: unknown) => error);
      expect((denied as acp.RequestError).code).toBe(-32000);
      await harness.agent.request("authenticate", { methodId: "cursor_login" });
      const session = await harness.newSession("/work/repo");
      expect(session.configOptions?.map((option) => option.id)).toEqual([
        "mode",
        "model",
      ]);

      const set = await harness.agent.request("session/set_config_option", {
        sessionId: session.sessionId,
        configId: "model",
        value: "gpt-5.4",
      });
      expect(set.configOptions.map((option) => option.id)).toEqual([
        "mode",
        "model",
        "reasoning",
      ]);

      await harness.prompt(session.sessionId, "make a plan");
      await harness.prompt(session.sessionId, "one question");
      expect(await harness.prompt(session.sessionId, "edit it")).toEqual({
        stopReason: "end_turn",
      });
      await harness.settle();
      expect(harness.calls.map((call) => call.method).sort()).toEqual(
        [
          "cursor/ask_question",
          "cursor/create_plan",
          "cursor/update_todos",
          "session/request_permission",
        ].sort(),
      );
      expect(harness.updates.at(-1)?.update).toMatchObject({
        content: { type: "text", text: "Done." },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "grok: the 1.0.41 wire: _x.ai/* methods, params-level promptId, wrapped questions",
    async () => {
      let raw = "";
      const harness = start(
        grokProfile(),
        {
          extNotifications: [
            "_x.ai/session/prompt_complete",
            "_x.ai/session_notification",
            "_x.ai/queue/changed",
            "_x.ai/task_completed",
          ],
          extRequests: {
            "_x.ai/exit_plan_mode": () => ({
              outcome: "abandoned",
              feedback: "captured",
            }),
            "_x.ai/ask_user_question": () => ({
              outcome: "accepted",
              answers: { "Which approach?": ["Safe"] },
            }),
          },
        },
        (chunk) => (raw += chunk),
      );
      const init = await harness.initialize({
        _meta: { clientType: "extension" },
      });
      expect(init.protocolVersion).toBe(1);
      expect(init).not.toHaveProperty("agentInfo");
      expect(init.agentCapabilities?.promptCapabilities?.image).toBe(false);
      expect(init.authMethods?.map((method) => method.id)).toEqual([
        "cached_token",
        "grok.com",
      ]);
      const modelState = init._meta?.modelState as AcpLegacyModelState;
      expect(modelState.currentModelId).toBe("grok-4.7");
      expect(
        modelState.availableModels[0]?._meta?.reasoningEfforts,
      ).toContainEqual({
        id: "high",
        value: "high",
        label: "High",
        description: "Thorough reasoning and quality. Recommended.",
        default: true,
      });

      const session = await harness.newSession();
      const sessionId = session.sessionId;
      // Legacy unstable `models`: outside the 1.7 types, kept on the wire.
      const { models } = session as { models?: AcpLegacyModelState };
      expect(models?.currentModelId).toBe("grok-4.7");
      expect(
        session.configOptions?.map((option) => [option.id, option.category]),
      ).toEqual([
        ["model", "model"],
        ["reasoning_effort", "thought_level"],
      ]);
      await harness.agent.request("session/set_model", {
        sessionId,
        modelId: "grok-4.5",
        _meta: { reasoningEffort: "medium" },
      });

      const promptMeta = {
        promptId: "t3-xai-prompt-1",
        requestId: "t3-xai-prompt-1",
      };
      expect(await harness.prompt(sessionId, "say hi", promptMeta)).toEqual({
        stopReason: "end_turn",
        _meta: {
          sessionId,
          requestId: "t3-xai-prompt-1",
          promptId: "t3-xai-prompt-1",
          modelId: "grok-4.7",
        },
      });
      const complete = await waitFor(
        () =>
          harness.calls.find(
            (call) => call.method === "_x.ai/session/prompt_complete",
          ),
        "prompt_complete",
      );
      expect(complete.params).toEqual({
        sessionId,
        promptId: "t3-xai-prompt-1",
        stopReason: "end_turn",
        agentResult: null,
      });
      expect(
        harness.calls.find(
          (call) => call.method === "_x.ai/session_notification",
        )?.params,
      ).toEqual({
        sessionId,
        update: {
          sessionUpdate: "turn_completed",
          prompt_id: "t3-xai-prompt-1",
          stop_reason: "end_turn",
        },
      });
      // The prompt id rides on the notification params, not on the update.
      const turn = harness.updates.filter(
        (n) =>
          n.update.sessionUpdate === "agent_message_chunk" ||
          n.update.sessionUpdate === "agent_thought_chunk",
      );
      expect(turn.map((n) => n._meta)).toEqual([
        { promptId: "t3-xai-prompt-1", updateType: "AgentThoughtChunk" },
        { promptId: "t3-xai-prompt-1", updateType: "AgentMessageChunk" },
      ]);
      expect(turn.every((n) => n.update._meta === undefined)).toBe(true);
      // The raw frame order matches the recording: turn_completed, then
      // prompt_complete, then the prompt response.
      const frames = splitLfLines(raw).map(
        (line) => JSON.parse(line) as Record<string, unknown>,
      );
      const methods = frames.map((frame) =>
        typeof frame.method === "string" ? frame.method : "response",
      );
      const completedAt = methods.indexOf("_x.ai/session_notification");
      expect(methods.slice(completedAt, completedAt + 4)).toEqual([
        "_x.ai/session_notification",
        "_x.ai/queue/changed",
        "_x.ai/session/prompt_complete",
        "response",
      ]);

      const limited = await harness
        .prompt(sessionId, "rate limited please")
        .catch((error: unknown) => error);
      expect((limited as acp.RequestError).code).toBe(-32003);

      expect(
        (await harness.prompt(sessionId, "plan it", { promptId: "p-plan" }))
          .stopReason,
      ).toBe("end_turn");
      expect(
        harness.calls.find((call) => call.method === "_x.ai/exit_plan_mode")
          ?.params,
      ).toEqual({
        method: "x.ai/exit_plan_mode",
        params: {
          sessionId,
          toolCallId: "exit-plan-mode-tool-call-1",
          planContent: "# Plan\n\n- step",
        },
      });

      expect(
        (await harness.prompt(sessionId, "ask me", { promptId: "p-ask" }))
          .stopReason,
      ).toBe("end_turn");
      const question = harness.calls.find(
        (call) => call.method === "_x.ai/ask_user_question",
      )?.params as { method: string; params: Record<string, unknown> };
      expect(question.method).toBe("x.ai/ask_user_question");
      expect(question.params).toMatchObject({
        sessionId,
        toolCallId: "ask-user-question-tool-call-1",
        mode: "plan",
        questions: [{ id: "approach", question: "Which approach?" }],
      });
      await harness.settle();
      expect(
        harness.updates.find(
          (n) =>
            n.update.sessionUpdate === "agent_message_chunk" &&
            n._meta?.promptId === "p-ask",
        )?.update,
      ).toMatchObject({ content: { text: "Going with the answer." } });
      expect(
        harness.calls.some((call) => call.method.startsWith("x.ai/")),
      ).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    "grok: a background wake turn after the response, and the prompt_complete race",
    async () => {
      let raw = "";
      const harness = start(
        grokProfile(),
        {
          extNotifications: [
            "_x.ai/session/prompt_complete",
            "_x.ai/session_notification",
            "_x.ai/queue/changed",
            "_x.ai/task_completed",
          ],
        },
        (chunk) => (raw += chunk),
      );
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      const wakeId = "task-completed-00000000-0000-4000-8000-000000000002";

      await harness.prompt(sessionId, "run it in the background", {
        promptId: "p-bg",
      });
      const wakeEnd = await waitFor(
        () =>
          harness.calls.find(
            (call) =>
              call.method === "_x.ai/session_notification" &&
              (call.params as { update: { prompt_id?: string } }).update
                .prompt_id === wakeId,
          ),
        "wake turn_completed",
      );
      expect(wakeEnd.params).toMatchObject({
        sessionId,
        update: { sessionUpdate: "turn_completed", stop_reason: "end_turn" },
      });
      await harness.settle();
      const wake = harness.updates.filter((n) => n._meta?.promptId === wakeId);
      expect(wake.map((n) => n.update.sessionUpdate)).toEqual([
        "agent_thought_chunk",
        "agent_message_chunk",
      ]);
      // Only the user turn completes through prompt_complete.
      expect(
        harness.calls
          .filter((call) => call.method === "_x.ai/session/prompt_complete")
          .map((call) => (call.params as { promptId: string }).promptId),
      ).toEqual(["p-bg"]);
      // On the wire every wake frame follows the prompt response.
      const frames = splitLfLines(raw).map(
        (line) => JSON.parse(line) as Record<string, unknown>,
      );
      const responseAt = frames.findIndex(
        (frame) =>
          (frame.result as { _meta?: { promptId?: string } } | undefined)?._meta
            ?.promptId === "p-bg",
      );
      const firstWakeAt = frames.findIndex((frame) =>
        JSON.stringify(frame).includes(wakeId),
      );
      expect(responseAt).toBeGreaterThan(-1);
      expect(firstWakeAt).toBeGreaterThan(responseAt);

      // The race: prompt_complete arrives and the prompt request never answers.
      const racing = harness.prompt(sessionId, "race me", {
        promptId: "p-race",
      });
      await waitFor(
        () =>
          harness.calls.find(
            (call) =>
              call.method === "_x.ai/session/prompt_complete" &&
              (call.params as { promptId: string }).promptId === "p-race",
          ),
        "race prompt_complete",
      );
      await harness.agent.notify("session/cancel", {
        sessionId,
        _meta: { cancelTrigger: "ctrl_c" },
      });
      expect(await withTimeout(racing, 5_000, "grok race prompt")).toEqual({
        stopReason: "cancelled",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "grok: methodPrefix '' sends the canonical x.ai/* names",
    async () => {
      const harness = start(grokProfile({ methodPrefix: "" }), {
        extNotifications: [
          "x.ai/session/prompt_complete",
          "x.ai/session_notification",
          "x.ai/queue/changed",
        ],
      });
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      await harness.prompt(sessionId, "hi", { promptId: "p-1" });
      await waitFor(
        () =>
          harness.calls.find(
            (call) => call.method === "x.ai/session/prompt_complete",
          ),
        "canonical prompt_complete",
      );
      expect(harness.calls.some((call) => call.method.startsWith("_"))).toBe(
        false,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "antigravity: v2 version number, browser sign-in on authenticate, interaction questions",
    async () => {
      let stdout = "";
      const permissions: acp.RequestPermissionRequest[] = [];
      const harness = start(
        antigravityProfile(),
        {
          readTextFile: () => ({ content: "# Readme" }),
          requestPermission: (params) => {
            permissions.push(params);
            return {
              outcome: {
                outcome: "selected",
                optionId: params.toolCall.toolCallId.startsWith("interaction_")
                  ? "dev"
                  : "allow-once",
              },
            };
          },
        },
        (chunk) => (stdout += chunk),
      );
      const init = await harness.initialize();
      expect(init.protocolVersion).toBe(2);
      expect(stdout).not.toContain("Open the following link");

      // authenticate prints the URL, then waits for the OAuth redirect.
      let signedIn = false;
      const auth = harness.agent
        .request("authenticate", { methodId: "oauth-personal" })
        .then((result) => {
          signedIn = true;
          return result;
        });
      const link = await waitFor(
        () =>
          /Open the following link to authenticate the ACP server: (\S+)/.exec(
            stdout,
          )?.[1],
        "sign-in URL",
      );
      const signIn = new URL(link);
      expect(signIn.origin + signIn.pathname).toBe(
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      const redirect = signIn.searchParams.get("redirect_uri") ?? "";
      expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      const early = await harness.newSession().catch((error: unknown) => error);
      expect((early as acp.RequestError).code).toBe(-32000);
      expect(signedIn).toBe(false);

      const callback = await fetch(
        `${redirect}?state=mock-state&code=4%2Fmock-code&scope=openid&iss=${encodeURIComponent("https://accounts.google.com")}`,
      );
      expect(callback.status).toBe(200);
      expect(await withTimeout(auth, 5_000, "authenticate")).toEqual({});

      const resumed = await harness.agent.request("session/resume", {
        sessionId: "agy-1",
        cwd: "/work/repo",
      });
      expect(resumed.modes?.availableModes.map((mode) => mode.id)).toEqual([
        "default",
        "auto_edit",
        "yolo",
      ]);
      await harness.agent.request("session/set_mode", {
        sessionId: "agy-1",
        modeId: "yolo",
      });
      expect(await harness.prompt("agy-1", "go")).toEqual({
        stopReason: "end_turn",
      });
      expect(permissions.map((request) => request.toolCall.toolCallId)).toEqual(
        ["interaction_1", "edit-1"],
      );
      expect(permissions[1]?._meta?.["agy.security.warning"]).toBeString();
      expect(harness.calls[0]).toEqual({
        method: "fs/read_text_file",
        params: { sessionId: "agy-1", path: "/work/repo/README.md" },
      });

      // An API-key method does not open the browser.
      const before = stdout;
      await harness.agent.request("authenticate", {
        methodId: "gemini-api-key",
      });
      expect(stdout.slice(before.length)).not.toContain("Open the following");
    },
    TEST_TIMEOUT,
  );

  it(
    "devin: cognition _meta on updates, foreign subagent sessions and client terminals",
    async () => {
      const harness = start(devinProfile(), {
        createTerminal: () => ({ terminalId: "t-1" }),
        waitForTerminalExit: () => ({ exitCode: 0 }),
        terminalOutput: () => ({
          output: "pass",
          truncated: false,
          exitStatus: { exitCode: 0 },
        }),
        releaseTerminal: () => ({}),
      });
      await harness.initialize({
        clientCapabilities: {
          terminal: true,
          _meta: {
            "cognition.ai/subagentSupport": true,
            "cognition.ai/messageGrouping": true,
          },
        },
      });
      const session = await harness.newSession("/work/repo");
      await harness.prompt(session.sessionId, "go");
      await harness.settle();

      const sessions = new Set(harness.updates.map((n) => n.sessionId));
      expect([...sessions].sort()).toEqual([session.sessionId, "sub-1"].sort());
      const subagent = harness.updates.find((n) => n.sessionId === "sub-1");
      expect(subagent?.update._meta).toEqual({
        "cognition.ai/subagent_context": { parentAgentId: session.sessionId },
      });
      const started = harness.updates.find(
        (n) =>
          n.update.sessionUpdate === "tool_call" &&
          n.update.toolCallId === "devin-sub-1",
      );
      expect(started?.update._meta?.["cognition.ai/inferenceToolName"]).toBe(
        "spawn_subagent",
      );
      expect(harness.calls.map((call) => call.method)).toEqual([
        "terminal/create",
        "terminal/wait_for_exit",
        "terminal/output",
        "terminal/release",
      ]);
    },
    TEST_TIMEOUT,
  );
});
