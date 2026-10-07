import { afterEach, describe, expect, it } from "bun:test";

import * as acp from "@agentclientprotocol/sdk";
import * as acpV2 from "@agentclientprotocol/sdk/experimental/v2";

import {
  killAllFixtures,
  nodeReadableToWeb,
  nodeWritableToWeb,
  spawnFixture,
  waitFor,
  withTimeout,
} from "../shared/test-support";
import {
  ACP_MOCK_SCENARIO_ENV,
  STANDARD_PERMISSION_OPTIONS,
  selectConfigOption,
  type AcpMockScenario,
} from "./scenario";
import {
  MOCK_AGENT_PATH,
  startAcpHarness,
  type AcpClientHandlers,
  type AcpHarness,
} from "./test-harness";

const TEST_TIMEOUT = 20_000;
const harnesses: AcpHarness[] = [];

function start(scenario: AcpMockScenario, handlers?: AcpClientHandlers) {
  const harness = startAcpHarness(scenario, handlers);
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.dispose()));
  await killAllFixtures();
});

const updateKinds = (harness: AcpHarness) =>
  harness.updates.map((notification) => notification.update.sessionUpdate);

describe("ACP mock agent: initialize", () => {
  it(
    "answers with SDK defaults and echoes the client's raw params",
    async () => {
      const harness = start({
        initialize: { echoMeta: true, meta: { vendor: "x" } },
      });
      const response = await harness.initialize({
        _meta: { clientType: "extension" },
      });

      expect(response.protocolVersion).toBe(acp.PROTOCOL_VERSION);
      expect(response.agentInfo?.name).toBe("sentinel-acp-mock");
      expect(response.agentCapabilities?.loadSession).toBe(true);
      expect(response.agentCapabilities?.sessionCapabilities?.resume).toEqual(
        {},
      );
      expect(response.agentCapabilities?.auth?.logout).toEqual({});
      expect(response._meta?.vendor).toBe("x");
      expect(response._meta?.["sentinel.mock/request"]).toMatchObject({
        protocolVersion: 1,
        clientInfo: { name: "sentinel-fixture-test" },
        clientCapabilities: { terminal: true },
        _meta: { clientType: "extension" },
      });

      const [entry] = harness.log();
      expect(entry).toMatchObject({
        kind: "request",
        id: 0,
        method: "initialize",
        params: { _meta: { clientType: "extension" } },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "advertises agent, terminal and env_var auth methods and custom capabilities",
    async () => {
      const authMethods = [
        {
          id: "cursor_login",
          name: "Cursor login",
          description: "Browser login",
        },
        {
          id: "terminal-login",
          name: "Terminal login",
          type: "terminal" as const,
          args: ["login"],
          env: { LOGIN_MODE: "tty" },
        },
        {
          id: "api-key",
          name: "API key",
          type: "env_var" as const,
          vars: [{ name: "MOCK_API_KEY", label: "API key" }],
          link: "https://example.com/keys",
        },
      ];
      const harness = start({
        initialize: {
          protocolVersion: 1,
          agentInfo: { name: "grok", version: "1.0.50" },
          agentCapabilities: {
            loadSession: false,
            promptCapabilities: {
              image: false,
              audio: true,
              embeddedContext: false,
            },
            mcpCapabilities: { http: false, sse: true },
            sessionCapabilities: { resume: {} },
          },
          authMethods,
        },
      });
      const response = await harness.initialize();

      expect(response.authMethods as unknown).toEqual(authMethods);
      expect(response.agentInfo).toEqual({ name: "grok", version: "1.0.50" });
      expect(response.agentCapabilities).toEqual({
        loadSession: false,
        promptCapabilities: {
          image: false,
          audio: true,
          embeddedContext: false,
        },
        mcpCapabilities: { http: false, sse: true },
        sessionCapabilities: { resume: {} },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "can answer with a verbatim legacy response (Antigravity's v2 shape)",
    async () => {
      const legacy = {
        protocolVersion: 2,
        agentInfo: { name: "antigravity-acp", version: "1.3.0" },
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { resume: {} },
        },
        authMethods: [{ id: "oauth-personal", name: "Google" }],
      };
      const harness = start({ initialize: { response: legacy } });
      expect(await harness.initialize()).toEqual(
        legacy as acp.InitializeResponse,
      );
    },
    TEST_TIMEOUT,
  );
});

describe("ACP mock agent: auth and sessions", () => {
  it(
    "signs in through the browser: stdout URL, loopback callback, error and timeout",
    async () => {
      let stdout = "";
      const harness = startAcpHarness(
        {
          auth: {
            requireAuth: true,
            browserLogin: {
              methodIds: ["browser"],
              stdoutLines: [
                "Open {{callbackUrl}} for {{methodId}} (redirect_uri={{callbackUrlEncoded}})",
              ],
            },
          },
        },
        {},
        { stdoutTap: (chunk) => (stdout += chunk) },
      );
      harnesses.push(harness);
      await harness.initialize();
      const lineFor = (attempt: number) =>
        waitFor(
          () =>
            [
              ...stdout.matchAll(
                /^Open (\S+) for browser \(redirect_uri=(\S+)\)$/gm,
              ),
            ][attempt],
          `sign-in line ${attempt}`,
        );

      // A denied consent fails authenticate.
      const denied = harness.agent
        .request("authenticate", { methodId: "browser" })
        .catch((error: unknown) => error);
      const [, first, encoded] = await lineFor(0);
      expect(decodeURIComponent(encoded ?? "")).toBe(first);
      expect((await fetch(`${first}favicon.ico`)).status).toBe(404);
      expect((await fetch(`${first}?error=access_denied`)).status).toBe(200);
      const error = (await denied) as acp.RequestError;
      expect(error.code).toBe(-32000);
      expect(error.message).toContain("access_denied");
      expect(
        (
          (await harness
            .newSession()
            .catch((e: unknown) => e)) as acp.RequestError
        ).code,
      ).toBe(-32000);

      // A code completes it; the listener is gone afterwards.
      const accepted = harness.agent.request("authenticate", {
        methodId: "browser",
      });
      const [, second] = await lineFor(1);
      expect(second).not.toBe(first);
      expect((await fetch(`${second}?code=abc&state=s`)).status).toBe(200);
      expect(await withTimeout(accepted, 5_000, "authenticate")).toEqual({});
      expect(await fetch(`${second}?code=again`).catch(() => "closed")).toBe(
        "closed",
      );
      await harness.newSession();

      // Other methods skip the browser.
      await harness.agent.request("authenticate", { methodId: "api-key" });
      expect([...stdout.matchAll(/^Open /gm)]).toHaveLength(2);

      // Without a callback the lines print and authenticate answers at once;
      // with timeoutMs a missing callback fails it.
      let printed = "";
      const quick = startAcpHarness(
        {
          auth: {
            browserLogin: {
              stdoutLines: ["visit https://example.com/device"],
              callback: false,
            },
          },
        },
        {},
        { stdoutTap: (chunk) => (printed += chunk) },
      );
      harnesses.push(quick);
      await quick.initialize();
      expect(
        await quick.agent.request("authenticate", { methodId: "device" }),
      ).toEqual({});
      expect(printed).toContain("visit https://example.com/device\n");

      const slow = start({
        auth: { browserLogin: { timeoutMs: 100 } },
      });
      await slow.initialize();
      const timedOut = (await slow.agent
        .request("authenticate", { methodId: "any" })
        .catch((e: unknown) => e)) as acp.RequestError;
      expect(timedOut.code).toBe(-32000);
      expect(timedOut.message).toContain("timed out");
    },
    TEST_TIMEOUT,
  );

  it(
    "rejects session/new with -32000 until authenticate succeeds",
    async () => {
      const harness = start({
        initialize: {
          authMethods: [{ id: "cursor_login", name: "Cursor login" }],
        },
        auth: { requireAuth: true, acceptMethodIds: ["cursor_login"] },
        session: { ids: ["after-auth"] },
      });
      await harness.initialize();

      const denied = await harness
        .newSession()
        .catch((error: unknown) => error);
      expect(denied).toBeInstanceOf(acp.RequestError);
      expect((denied as acp.RequestError).code).toBe(-32000);

      const wrongMethod = await harness.agent
        .request("authenticate", { methodId: "nope" })
        .catch((error: unknown) => error);
      expect((wrongMethod as acp.RequestError).code).toBe(-32602);

      await harness.agent.request("authenticate", { methodId: "cursor_login" });
      const session = await harness.newSession();
      expect(session.sessionId).toBe("after-auth");

      // logout drops the auth again
      await harness.agent.request("logout", {});
      const again = await harness.newSession().catch((error: unknown) => error);
      expect((again as acp.RequestError).code).toBe(-32000);
    },
    TEST_TIMEOUT,
  );

  it(
    "returns configured ids, modes, config options and legacy models",
    async () => {
      const configOptions = [
        selectConfigOption({
          id: "model",
          name: "Model",
          category: "model",
          currentValue: "fast",
          values: ["fast", { value: "smart", name: "Smart" }],
        }),
        selectConfigOption({
          id: "effort",
          name: "Effort",
          category: "thought_level",
          currentValue: "medium",
          values: ["low", "medium", "extra-high"],
        }),
        selectConfigOption({
          id: "mode",
          name: "Mode",
          category: "mode",
          currentValue: "agent",
          values: ["agent", "plan"],
        }),
      ];
      const modes = {
        currentModeId: "agent",
        availableModes: [
          { id: "agent", name: "Agent" },
          { id: "plan", name: "Plan" },
        ],
      };
      const models = {
        currentModelId: "grok-build",
        availableModels: [
          { modelId: "grok-build", name: "Grok Build" },
          {
            modelId: "grok-4",
            name: "Grok 4",
            _meta: { reasoningEfforts: ["low", "high"] },
          },
        ],
      };
      const harness = start({
        session: {
          ids: ["first", "second"],
          modes,
          configOptions,
          models,
          emitCurrentModeUpdate: true,
          emitConfigOptionUpdate: true,
          afterNew: [
            {
              sessionUpdate: "available_commands_update",
              availableCommands: [
                { name: "review", description: "Review {{cwd}}" },
              ],
            },
          ],
        },
      });
      await harness.initialize();

      const first = await harness.newSession("/work/a");
      expect(first.sessionId).toBe("first");
      expect(first.modes).toEqual(modes);
      expect(first.configOptions).toEqual(configOptions);
      expect((first as unknown as { models: unknown }).models).toEqual(models);
      expect((await harness.newSession()).sessionId).toBe("second");
      expect((await harness.newSession()).sessionId).toBe("mock-session-3");

      await waitFor(
        () => harness.updates.find((n) => n.sessionId === "first"),
        "available_commands_update",
      );
      const commands = harness.updates.find(
        (n) => n.sessionId === "first",
      )?.update;
      expect(commands).toEqual({
        sessionUpdate: "available_commands_update",
        availableCommands: [{ name: "review", description: "Review /work/a" }],
      });

      const set = await harness.agent.request("session/set_config_option", {
        sessionId: "first",
        configId: "effort",
        value: "extra-high",
      });
      expect(
        set.configOptions.find((option) => option.id === "effort")
          ?.currentValue,
      ).toBe("extra-high");
      const invalid = await harness.agent
        .request("session/set_config_option", {
          sessionId: "first",
          configId: "model",
          value: "missing",
        })
        .catch((error: unknown) => error);
      expect((invalid as acp.RequestError).code).toBe(-32602);

      await harness.agent.request("session/set_mode", {
        sessionId: "first",
        modeId: "plan",
      });
      await harness.agent.request("session/set_model", {
        sessionId: "first",
        modelId: "grok-4",
        _meta: { reasoningEffort: "high" },
      });
      await waitFor(
        () => updateKinds(harness).includes("current_mode_update"),
        "current_mode_update",
      );
      await waitFor(
        () => updateKinds(harness).includes("config_option_update"),
        "config_option_update",
      );
      const setModel = harness
        .log()
        .find(
          (entry) => "method" in entry && entry.method === "session/set_model",
        );
      expect(setModel).toMatchObject({
        kind: "request",
        params: { modelId: "grok-4", _meta: { reasoningEffort: "high" } },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "replays history through session/update before answering session/load",
    async () => {
      const harness = start({
        session: {
          modes: {
            currentModeId: "default",
            availableModes: [{ id: "default", name: "Default" }],
          },
          load: {
            knownSessionIds: ["persisted"],
            replay: [
              {
                sessionUpdate: "user_message_chunk",
                content: { type: "text", text: "earlier question" },
              },
              {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "earlier answer in {{cwd}}" },
              },
            ],
          },
        },
      });
      await harness.initialize();

      const response = await harness.agent.request("session/load", {
        sessionId: "persisted",
        cwd: "/work/repo",
        mcpServers: [],
      });
      // The replay precedes the response on the wire (see the raw-bytes test).
      await harness.settle();
      expect(
        harness.updates.map((n) => [n.sessionId, n.update.sessionUpdate]),
      ).toEqual([
        ["persisted", "user_message_chunk"],
        ["persisted", "agent_message_chunk"],
      ]);
      expect(harness.updates[1]?.update).toMatchObject({
        content: { text: "earlier answer in /work/repo" },
      });
      expect(response.modes?.currentModeId).toBe("default");

      const unknown = await harness.agent
        .request("session/load", {
          sessionId: "gone",
          cwd: "/work/repo",
          mcpServers: [],
        })
        .catch((error: unknown) => error);
      expect((unknown as acp.RequestError).code).toBe(-32002);

      const resumed = await harness.agent.request("session/resume", {
        sessionId: "persisted",
        cwd: "/work/repo",
      });
      expect(resumed.modes?.currentModeId).toBe("default");
      expect(harness.updates).toHaveLength(2);
    },
    TEST_TIMEOUT,
  );
});

describe("ACP mock agent: prompt scripts", () => {
  it(
    "streams every update kind, including partial tool updates, then the stop reason",
    async () => {
      const harness = start({
        prompts: [
          {
            steps: [
              { type: "thought", text: "Thinking about it", messageId: "m-1" },
              { type: "text", text: "Reading files." },
              { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
              {
                type: "toolCall",
                toolCallId: "call-edit",
                title: "Edit src/a.ts",
                kind: "edit",
                status: "pending",
                rawInput: { path: "/work/src/a.ts" },
                locations: [{ path: "/work/src/a.ts", line: 3 }],
                content: [
                  {
                    type: "diff",
                    path: "/work/src/a.ts",
                    oldText: "a",
                    newText: "b",
                  },
                ],
              },
              {
                type: "toolCallUpdate",
                toolCallId: "call-edit",
                status: "in_progress",
              },
              {
                type: "toolCallUpdate",
                toolCallId: "call-edit",
                title: "Edited src/a.ts",
              },
              {
                type: "toolCallUpdate",
                toolCallId: "call-edit",
                status: "completed",
                rawOutput: { ok: true },
              },
              {
                type: "toolCall",
                toolCallId: "call-search",
                title: "Search",
                kind: "search",
              },
              {
                type: "plan",
                entries: [
                  { content: "Read", priority: "high", status: "completed" },
                  {
                    content: "Edit",
                    priority: "medium",
                    status: "in_progress",
                  },
                ],
              },
              {
                type: "update",
                update: {
                  sessionUpdate: "available_commands_update",
                  availableCommands: [
                    {
                      name: "web",
                      description: "Search the web",
                      input: { hint: "query" },
                    },
                  ],
                },
              },
              {
                type: "update",
                update: {
                  sessionUpdate: "current_mode_update",
                  currentModeId: "plan",
                },
              },
              {
                type: "update",
                update: {
                  sessionUpdate: "config_option_update",
                  configOptions: [
                    selectConfigOption({
                      id: "model",
                      name: "Model",
                      currentValue: "x",
                      values: ["x"],
                    }),
                  ],
                },
              },
              {
                type: "update",
                update: {
                  sessionUpdate: "usage_update",
                  used: 1200,
                  size: 200000,
                  cost: { amount: 0.01, currency: "USD" },
                },
              },
              {
                type: "update",
                update: {
                  sessionUpdate: "session_info_update",
                  title: "Fix the bug",
                },
              },
              {
                type: "text",
                text: "Devin says hi",
                meta: { "cognition.ai/streamingMessageId": "stream-1" },
              },
            ],
            stopReason: "max_tokens",
            usage: { totalTokens: 30, inputTokens: 20, outputTokens: 10 },
          },
        ],
      });
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      const response = await harness.prompt(sessionId, "go");
      await harness.settle();

      expect(response).toEqual({
        stopReason: "max_tokens",
        usage: { totalTokens: 30, inputTokens: 20, outputTokens: 10 },
      });
      expect(updateKinds(harness)).toEqual([
        "agent_thought_chunk",
        "agent_message_chunk",
        "agent_message_chunk",
        "tool_call",
        "tool_call_update",
        "tool_call_update",
        "tool_call_update",
        "tool_call",
        "plan",
        "available_commands_update",
        "current_mode_update",
        "config_option_update",
        "usage_update",
        "session_info_update",
        "agent_message_chunk",
      ]);
      const updates = harness.updates.map((n) => n.update);
      expect(updates[3]).toMatchObject({
        toolCallId: "call-edit",
        kind: "edit",
        status: "pending",
        content: [
          { type: "diff", path: "/work/src/a.ts", oldText: "a", newText: "b" },
        ],
      });
      // Partial updates carry only what changed: the title update has no status.
      expect(updates[5]).toEqual({
        sessionUpdate: "tool_call_update",
        toolCallId: "call-edit",
        title: "Edited src/a.ts",
      });
      expect(updates[12]).toMatchObject({ used: 1200, size: 200000 });
      expect(updates[14]?._meta).toEqual({
        "cognition.ai/streamingMessageId": "stream-1",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "puts notificationMeta on params._meta and runs afterResponse steps after the response",
    async () => {
      const harness = start(
        {
          session: {
            afterNew: [
              {
                sessionUpdate: "available_commands_update",
                availableCommands: [],
              },
            ],
          },
          prompts: [
            {
              steps: [
                {
                  type: "text",
                  text: "in turn",
                  meta: { onUpdate: true },
                  notificationMeta: { promptId: "{{promptId}}" },
                },
                {
                  type: "toolCall",
                  toolCallId: "t-1",
                  title: "Run",
                  notificationMeta: { promptId: "{{requestId}}" },
                },
                {
                  type: "plan",
                  entries: [],
                  notificationMeta: { promptId: "{{promptId}}" },
                },
              ],
              afterResponse: [
                { type: "delay", ms: 20 },
                {
                  type: "text",
                  text: "woke up",
                  notificationMeta: { promptId: "task-completed-1" },
                },
                {
                  type: "extNotification",
                  method: "_vendor/after",
                  params: {},
                },
              ],
            },
          ],
        },
        { extNotifications: ["_vendor/after"] },
      );
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      // afterNew goes out right behind the session/new response.
      await waitFor(
        () =>
          harness.updates.find(
            (n) => n.update.sessionUpdate === "available_commands_update",
          ),
        "afterNew",
      );
      expect(
        await harness.prompt(sessionId, "go", {
          promptId: "p-1",
          requestId: "r-1",
        }),
      ).toEqual({ stopReason: "end_turn" });
      await waitFor(
        () => harness.calls.find((call) => call.method === "_vendor/after"),
        "after-response notification",
      );
      await harness.settle();
      const turn = harness.updates.filter(
        (n) => n.update.sessionUpdate !== "available_commands_update",
      );
      expect(turn.map((n) => [n.update.sessionUpdate, n._meta])).toEqual([
        ["agent_message_chunk", { promptId: "p-1" }],
        ["tool_call", { promptId: "r-1" }],
        ["plan", { promptId: "p-1" }],
        ["agent_message_chunk", { promptId: "task-completed-1" }],
      ]);
      expect(turn[0]?.update._meta).toEqual({ onUpdate: true });
      expect(turn[1]?.update).not.toHaveProperty("_meta");

      // On the wire, after-response traffic follows the prompt response.
      const log = harness.log();
      expect(log.some((entry) => entry.kind === "lifecycle")).toBe(false);
      const raw = harness.fixture.stdoutText();
      expect(raw.indexOf('"stopReason":"end_turn"')).toBeLessThan(
        raw.indexOf("woke up"),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "selects scripts by match, then in order, and can omit the stop reason",
    async () => {
      const harness = start({
        prompts: [
          { match: "refuse", steps: [], stopReason: "refusal" },
          { steps: [{ type: "text", text: "first" }], stopReason: "end_turn" },
          { steps: [{ type: "text", text: "rest" }], stopReason: null },
        ],
      });
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      expect(await harness.prompt(sessionId, "one")).toEqual({
        stopReason: "end_turn",
      });
      expect(await harness.prompt(sessionId, "please refuse")).toEqual({
        stopReason: "refusal",
      });
      expect(await harness.prompt(sessionId, "two")).toEqual(
        {} as acp.PromptResponse,
      );
      expect(await harness.prompt(sessionId, "three")).toEqual(
        {} as acp.PromptResponse,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "fails a prompt with a configured JSON-RPC error after its steps",
    async () => {
      const harness = start({
        prompts: [
          {
            steps: [
              { type: "text", text: "partial" },
              {
                type: "fail",
                error: {
                  code: -32003,
                  message: "Rate limited",
                  data: { retryAfter: 30 },
                },
              },
            ],
          },
        ],
      });
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      const error = await harness
        .prompt(sessionId, "go")
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(acp.RequestError);
      expect(error).toMatchObject({ code: -32003, data: { retryAfter: 30 } });
      await harness.settle();
      expect(updateKinds(harness)).toEqual(["agent_message_chunk"]);
    },
    TEST_TIMEOUT,
  );
});

describe("ACP mock agent: permissions", () => {
  const permissionScenario: AcpMockScenario = {
    prompts: [
      {
        steps: [
          {
            type: "toolCall",
            toolCallId: "call-1",
            title: "Run tests",
            kind: "execute",
            status: "pending",
          },
          {
            type: "requestPermission",
            toolCall: {
              toolCallId: "call-1",
              title: "Run tests",
              kind: "execute",
            },
            options: [
              ...STANDARD_PERMISSION_OPTIONS,
              {
                optionId: "allow-edits-session",
                name: "Allow all edits",
                kind: "allow_always",
              },
            ],
            branches: {
              "allow-once": [{ type: "text", text: "ran once" }],
              "allow-always": [{ type: "text", text: "ran, always allowed" }],
              "allow-edits-session": [{ type: "text", text: "edits allowed" }],
              "reject-once": [
                {
                  type: "toolCallUpdate",
                  toolCallId: "call-1",
                  status: "failed",
                },
                { type: "stop", stopReason: "end_turn" },
              ],
              cancelled: [{ type: "text", text: "never reached" }],
              "*": [{ type: "text", text: "other option" }],
            },
          },
          { type: "toolCallUpdate", toolCallId: "call-1", status: "completed" },
        ],
      },
    ],
  };

  async function runWith(optionId: string) {
    const harness = start(permissionScenario, {
      requestPermission: () => ({ outcome: { outcome: "selected", optionId } }),
    });
    await harness.initialize();
    const { sessionId } = await harness.newSession();
    const response = await harness.prompt(sessionId, "go");
    await harness.settle();
    const texts = harness.updates.flatMap((n) =>
      n.update.sessionUpdate === "agent_message_chunk" &&
      n.update.content.type === "text"
        ? [n.update.content.text]
        : [],
    );
    return { harness, response, texts };
  }

  it(
    "branches on allow once, allow always, a custom id and reject",
    async () => {
      const once = await runWith("allow-once");
      expect(once.texts).toEqual(["ran once"]);
      const request = once.harness.calls.find(
        (call) => call.method === "session/request_permission",
      );
      expect(request?.params).toMatchObject({
        toolCall: { toolCallId: "call-1" },
        options: expect.arrayContaining([
          expect.objectContaining({ kind: "allow_once" }),
          expect.objectContaining({ kind: "allow_always" }),
          expect.objectContaining({ kind: "reject_once" }),
          expect.objectContaining({ kind: "reject_always" }),
        ]),
      });
      const response = once.harness
        .log()
        .find(
          (entry) => entry.kind === "response" && entry.result !== undefined,
        );
      expect(response).toMatchObject({
        result: { outcome: { outcome: "selected", optionId: "allow-once" } },
      });

      expect((await runWith("allow-always")).texts).toEqual([
        "ran, always allowed",
      ]);
      expect((await runWith("allow-edits-session")).texts).toEqual([
        "edits allowed",
      ]);
      expect((await runWith("reject-always")).texts).toEqual(["other option"]);

      const rejected = await runWith("reject-once");
      expect(rejected.texts).toEqual([]);
      expect(rejected.response).toEqual({ stopReason: "end_turn" });
      expect(rejected.harness.updates.at(-1)?.update).toMatchObject({
        sessionUpdate: "tool_call_update",
        status: "failed",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "ends the turn cancelled when the client cancels during a permission request",
    async () => {
      let harness: AcpHarness | undefined;
      harness = start(permissionScenario, {
        requestPermission: async (params) => {
          await harness?.agent.notify("session/cancel", {
            sessionId: params.sessionId,
          });
          return { outcome: { outcome: "cancelled" } };
        },
      });
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      expect(await harness.prompt(sessionId, "go")).toEqual({
        stopReason: "cancelled",
      });
      const kinds = harness.log().map((entry) => entry.kind);
      expect(kinds).toContain("notification");
    },
    TEST_TIMEOUT,
  );
});

describe("ACP mock agent: extension methods", () => {
  it(
    "sends vendor requests and notifications and branches on the reply",
    async () => {
      const harness = start(
        {
          prompts: [
            {
              steps: [
                {
                  type: "extRequest",
                  method: "cursor/ask_question",
                  params: {
                    toolCallId: "q-1",
                    title: "Pick",
                    questions: [
                      {
                        id: "db",
                        prompt: "Database?",
                        options: [{ id: "pg", label: "Postgres" }],
                      },
                      {
                        id: "extras",
                        prompt: "Extras?",
                        allowMultiple: true,
                        options: [{ id: "a", label: "A" }],
                      },
                    ],
                  },
                  echo: true,
                },
                {
                  type: "extRequest",
                  method: "cursor/create_plan",
                  params: { toolCallId: "p-1", plan: "# Plan" },
                },
                {
                  type: "extNotification",
                  method: "cursor/update_todos",
                  params: {
                    todos: [{ id: "1", content: "Do it", status: "pending" }],
                  },
                },
                {
                  type: "extRequest",
                  method: "x.ai/ask_user_question",
                  params: {
                    sessionId: "{{sessionId}}",
                    questions: [
                      { question: "Proceed?", options: [{ label: "Yes" }] },
                    ],
                  },
                  branches: {
                    accepted: [{ type: "text", text: "accepted" }],
                    cancelled: [{ type: "text", text: "cancelled" }],
                  },
                },
                {
                  type: "extRequest",
                  method: "x.ai/exit_plan_mode",
                  params: {
                    sessionId: "{{sessionId}}",
                    toolCallId: "t-1",
                    planContent: "plan",
                  },
                  branches: {
                    abandoned: [{ type: "text", text: "plan captured" }],
                  },
                },
                {
                  type: "extRequest",
                  method: "vendor/unknown",
                  branches: {
                    error: [{ type: "text", text: "client said no" }],
                  },
                },
                {
                  type: "extNotification",
                  method: "_session/retrying",
                  params: {
                    sessionId: "{{sessionId}}",
                    category: "rate_limited",
                    detail: "429",
                  },
                },
                {
                  type: "extNotification",
                  method: "x.ai/session/prompt_complete",
                  params: {
                    sessionId: "{{sessionId}}",
                    promptId: "{{promptId}}",
                    stopReason: "end_turn",
                  },
                },
              ],
              meta: { echoedPrompt: "{{promptMeta}}" },
            },
          ],
        },
        {
          extRequests: {
            "cursor/ask_question": () => ({
              answers: { db: ["pg"], extras: ["a"] },
            }),
            "cursor/create_plan": () => ({ accepted: true }),
            "x.ai/ask_user_question": () => ({
              outcome: "accepted",
              answers: { "Proceed?": ["Yes"] },
            }),
            "x.ai/exit_plan_mode": () => ({
              outcome: "abandoned",
              feedback: "wait",
            }),
          },
          extNotifications: [
            "cursor/update_todos",
            "_session/retrying",
            "x.ai/session/prompt_complete",
          ],
        },
      );
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      const response = await harness.prompt(sessionId, "go", {
        promptId: "prompt-42",
        requestId: "req-42",
      });
      await harness.settle();

      // The client SDK may run a notification handler after a later request
      // handler, so only the agent's (sequential) requests are order-checked.
      const methods = harness.calls.map((call) => call.method);
      const requests = new Set([
        "cursor/ask_question",
        "cursor/create_plan",
        "x.ai/ask_user_question",
        "x.ai/exit_plan_mode",
      ]);
      expect(methods.filter((method) => requests.has(method))).toEqual([
        "cursor/ask_question",
        "cursor/create_plan",
        "x.ai/ask_user_question",
        "x.ai/exit_plan_mode",
      ]);
      expect([...methods].sort()).toEqual(
        [
          "cursor/ask_question",
          "cursor/create_plan",
          "cursor/update_todos",
          "x.ai/ask_user_question",
          "x.ai/exit_plan_mode",
          "_session/retrying",
          "x.ai/session/prompt_complete",
        ].sort(),
      );
      const call = (method: string) =>
        harness.calls.find((entry) => entry.method === method)?.params;
      expect(call("cursor/ask_question")).toMatchObject({
        questions: [{ id: "db" }, { id: "extras", allowMultiple: true }],
      });
      expect(call("x.ai/session/prompt_complete")).toEqual({
        sessionId,
        promptId: "prompt-42",
        stopReason: "end_turn",
      });
      const texts = harness.updates.flatMap((n) =>
        n.update.sessionUpdate === "agent_message_chunk" &&
        n.update.content.type === "text"
          ? [n.update.content.text]
          : [],
      );
      expect(texts[0]).toContain('"answers":{"db":["pg"],"extras":["a"]}');
      expect(texts.slice(1)).toEqual([
        "accepted",
        "plan captured",
        "client said no",
      ]);
      expect(response._meta).toEqual({
        echoedPrompt: { promptId: "prompt-42", requestId: "req-42" },
      });
      const unknownReply = harness
        .log()
        .find(
          (entry) => entry.kind === "response" && entry.error?.code === -32601,
        );
      expect(unknownReply).toBeDefined();
    },
    TEST_TIMEOUT,
  );
});

describe("ACP mock agent: client callbacks", () => {
  it(
    "reads and writes files through the client",
    async () => {
      const files = new Map<string, string>([
        ["/work/notes.md", "line 1\nline 2\nline 3"],
      ]);
      const harness = start(
        {
          prompts: [
            {
              steps: [
                {
                  type: "clientFs",
                  op: "read",
                  path: "/work/notes.md",
                  line: 2,
                  limit: 1,
                  echo: true,
                },
                {
                  type: "clientFs",
                  op: "write",
                  path: "/work/plan.md",
                  content: "# Plan",
                },
                {
                  type: "clientFs",
                  op: "read",
                  path: "/work/missing.md",
                  echo: true,
                },
              ],
            },
          ],
        },
        {
          readTextFile: ({ path, line, limit }) => {
            const content = files.get(path);
            if (content === undefined)
              throw acp.RequestError.resourceNotFound(path);
            const lines = content.split("\n");
            const start = (line ?? 1) - 1;
            return {
              content: lines
                .slice(start, limit ? start + limit : undefined)
                .join("\n"),
            };
          },
          writeTextFile: ({ path, content }) => {
            files.set(path, content);
            return {};
          },
        },
      );
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      await harness.prompt(sessionId, "go");
      await harness.settle();

      expect(files.get("/work/plan.md")).toBe("# Plan");
      expect(harness.calls.map((call) => call.method)).toEqual([
        "fs/read_text_file",
        "fs/write_text_file",
        "fs/read_text_file",
      ]);
      expect(harness.calls[0]?.params).toEqual({
        sessionId,
        path: "/work/notes.md",
        line: 2,
        limit: 1,
      });
      const texts = harness.updates.map((n) =>
        n.update.sessionUpdate === "agent_message_chunk" &&
        n.update.content.type === "text"
          ? n.update.content.text
          : "",
      );
      expect(texts[0]).toBe(
        '[fs/read_text_file] {"result":{"content":"line 2"}}',
      );
      expect(texts[1]).toContain('"code":-32002');
    },
    TEST_TIMEOUT,
  );

  it(
    "runs a client terminal: create, attach, kill, wait, output, release",
    async () => {
      const harness = start(
        {
          prompts: [
            {
              steps: [
                {
                  type: "toolCall",
                  toolCallId: "call-sh",
                  title: "npm test",
                  kind: "execute",
                  status: "in_progress",
                },
                {
                  type: "clientTerminal",
                  command: "npm",
                  args: ["test"],
                  env: [{ name: "CI", value: "1" }],
                  cwd: "{{cwd}}",
                  outputByteLimit: 1024,
                  toolCallId: "call-sh",
                  echo: true,
                },
                {
                  type: "clientTerminal",
                  command: "sleep",
                  args: ["60"],
                  kill: true,
                  echo: true,
                },
              ],
            },
          ],
        },
        {
          createTerminal: ({ command }) => ({ terminalId: `term-${command}` }),
          killTerminal: () => ({}),
          waitForTerminalExit: ({ terminalId }) =>
            terminalId === "term-sleep"
              ? { exitCode: null, signal: "SIGTERM" }
              : { exitCode: 0 },
          terminalOutput: ({ terminalId }) => ({
            output: terminalId === "term-npm" ? "ok\n" : "",
            truncated: false,
            exitStatus:
              terminalId === "term-npm"
                ? { exitCode: 0 }
                : { signal: "SIGTERM" },
          }),
          releaseTerminal: () => ({}),
        },
      );
      await harness.initialize();
      const session = await harness.newSession("/work/repo");
      await harness.prompt(session.sessionId, "go");
      await harness.settle();

      expect(harness.calls.map((call) => call.method)).toEqual([
        "terminal/create",
        "terminal/wait_for_exit",
        "terminal/output",
        "terminal/release",
        "terminal/create",
        "terminal/kill",
        "terminal/wait_for_exit",
        "terminal/output",
        "terminal/release",
      ]);
      expect(harness.calls[0]?.params).toEqual({
        sessionId: session.sessionId,
        command: "npm",
        args: ["test"],
        env: [{ name: "CI", value: "1" }],
        cwd: "/work/repo",
        outputByteLimit: 1024,
      });
      expect(harness.updates[1]?.update).toEqual({
        sessionUpdate: "tool_call_update",
        toolCallId: "call-sh",
        content: [{ type: "terminal", terminalId: "term-npm" }],
      });
      const echoes = harness.updates
        .map((n) => n.update)
        .filter((update) => update.sessionUpdate === "agent_message_chunk");
      expect(echoes).toHaveLength(2);
    },
    TEST_TIMEOUT,
  );

  it(
    "asks for form and url elicitations and branches on the action",
    async () => {
      const harness = start(
        {
          prompts: [
            {
              steps: [
                {
                  type: "elicitation",
                  mode: "form",
                  message: "Pick a branch",
                  requestedSchema: {
                    type: "object",
                    properties: {
                      branch: { type: "string", enum: ["main", "dev"] },
                      force: { type: "boolean" },
                    },
                    required: ["branch"],
                  },
                  branches: {
                    accept: [{ type: "text", text: "form accepted" }],
                    decline: [{ type: "text", text: "form declined" }],
                  },
                },
                {
                  type: "elicitation",
                  mode: "url",
                  message: "Sign in",
                  url: "https://example.com/login",
                  elicitationId: "login-1",
                  complete: true,
                  branches: { "*": [{ type: "text", text: "url done" }] },
                },
              ],
            },
          ],
        },
        {
          createElicitation: (params) =>
            params.mode === "form"
              ? { action: "accept", content: { branch: "dev", force: true } }
              : { action: "accept" },
        },
      );
      await harness.initialize({
        clientCapabilities: { elicitation: { form: {}, url: {} } },
      });
      const { sessionId } = await harness.newSession();
      await harness.prompt(sessionId, "go");
      await harness.settle();

      expect(harness.calls.map((call) => call.method)).toEqual([
        "elicitation/create",
        "elicitation/create",
        "elicitation/complete",
      ]);
      expect(harness.calls[1]?.params).toMatchObject({
        mode: "url",
        sessionId,
        elicitationId: "login-1",
        url: "https://example.com/login",
      });
      expect(harness.calls[2]?.params).toEqual({ elicitationId: "login-1" });
      const texts = harness.updates.map((n) =>
        n.update.sessionUpdate === "agent_message_chunk" &&
        n.update.content.type === "text"
          ? n.update.content.text
          : "",
      );
      expect(texts).toEqual(["form accepted", "url done"]);
    },
    TEST_TIMEOUT,
  );
});

describe("ACP mock agent: cancel", () => {
  it(
    "aborts a running prompt on the session/cancel notification",
    async () => {
      const harness = start({
        prompts: [
          {
            steps: [
              {
                type: "toolCall",
                toolCallId: "long",
                title: "Long task",
                kind: "execute",
                status: "in_progress",
              },
              { type: "waitForCancel" },
              { type: "text", text: "never sent" },
            ],
          },
          { steps: [{ type: "text", text: "next turn" }] },
        ],
        cancel: {
          updates: [
            {
              sessionUpdate: "tool_call_update",
              toolCallId: "long",
              status: "failed",
            },
          ],
        },
      });
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      const prompt = harness.prompt(sessionId, "go");
      await waitFor(() => harness.updates.length > 0, "tool_call");
      await harness.agent.notify("session/cancel", { sessionId });

      expect(await withTimeout(prompt, 5_000, "cancelled prompt")).toEqual({
        stopReason: "cancelled",
      });
      await harness.settle();
      expect(updateKinds(harness)).toEqual(["tool_call", "tool_call_update"]);
      const cancel = harness
        .log()
        .find((entry) => entry.kind === "notification");
      expect(cancel).toEqual({
        ts: expect.any(Number),
        kind: "notification",
        method: "session/cancel",
        params: { sessionId },
      });

      // The cancel does not leak into the next turn.
      expect(await harness.prompt(sessionId, "again")).toEqual({
        stopReason: "end_turn",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "can resolve end_turn after a cancel (the cancel/complete race)",
    async () => {
      const harness = start({
        prompts: [{ steps: [{ type: "delay", ms: 60_000 }] }],
        cancel: { stopReason: "end_turn" },
      });
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      const prompt = harness.prompt(sessionId, "go");
      await waitFor(
        () =>
          harness
            .log()
            .some(
              (entry) =>
                entry.kind === "request" && entry.method === "session/prompt",
            ),
        "prompt logged",
      );
      await harness.agent.notify("session/cancel", {
        sessionId,
        _meta: { cancelTrigger: "ctrl_c" },
      });
      expect(await withTimeout(prompt, 5_000, "prompt")).toEqual({
        stopReason: "end_turn",
      });
      expect(
        harness.log().find((entry) => entry.kind === "notification"),
      ).toMatchObject({
        params: { _meta: { cancelTrigger: "ctrl_c" } },
      });
    },
    TEST_TIMEOUT,
  );
});

describe("ACP mock agent: faults", () => {
  it(
    "crashes mid-turn with the configured exit code",
    async () => {
      const harness = start({
        prompts: [
          {
            steps: [
              { type: "text", text: "about to crash" },
              { type: "exit", code: 3, stderr: "panic: mock crash" },
            ],
          },
        ],
      });
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      const error = await harness
        .prompt(sessionId, "go")
        .catch((caught: unknown) => caught);

      expect(error).toBeDefined();
      expect(await harness.fixture.exited).toEqual({ code: 3, signal: null });
      expect(harness.fixture.stderrText()).toContain("panic: mock crash");
      expect(updateKinds(harness)).toEqual(["agent_message_chunk"]);
      expect(harness.log().at(-1)).toMatchObject({
        kind: "lifecycle",
        event: "exit-step",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "hangs forever on a prompt so the caller's timeout fires",
    async () => {
      const harness = start({
        prompts: [
          {
            steps: [
              { type: "text", text: "stuck" },
              { type: "hang", ignoreCancel: true },
            ],
          },
        ],
      });
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      const prompt = harness.prompt(sessionId, "go");
      await waitFor(() => harness.updates.length > 0, "stuck update");
      await harness.agent.notify("session/cancel", { sessionId });
      const error = await withTimeout(prompt, 400, "hung prompt").catch(
        (caught: unknown) => caught,
      );
      expect((error as Error).name).toBe("FixtureTimeoutError");
      expect(harness.fixture.child.exitCode).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    "never answers hung methods and delays slow ones",
    async () => {
      const harness = start({
        faults: {
          methodDelays: { initialize: 300 },
          hangMethods: ["session/new"],
        },
      });
      const startedAt = Date.now();
      await harness.initialize();
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(280);
      const error = await withTimeout(
        harness.newSession(),
        400,
        "session/new",
      ).catch((caught: unknown) => caught);
      expect((error as Error).name).toBe("FixtureTimeoutError");
    },
    TEST_TIMEOUT,
  );

  it(
    "survives stdout garbage; the SDK answers each bad line with a parse error",
    async () => {
      const harness = start({
        faults: {
          startupStdout: [
            "Open the following link to authenticate the ACP server: https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http://127.0.0.1:4555/",
          ],
          startupStderr: "warming up",
          stderrFloodBytes: 256 * 1024,
          splitFramesBytes: 7,
        },
        prompts: [
          {
            steps: [
              { type: "stdout", lines: ["not json either"] },
              { type: "text", text: "after noise" },
            ],
          },
        ],
      });
      const response = await harness.initialize();
      expect(response.protocolVersion).toBe(1);
      const { sessionId } = await harness.newSession();
      expect(await harness.prompt(sessionId, "go")).toEqual({
        stopReason: "end_turn",
      });

      // Trap 2 in the SDK: ndJsonStream writes -32700 back to the agent.
      await waitFor(
        () =>
          harness
            .log()
            .filter(
              (entry) =>
                entry.kind === "response" && entry.error?.code === -32700,
            ).length === 2,
        "two parse-error frames",
      );
      expect(harness.fixture.stderrText().length).toBeGreaterThan(256 * 1024);
    },
    TEST_TIMEOUT,
  );

  it(
    "exits on its own after exitAfterMs and when stdin closes",
    async () => {
      const crashing = start({ faults: { exitAfterMs: 50, exitCode: 7 } });
      expect(await withTimeout(crashing.fixture.exited, 5_000, "exit")).toEqual(
        {
          code: 7,
          signal: null,
        },
      );

      const closing = start({});
      await closing.initialize();
      closing.fixture.child.stdin.end();
      expect(await withTimeout(closing.fixture.exited, 5_000, "exit")).toEqual({
        code: 0,
        signal: null,
      });
    },
    TEST_TIMEOUT,
  );
});

describe("ACP mock agent: protocol versions", () => {
  it(
    "negotiates v1 or draft v2 through the SDK's agentProtocolRouter",
    async () => {
      const scenario: AcpMockScenario = {
        initialize: {
          versions: [1, 2],
          v2: { info: { name: "dual-mock", version: "2.0.0" } },
        },
        prompts: [
          {
            steps: [
              { type: "text", text: "Hello " },
              { type: "text", text: "v2" },
            ],
          },
        ],
      };

      // A v1 client reaches the v1 mock.
      const v1 = start(scenario);
      const init1 = await v1.initialize();
      expect(init1.protocolVersion).toBe(1);
      expect(init1.agentInfo?.name).toBe("sentinel-acp-mock");
      const s1 = await v1.newSession();
      expect(await v1.prompt(s1.sessionId, "hi")).toEqual({
        stopReason: "end_turn",
      });

      // A draft-v2 client gets the v2 agent: messageId first, then
      // state_update running → agent_message → state_update idle.
      const fixture = spawnFixture(MOCK_AGENT_PATH, {
        env: { [ACP_MOCK_SCENARIO_ENV]: JSON.stringify(scenario) },
      });
      const updates: acpV2.UpdateSessionNotification[] = [];
      const connection = acpV2
        .client({ name: "sentinel-fixture-test-v2" })
        .onNotification("session/update", ({ params }) => {
          updates.push(params);
        })
        .connect(
          acpV2.ndJsonStream(
            nodeWritableToWeb(fixture.child.stdin),
            nodeReadableToWeb(fixture.child.stdout),
          ),
        );
      try {
        const init2 = await connection.agent.request("initialize", {
          protocolVersion: 2,
          info: { name: "sentinel-fixture-test-v2", version: "0.0.0" },
        });
        expect(init2).toEqual({
          protocolVersion: 2,
          info: { name: "dual-mock", version: "2.0.0" },
          capabilities: { session: {} },
        });
        const { sessionId } = await connection.agent.request("session/new", {
          cwd: "/work",
        });
        const { messageId } = await connection.agent.request("session/prompt", {
          sessionId,
          prompt: [{ type: "text", text: "hi" }],
        });
        await waitFor(
          () =>
            updates.find(
              (n) =>
                n.update.sessionUpdate === "state_update" &&
                n.update.state === "idle",
            ),
          "v2 idle",
        );
        expect(updates.map((n) => n.update.sessionUpdate)).toEqual([
          "user_message",
          "state_update",
          "agent_message",
          "state_update",
        ]);
        expect(updates[0]?.update).toMatchObject({ messageId });
        expect(updates[2]?.update).toMatchObject({
          content: [{ type: "text", text: "Hello v2" }],
        });
        expect(updates[3]?.update).toMatchObject({
          state: "idle",
          stopReason: "end_turn",
        });
      } finally {
        connection.close();
      }

      // Without v1 in the list, a v1 client is turned away.
      const v2Only = start({ initialize: { versions: [2] } });
      const refused = (await v2Only
        .initialize()
        .catch((error: unknown) => error)) as acp.RequestError;
      expect(refused.code).toBe(-32600);
      expect(refused.data).toBe(
        "unsupported ACP protocol version 1; this endpoint supports ACP protocol version 2",
      );
    },
    TEST_TIMEOUT,
  );
});
