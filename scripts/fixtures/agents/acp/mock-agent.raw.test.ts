// Byte-level checks of mock-agent.ts: what actually crosses the pipe.
import { afterEach, describe, expect, it } from "bun:test";

import {
  killAllFixtures,
  spawnFixture,
  splitLfLines,
  waitFor,
  withTimeout,
} from "../shared/test-support";
import { ACP_MOCK_SCENARIO_ENV, type AcpMockScenario } from "./scenario";
import {
  MOCK_AGENT_PATH,
  startAcpHarness,
  type AcpHarness,
} from "./test-harness";

const TEST_TIMEOUT = 20_000;
const harnesses: AcpHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.dispose()));
  await killAllFixtures();
});

function startRaw(scenario: AcpMockScenario) {
  const fixture = spawnFixture(MOCK_AGENT_PATH, {
    env: { [ACP_MOCK_SCENARIO_ENV]: JSON.stringify(scenario) },
  });
  const send = (frame: object) =>
    fixture.child.stdin.write(`${JSON.stringify(frame)}\n`);
  const lines = () => splitLfLines(fixture.stdoutText());
  const frames = () =>
    lines().flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
  const responseTo = (id: number) =>
    waitFor(
      () => frames().find((frame) => frame.id === id && !("method" in frame)),
      `response ${id}`,
    );
  return { fixture, send, lines, frames, responseTo };
}

const initialize = {
  jsonrpc: "2.0",
  id: 0,
  method: "initialize",
  params: { protocolVersion: 1, clientCapabilities: {} },
};
const newSession = {
  jsonrpc: "2.0",
  id: 1,
  method: "session/new",
  params: { cwd: "/work", mcpServers: [] },
};

describe("ACP mock agent on the wire", () => {
  it(
    "writes noise lines verbatim between NDJSON frames",
    async () => {
      const banner =
        "Open the following link to authenticate the ACP server: https://accounts.google.com/o/oauth2/v2/auth";
      const raw = startRaw({
        faults: { startupStdout: [banner, "{not json"] },
        prompts: [
          {
            steps: [
              { type: "text", text: "before" },
              { type: "stdout", lines: ["mid-turn garbage"] },
              { type: "text", text: "after" },
            ],
          },
        ],
      });
      raw.send(initialize);
      raw.send(newSession);
      await raw.responseTo(1);
      raw.send({
        jsonrpc: "2.0",
        id: 2,
        method: "session/prompt",
        params: {
          sessionId: "mock-session-1",
          prompt: [{ type: "text", text: "hi" }],
        },
      });
      await raw.responseTo(2);

      const lines = raw.lines();
      expect(lines.slice(0, 2)).toEqual([banner, "{not json"]);
      expect(lines[2]).toStartWith(
        '{"jsonrpc":"2.0","id":0,"result":{"protocolVersion":1,',
      );
      expect(lines.slice(3)).toEqual([
        '{"jsonrpc":"2.0","id":1,"result":{"sessionId":"mock-session-1"}}',
        '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"mock-session-1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"before"}}}}',
        "mid-turn garbage",
        '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"mock-session-1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"after"}}}}',
        '{"jsonrpc":"2.0","id":2,"result":{"stopReason":"end_turn"}}',
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "sends the load replay before the load response, and splits frames when asked",
    async () => {
      const raw = startRaw({
        faults: { splitFramesBytes: 5 },
        session: {
          load: {
            replay: [
              {
                sessionUpdate: "user_message_chunk",
                content: { type: "text", text: "q" },
              },
              {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "a" },
              },
            ],
          },
        },
      });
      raw.send(initialize);
      raw.send({
        jsonrpc: "2.0",
        id: 1,
        method: "session/load",
        params: { sessionId: "old", cwd: "/work", mcpServers: [] },
      });
      await raw.responseTo(1);
      const methods = raw
        .frames()
        .map((frame) => frame.method ?? `response:${String(frame.id)}`);
      expect(methods).toEqual([
        "response:0",
        "session/update",
        "session/update",
        "response:1",
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "takes session/cancel as a notification without an id",
    async () => {
      const raw = startRaw({
        prompts: [{ steps: [{ type: "waitForCancel" }] }],
      });
      raw.send(initialize);
      raw.send(newSession);
      await raw.responseTo(1);
      raw.send({
        jsonrpc: "2.0",
        id: 2,
        method: "session/prompt",
        params: {
          sessionId: "mock-session-1",
          prompt: [{ type: "text", text: "go" }],
        },
      });
      raw.send({
        jsonrpc: "2.0",
        method: "session/cancel",
        params: { sessionId: "mock-session-1" },
      });
      expect(await raw.responseTo(2)).toEqual({
        jsonrpc: "2.0",
        id: 2,
        result: { stopReason: "cancelled" },
      });
      // The notification got no response of its own.
      expect(raw.frames().filter((frame) => !("method" in frame))).toHaveLength(
        3,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "emits update kinds outside the 1.7 union, which the SDK client silently drops",
    async () => {
      let stdout = "";
      const harness = startAcpHarness(
        {
          prompts: [
            {
              steps: [
                {
                  type: "update",
                  update: {
                    sessionUpdate: "subagent_finished",
                    child_session_id: "child-1",
                    status: "completed",
                    output: "done",
                  },
                },
                { type: "text", text: "visible" },
              ],
            },
          ],
        },
        {},
        { stdoutTap: (chunk) => (stdout += chunk) },
      );
      harnesses.push(harness);
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      const errors: unknown[][] = [];
      const originalError = console.error;
      console.error = (...args: unknown[]) => errors.push(args);
      try {
        await harness.prompt(sessionId, "go");
        await harness.settle();
      } finally {
        console.error = originalError;
      }
      expect(errors.map((args) => args[0])).toContain(
        "Error handling notification",
      );

      expect(stdout).toContain('"sessionUpdate":"subagent_finished"');
      // Trap 1: the SDK's session/update router fails to parse the unknown
      // kind, so the client handler only ever sees the text chunk.
      expect(harness.updates.map((n) => n.update.sessionUpdate)).toEqual([
        "agent_message_chunk",
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "keeps running after stdin closes when exitOnStdinClose is false",
    async () => {
      const raw = startRaw({ faults: { exitOnStdinClose: false } });
      raw.send(initialize);
      await raw.responseTo(0);
      raw.fixture.child.stdin.end();
      const exited = await withTimeout(raw.fixture.exited, 300, "exit").catch(
        (error: unknown) => error,
      );
      expect((exited as Error).name).toBe("FixtureTimeoutError");
    },
    TEST_TIMEOUT,
  );
});
