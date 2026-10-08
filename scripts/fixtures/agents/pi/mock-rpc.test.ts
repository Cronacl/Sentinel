import { afterEach, describe, expect, it } from "bun:test";

import type { JsonObject } from "../shared/fixture-io";
import { killAllFixtures, waitFor, withTimeout } from "../shared/test-support";
import type { PiMockScenario } from "./scenario";
import { startPiDriver, type PiDriver } from "./test-driver";

const TEST_TIMEOUT = 20_000;
const drivers: PiDriver[] = [];

function start(scenario: PiMockScenario = {}) {
  const driver = startPiDriver(scenario);
  drivers.push(driver);
  return driver;
}

afterEach(async () => {
  await Promise.all(drivers.splice(0).map((driver) => driver.dispose()));
  await killAllFixtures();
});

const settled = (driver: PiDriver, count = 1) =>
  waitFor(
    () =>
      driver.events().filter((event) => event.type === "agent_settled")
        .length >= count,
    "agent_settled",
  );

const eventTypes = (driver: PiDriver) =>
  driver.records.map((record) =>
    record.type === "message_update"
      ? `update:${String((record.assistantMessageEvent as JsonObject).type)}`
      : record.type === "message_start" || record.type === "message_end"
        ? `${String(record.type)}:${String((record.message as JsonObject).role)}`
        : record.type === "response"
          ? `response:${String(record.command)}`
          : String(record.type),
  );

describe("Pi RPC mock: commands", () => {
  it(
    "answers state, model and thinking commands with Pi's response shapes",
    async () => {
      const driver = start({
        commands: [
          {
            name: "fix-tests",
            description: "Fix failing tests",
            source: "prompt",
            sourceInfo: {
              path: "/p/fix-tests.md",
              source: "local",
              scope: "project",
              origin: "top-level",
            },
          },
        ],
      });
      const state = await driver.request("get_state");
      expect(state).toMatchObject({
        type: "response",
        command: "get_state",
        success: true,
        data: {
          model: { id: "claude-sonnet-4-20250514", provider: "anthropic" },
          thinkingLevel: "medium",
          isStreaming: false,
          isCompacting: false,
          sessionFile: expect.stringMatching(/\.jsonl$/),
          sessionId: expect.any(String),
          messageCount: 0,
          pendingMessageCount: 0,
        },
      });

      const models = await driver.request("get_available_models");
      expect(
        (models.data as { models: JsonObject[] }).models.map(
          (m) => `${m.provider}/${m.id}`,
        ),
      ).toEqual(["anthropic/claude-sonnet-4-20250514", "openai/gpt-5.6"]);
      expect(
        await driver.request("set_model", {
          provider: "openai",
          modelId: "gpt-5.6",
        }),
      ).toMatchObject({
        success: true,
        data: { id: "gpt-5.6", provider: "openai" },
      });
      expect(
        await driver.request("set_model", { provider: "x", modelId: "y" }),
      ).toMatchObject({
        success: false,
        error: "Model not found: x/y",
      });
      expect(
        await driver.request("get_available_thinking_levels"),
      ).toMatchObject({
        data: { levels: ["off", "minimal", "low", "medium", "high"] },
      });
      const thinking = await driver.request("set_thinking_level", {
        level: "high",
      });
      expect(thinking).toEqual({
        id: thinking.id,
        type: "response",
        command: "set_thinking_level",
        success: true,
      });
      expect(driver.events()).toContainEqual({
        type: "thinking_level_changed",
        level: "high",
      });
      expect(await driver.request("cycle_model")).toMatchObject({
        data: {
          model: { id: "claude-sonnet-4-20250514" },
          thinkingLevel: "high",
          isScoped: false,
        },
      });
      expect(await driver.request("get_commands")).toMatchObject({
        data: { commands: [{ name: "fix-tests", source: "prompt" }] },
      });
      expect(await driver.request("teleport")).toMatchObject({
        command: "teleport",
        success: false,
        error: "Unknown command: teleport",
      });

      driver.send({ broken: true } as JsonObject);
      driver.fixture.child.stdin.write("{nope\n");
      const parse = await waitFor(
        () => driver.records.find((record) => record.command === "parse"),
        "parse error",
      );
      expect(parse).toMatchObject({
        type: "response",
        command: "parse",
        success: false,
      });
      expect(parse).not.toHaveProperty("id");
      expect(String(parse.error)).toStartWith("Failed to parse command:");
      expect(driver.log().map((entry) => entry.kind)).toContain("unparsable");
    },
    TEST_TIMEOUT,
  );

  it(
    "manages sessions, entries, forks, names, stats and bash",
    async () => {
      const driver = start({
        sessions: {
          "/sessions/old.jsonl": {
            sessionId: "old",
            sessionName: "Old work",
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: "earlier" }],
                timestamp: 1,
              },
              {
                role: "assistant",
                content: [{ type: "text", text: "reply" }],
                timestamp: 2,
              },
            ],
            entries: [
              {
                type: "message",
                id: "e-1",
                parentId: null,
                timestamp: "2026-10-01T00:00:00.000Z",
                message: {
                  role: "user",
                  content: [{ type: "text", text: "earlier" }],
                  timestamp: 1,
                },
              },
              {
                type: "message",
                id: "e-2",
                parentId: "e-1",
                timestamp: "2026-10-01T00:00:01.000Z",
                message: {
                  role: "assistant",
                  content: [{ type: "text", text: "reply" }],
                  timestamp: 2,
                },
              },
            ],
          },
        },
        bash: { "ls -la": { output: "total 0\n", exitCode: 0 } },
      });
      expect(
        await driver.request("switch_session", {
          sessionPath: "/sessions/missing.jsonl",
        }),
      ).toMatchObject({
        success: false,
      });
      expect(
        await driver.request("switch_session", {
          sessionPath: "/sessions/old.jsonl",
        }),
      ).toMatchObject({
        success: true,
        data: { cancelled: false },
      });
      expect(await driver.request("get_state")).toMatchObject({
        data: {
          sessionId: "old",
          sessionFile: "/sessions/old.jsonl",
          sessionName: "Old work",
        },
      });
      expect(
        await driver.request("get_entries", { since: "e-1" }),
      ).toMatchObject({
        data: { entries: [{ id: "e-2" }], leafId: "e-2" },
      });
      expect(
        await driver.request("get_entries", { since: "zzz" }),
      ).toMatchObject({ success: false });
      expect(await driver.request("get_fork_messages")).toMatchObject({
        data: { messages: [{ entryId: "e-1", text: "earlier" }] },
      });
      expect(await driver.request("get_tree")).toMatchObject({
        data: {
          tree: [
            { entry: { id: "e-1" }, children: [{ entry: { id: "e-2" } }] },
          ],
          leafId: "e-2",
        },
      });
      expect(await driver.request("get_last_assistant_text")).toMatchObject({
        data: { text: "reply" },
      });
      expect(await driver.request("fork", { entryId: "e-1" })).toMatchObject({
        data: { text: "earlier", cancelled: false },
      });
      const forked = await driver.request("get_state");
      expect((forked.data as JsonObject).sessionId).not.toBe("old");

      expect(
        await driver.request("set_session_name", { name: "  " }),
      ).toMatchObject({
        success: false,
        error: "Session name cannot be empty",
      });
      expect(
        await driver.request("set_session_name", { name: "Feature" }),
      ).toMatchObject({ success: true });
      expect(driver.events()).toContainEqual({
        type: "session_info_changed",
        name: "Feature",
      });

      const bash = await driver.request("bash", { command: "ls -la" });
      expect(bash.data).toEqual({
        output: "total 0\n",
        exitCode: 0,
        cancelled: false,
        truncated: false,
      });
      expect(driver.events()).toContainEqual({
        type: "bash_execution_update",
        id: bash.id,
        delta: "total 0\n",
      });
      expect(await driver.request("get_session_stats")).toMatchObject({
        data: {
          sessionId: expect.any(String),
          tokens: { total: 0 },
          contextUsage: { contextWindow: 200000 },
        },
      });
      expect(
        await driver.request("new_session", {
          parentSession: "/sessions/old.jsonl",
        }),
      ).toMatchObject({
        data: { cancelled: false },
      });
      expect(await driver.request("get_messages")).toMatchObject({
        data: { messages: [] },
      });
      expect(await driver.request("export_html")).toMatchObject({
        data: { path: "/tmp/pi-session.html" },
      });
    },
    TEST_TIMEOUT,
  );
});

describe("Pi RPC mock: runs", () => {
  it(
    "streams a full run: response, thinking, text, tool execution, settle",
    async () => {
      const driver = start({
        prompts: [
          {
            steps: [
              { type: "thinking", text: ["Let me ", "look."] },
              { type: "text", text: "Listing files." },
              {
                type: "toolCall",
                id: "call_1",
                name: "bash",
                args: { command: "ls" },
                updates: [
                  { content: [{ type: "text", text: "partial" }], details: {} },
                ],
                result: {
                  content: [{ type: "text", text: "a.ts\n" }],
                  details: { exitCode: 0 },
                },
              },
              { type: "text", text: ["Found ", "a.ts"] },
            ],
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 15,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0.001,
              },
            },
          },
        ],
      });
      const response = await driver.request("prompt", {
        message: "what is here?",
        images: [{ type: "image", data: "aGk=", mimeType: "image/png" }],
      });
      expect(response).toEqual({
        id: response.id,
        type: "response",
        command: "prompt",
        success: true,
        data: { disposition: "started" },
      });
      await settled(driver);

      expect(eventTypes(driver)).toEqual([
        "response:prompt",
        "agent_start",
        "turn_start",
        "message_start:user",
        "message_end:user",
        "message_start:assistant",
        "update:thinking_start",
        "update:thinking_delta",
        "update:thinking_delta",
        "update:thinking_end",
        "update:text_start",
        "update:text_delta",
        "update:text_end",
        "update:toolcall_start",
        "update:toolcall_delta",
        "update:toolcall_end",
        "message_end:assistant",
        "tool_execution_start",
        "tool_execution_update",
        "tool_execution_end",
        "message_start:toolResult",
        "message_end:toolResult",
        "turn_end",
        "turn_start",
        "message_start:assistant",
        "update:text_start",
        "update:text_delta",
        "update:text_delta",
        "update:text_end",
        "message_end:assistant",
        "turn_end",
        "agent_end",
        "agent_settled",
      ]);
      const user = driver.records[3]?.message as JsonObject;
      expect(user.content).toEqual([
        { type: "text", text: "what is here?" },
        { type: "image", data: "aGk=", mimeType: "image/png" },
      ]);
      const delta = driver.records.find(
        (record) => record.type === "message_update",
      );
      expect(Object.keys(delta ?? {})).toEqual([
        "type",
        "usage",
        "assistantMessageEvent",
      ]);
      expect(
        driver.records.find((record) => record.type === "tool_execution_end"),
      ).toEqual({
        type: "tool_execution_end",
        toolCallId: "call_1",
        toolName: "bash",
        result: {
          content: [{ type: "text", text: "a.ts\n" }],
          details: { exitCode: 0 },
        },
        isError: false,
      });
      const finalMessage = driver.records
        .filter((record) => record.type === "message_end")
        .at(-1)?.message as JsonObject;
      expect(finalMessage).toMatchObject({
        role: "assistant",
        stopReason: "stop",
        content: [{ type: "text", text: "Found a.ts" }],
        usage: { totalTokens: 15 },
      });
      const end = driver.records.find((record) => record.type === "agent_end");
      expect(
        (end?.messages as JsonObject[]).map((message) => message.role),
      ).toEqual(["user", "assistant", "toolResult", "assistant"]);
      expect(await driver.request("get_session_stats")).toMatchObject({
        data: {
          userMessages: 1,
          assistantMessages: 2,
          toolCalls: 1,
          toolResults: 1,
        },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "asks extension UI dialogs and branches on extension_ui_response",
    async () => {
      const driver = start({
        prompts: [
          {
            steps: [
              {
                type: "ui",
                method: "confirm",
                fields: { title: "Run bash?", message: "rm -rf build" },
                branches: {
                  confirmed: [{ type: "text", text: "confirmed" }],
                  declined: [{ type: "text", text: "declined" }],
                },
              },
              {
                type: "ui",
                method: "select",
                fields: { title: "Pick", options: ["Allow", "Block"] },
                branches: {
                  Allow: [{ type: "text", text: "allowed" }],
                  "*": [{ type: "text", text: "other" }],
                },
              },
              {
                type: "ui",
                method: "input",
                fields: { title: "Name?", placeholder: "type", timeout: 200 },
                branches: { timeout: [{ type: "text", text: "timed out" }] },
              },
              {
                type: "ui",
                method: "notify",
                fields: { message: "heads up", notifyType: "warning" },
              },
              {
                type: "ui",
                method: "editor",
                fields: { title: "Edit", prefill: "a\nb" },
                branches: {
                  cancelled: [{ type: "text", text: "editor cancelled" }],
                },
              },
            ],
          },
        ],
      });
      await driver.request("prompt", { message: "go" });
      const respond = async (method: string, reply: JsonObject) => {
        const request = await driver.waitForEvent(
          (event) =>
            event.type === "extension_ui_request" && event.method === method,
          method,
        );
        driver.send({
          type: "extension_ui_response",
          id: request.id,
          ...reply,
        });
        return request;
      };
      const confirm = await respond("confirm", { confirmed: true });
      expect(confirm).toEqual({
        type: "extension_ui_request",
        id: expect.any(String),
        method: "confirm",
        title: "Run bash?",
        message: "rm -rf build",
      });
      await respond("select", { value: "Allow" });
      await respond("editor", { cancelled: true });
      await settled(driver);

      const texts = driver.records.flatMap((record) => {
        const event = record.assistantMessageEvent as JsonObject | undefined;
        return event?.type === "text_end" ? [event.content] : [];
      });
      expect(texts).toEqual([
        "confirmed",
        "allowed",
        "timed out",
        "editor cancelled",
      ]);
      expect(driver.events()).toContainEqual({
        type: "extension_ui_request",
        id: expect.any(String),
        method: "notify",
        message: "heads up",
        notifyType: "warning",
      });
      expect(
        driver.log().filter((entry) => entry.kind === "ui_response"),
      ).toHaveLength(3);
    },
    TEST_TIMEOUT,
  );

  it(
    "queues steering while streaming and delivers it at the next tool boundary",
    async () => {
      const driver = start({
        prompts: [
          {
            match: "change course",
            steps: [{ type: "text", text: "steered reply" }],
          },
          {
            steps: [
              { type: "text", text: "working" },
              {
                type: "toolCall",
                name: "read",
                args: { path: "a.ts" },
                durationMs: 400,
              },
              { type: "text", text: "dropped after steering" },
            ],
          },
        ],
      });
      await driver.request("prompt", { message: "start" });
      await driver.waitForEvent(
        (event) => event.type === "tool_execution_start",
        "tool start",
      );

      const busy = await driver.request("prompt", { message: "change course" });
      expect(busy).toMatchObject({
        success: false,
        error:
          "Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.",
      });
      const steer = await driver.request("prompt", {
        message: "change course",
        streamingBehavior: "steer",
      });
      expect(steer).toMatchObject({
        success: true,
        data: { disposition: "queued" },
      });
      expect(driver.events()).toContainEqual({
        type: "queue_update",
        steering: ["change course"],
        followUp: [],
      });
      expect(await driver.request("get_state")).toMatchObject({
        data: { isStreaming: true, pendingMessageCount: 1 },
      });
      await settled(driver);

      const users = driver.records.flatMap((record) =>
        record.type === "message_end" &&
        (record.message as JsonObject).role === "user"
          ? [
              (record.message as { content: Array<{ text: string }> })
                .content[0]?.text,
            ]
          : [],
      );
      expect(users).toEqual(["start", "change course"]);
      const texts = driver.records.flatMap((record) => {
        const event = record.assistantMessageEvent as JsonObject | undefined;
        return event?.type === "text_end" ? [event.content] : [];
      });
      expect(texts).toEqual(["working", "steered reply"]);
      expect(
        driver.events().filter((event) => event.type === "agent_start"),
      ).toHaveLength(1);
      expect(
        driver.events().filter((event) => event.type === "agent_settled"),
      ).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "aborts a hung run: aborted message, agent_end and agent_settled before the abort response",
    async () => {
      const driver = start({
        prompts: [
          {
            steps: [{ type: "text", text: "thinking hard" }, { type: "hang" }],
          },
        ],
      });
      await driver.request("prompt", { message: "go" });
      await driver.waitForEvent(
        (event) =>
          (event.assistantMessageEvent as JsonObject | undefined)?.type ===
          "text_end",
        "text",
      );
      const abort = await driver.request("abort");
      expect(abort).toEqual({
        id: abort.id,
        type: "response",
        command: "abort",
        success: true,
      });
      const types = eventTypes(driver);
      expect(types.slice(-5)).toEqual([
        "message_end:assistant",
        "turn_end",
        "agent_end",
        "agent_settled",
        "response:abort",
      ]);
      const aborted = driver.records
        .filter((record) => record.type === "message_end")
        .at(-1)?.message as JsonObject;
      expect(aborted).toMatchObject({
        stopReason: "aborted",
        errorMessage: "Request was aborted",
      });
      expect(await driver.request("abort")).toMatchObject({ success: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "opens a session's first run with its system message and fails an empty compaction",
    async () => {
      const driver = start({
        systemMessage: { sections: { preamble: "You are Pi." } },
        compactFailure: "Nothing to compact (session too small)",
      });
      const compact = await driver.request("compact", {});
      expect(compact).toEqual({
        id: compact.id,
        type: "response",
        command: "compact",
        success: false,
        error: "Nothing to compact (session too small)",
      });
      expect(driver.events()).toEqual([
        { type: "compaction_start", reason: "manual" },
        {
          type: "compaction_end",
          reason: "manual",
          aborted: false,
          willRetry: false,
          errorMessage:
            "Compaction failed: Nothing to compact (session too small)",
        },
      ]);

      await driver.request("prompt", { message: "first" });
      await settled(driver);
      await driver.request("prompt", { message: "second" });
      await settled(driver, 2);
      const types = eventTypes(driver);
      const firstRun = types.slice(types.indexOf("agent_start"));
      expect(firstRun.slice(0, 6)).toEqual([
        "agent_start",
        "turn_start",
        "message_start:system",
        "message_end:system",
        "message_start:user",
        "message_end:user",
      ]);
      expect(
        types.filter((type) => type === "message_start:system"),
      ).toHaveLength(1);
      const system = driver
        .events()
        .find(
          (event) =>
            event.type === "message_end" &&
            (event.message as JsonObject).role === "system",
        )?.message;
      expect(system).toMatchObject({
        role: "system",
        content: "",
        sections: { preamble: "You are Pi." },
        timestamp: expect.any(Number),
      });
      const messages = (await driver.request("get_messages")).data as {
        messages: JsonObject[];
      };
      expect(messages.messages.map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "user",
        "assistant",
      ]);

      // A new session starts over with a fresh system message.
      await driver.request("new_session", {});
      await driver.request("prompt", { message: "third" });
      await settled(driver, 3);
      expect(
        eventTypes(driver).filter((type) => type === "message_start:system"),
      ).toHaveLength(2);
    },
    TEST_TIMEOUT,
  );

  it(
    "emits compaction, retry and extension error events, and compacts on command",
    async () => {
      const driver = start({
        prompts: [
          {
            steps: [
              {
                type: "retry",
                attempt: 1,
                maxAttempts: 3,
                delayMs: 2000,
                errorMessage: "529 overloaded",
              },
              { type: "compaction", reason: "overflow", willRetry: true },
              { type: "extensionError", error: "boom" },
              { type: "text", text: "recovered" },
            ],
          },
        ],
      });
      await driver.request("prompt", { message: "go" });
      await settled(driver);
      expect(driver.events()).toContainEqual({
        type: "auto_retry_start",
        attempt: 1,
        maxAttempts: 3,
        delayMs: 2000,
        errorMessage: "529 overloaded",
      });
      expect(driver.events()).toContainEqual({
        type: "auto_retry_end",
        success: true,
        attempt: 2,
      });
      expect(driver.events()).toContainEqual({
        type: "compaction_start",
        reason: "overflow",
      });
      expect(driver.events()).toContainEqual(
        expect.objectContaining({
          type: "compaction_end",
          reason: "overflow",
          aborted: false,
          willRetry: true,
        }),
      );
      expect(driver.events()).toContainEqual(
        expect.objectContaining({
          type: "extension_error",
          event: "tool_call",
          error: "boom",
        }),
      );

      const compact = await driver.request("compact", {
        customInstructions: "focus",
      });
      expect(compact.data).toMatchObject({
        summary: expect.any(String),
        tokensBefore: 150000,
        estimatedTokensAfter: 32000,
      });
      expect(
        driver
          .events()
          .filter((event) => event.type === "compaction_start")
          .at(-1),
      ).toEqual({
        type: "compaction_start",
        reason: "manual",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "rejects or handles prompts per script",
    async () => {
      const driver = start({
        prompts: [
          { match: "/mycommand", disposition: "handled" },
          { match: "no model", reject: "No model selected." },
        ],
      });
      expect(
        await driver.request("prompt", { message: "/mycommand now" }),
      ).toMatchObject({
        success: true,
        data: { disposition: "handled" },
      });
      expect(
        await driver.request("prompt", { message: "no model please" }),
      ).toMatchObject({
        success: false,
        error: "No model selected.",
      });
      expect(driver.events()).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe("Pi RPC mock: framing and faults", () => {
  it(
    "survives CRLF, split frames, U+2028 in strings and stdout noise",
    async () => {
      const driver = start({
        faults: {
          crlf: true,
          splitFramesBytes: 3,
          startupStdout: ["pi banner"],
        },
        prompts: [
          {
            steps: [
              { type: "stdout", lines: ["debug: not json"] },
              { type: "text", text: "line separator end" },
            ],
          },
        ],
      });
      await driver.request("prompt", { message: "go" });
      await settled(driver);
      expect(driver.noise).toEqual(["pi banner", "debug: not json"]);
      expect(driver.raw()).toContain("\r\n");
      expect(driver.raw()).toContain("line separator end");
      const end = driver.records.find(
        (record) =>
          (record.assistantMessageEvent as JsonObject | undefined)?.type ===
          "text_end",
      );
      expect((end?.assistantMessageEvent as JsonObject).content).toBe(
        "line separator end",
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "crashes mid-run, hangs configured commands and exits when stdin closes",
    async () => {
      const crashing = start({
        prompts: [
          {
            steps: [
              { type: "text", text: "bye" },
              { type: "exit", code: 4 },
            ],
          },
        ],
      });
      await crashing.request("prompt", { message: "go" });
      expect(
        await withTimeout(crashing.fixture.exited, 5_000, "crash"),
      ).toEqual({ code: 4, signal: null });
      expect(
        crashing.records.some((record) => record.type === "agent_settled"),
      ).toBe(false);

      const hanging = start({
        hangCommands: ["get_state"],
        commandDelays: { get_messages: 200 },
      });
      const error = await hanging
        .request("get_state", {}, 300)
        .catch((caught: unknown) => caught);
      expect((error as Error).name).toBe("FixtureTimeoutError");
      const startedAt = Date.now();
      await hanging.request("get_messages");
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(180);
      hanging.fixture.child.stdin.end();
      expect(await withTimeout(hanging.fixture.exited, 5_000, "exit")).toEqual({
        code: 0,
        signal: null,
      });
    },
    TEST_TIMEOUT,
  );
});
