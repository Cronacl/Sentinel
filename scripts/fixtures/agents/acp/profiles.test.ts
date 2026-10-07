import { afterEach, describe, expect, it } from "bun:test";

import * as acp from "@agentclientprotocol/sdk";

import { killAllFixtures, waitFor, withTimeout } from "../shared/test-support";
import {
  antigravityProfile,
  cursorProfile,
  devinProfile,
  grokProfile,
} from "./profiles";
import type { AcpMockScenario } from "./scenario";
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
    "grok: prompt_complete settles the turn while the prompt request hangs",
    async () => {
      const harness = start(grokProfile(), {
        extNotifications: ["x.ai/session/prompt_complete"],
        extRequests: {
          "x.ai/exit_plan_mode": () => ({
            outcome: "abandoned",
            feedback: "captured",
          }),
          "x.ai/ask_user_question": () => ({
            outcome: "accepted",
            answers: { "Which approach?": ["Safe"] },
          }),
        },
      });
      const init = await harness.initialize({
        _meta: { clientType: "extension" },
      });
      expect(init.agentCapabilities?.promptCapabilities?.image).toBe(false);
      const session = await harness.newSession();
      await harness.agent.request("session/set_model", {
        sessionId: session.sessionId,
        modelId: "grok-4.5",
        _meta: { reasoningEffort: "high" },
      });

      const prompt = harness.prompt(session.sessionId, "build it", {
        promptId: "p-1",
        requestId: "r-1",
      });
      const complete = await waitFor(
        () =>
          harness.calls.find(
            (call) => call.method === "x.ai/session/prompt_complete",
          ),
        "prompt_complete",
      );
      expect(complete.params).toEqual({
        sessionId: session.sessionId,
        promptId: "p-1",
        stopReason: "end_turn",
      });
      expect(
        harness.updates.some(
          (n) =>
            n.update.sessionUpdate === "agent_message_chunk" &&
            n.update._meta?.promptId === "task-completed-1",
        ),
      ).toBe(true);
      await harness.agent.notify("session/cancel", {
        sessionId: session.sessionId,
        _meta: { cancelTrigger: "ctrl_c" },
      });
      expect(await withTimeout(prompt, 5_000, "grok prompt")).toEqual({
        stopReason: "cancelled",
      });

      const limited = await harness
        .prompt(session.sessionId, "rate limited please")
        .catch((error: unknown) => error);
      expect((limited as acp.RequestError).code).toBe(-32003);
      expect(await harness.prompt(session.sessionId, "plan it")).toEqual({
        stopReason: "end_turn",
      });
      expect(await harness.prompt(session.sessionId, "ask me")).toEqual({
        stopReason: "end_turn",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "antigravity: v2 version number, stdout sign-in URL, eager auth, interaction questions",
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
      expect(stdout).toContain(
        "Open the following link to authenticate the ACP server:",
      );
      await harness.agent.request("authenticate", {
        methodId: "oauth-personal",
      });
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
