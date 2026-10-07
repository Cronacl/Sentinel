// Generation 2 (opencode 2.x) driven with plain fetch and a hand-rolled SSE
// reader over the /api/* routes @opencode/client 2.0.24 calls.
import { afterEach, describe, expect, it } from "bun:test";

import type { JsonObject } from "../shared/fixture-io";
import {
  killAllFixtures,
  spawnFixture,
  waitFor,
  withTimeout,
} from "../shared/test-support";
import { start, type OpenCodeFake } from "./fake-server";
import { openCodeBasicAuth, type OpenCodeFakeScenario } from "./scenario";
import {
  FAKE_OPENCODE_PATH,
  readSse,
  spawnFakeOpenCode,
  type SseItem,
} from "./test-harness";

const TEST_TIMEOUT = 20_000;
const cleanups: Array<() => unknown> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  await killAllFixtures();
});

type V2 = {
  url: string;
  call(method: string, path: string, body?: unknown): Promise<Response>;
  json<T = JsonObject>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T>;
  items: SseItem[];
  events(): JsonObject[];
  waitForEvent(type: string, index?: number): Promise<JsonObject>;
};

async function connect(url: string, password: string): Promise<V2> {
  const authorization = openCodeBasicAuth(password);
  const call = (method: string, path: string, body?: unknown) =>
    fetch(`${url}${path}`, {
      method,
      headers: {
        authorization,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const items: SseItem[] = [];
  const controller = new AbortController();
  const stream = await fetch(`${url}/api/event`, {
    headers: { authorization },
    signal: controller.signal,
  });
  expect(stream.status).toBe(200);
  expect(stream.headers.get("content-type")).toBe("text/event-stream");
  void readSse(stream, (item) => items.push(item)).catch(() => {});
  cleanups.push(() => controller.abort());
  const events = () => items.flatMap((item) => (item.data ? [item.data] : []));
  await waitFor(
    () => events().some((event) => event.type === "server.connected"),
    "connected",
  );
  return {
    url,
    call,
    json: async (method, path, body) =>
      (await (await call(method, path, body)).json()) as never,
    items,
    events,
    waitForEvent: (type, index = 0) =>
      waitFor(
        () => events().filter((event) => event.type === type)[index],
        `${type} #${index}`,
      ),
  };
}

async function startV2(scenario: OpenCodeFakeScenario = {}) {
  const fake: OpenCodeFake = await start({ generation: 2, scenario });
  cleanups.push(() => fake.stop());
  return { fake, api: await connect(fake.url, fake.password ?? "") };
}

const data = (event: JsonObject | undefined) =>
  (event?.data ?? {}) as JsonObject;

describe("OpenCode fake, generation 2", () => {
  it(
    "runs as `opencode serve`: 2.x banner, generated password, Basic auth on /api/info",
    async () => {
      const spawned = await spawnFakeOpenCode(2, { version: "2.0.24" });
      expect(spawned.fixture.stdoutText()).toBe(
        `server listening on ${spawned.url}\nserver password ${spawned.password}\n`,
      );
      const anonymous = await fetch(`${spawned.url}/api/info`);
      expect(anonymous.status).toBe(401);
      expect(anonymous.headers.get("www-authenticate")).toBe("Basic");
      expect(await anonymous.json()).toEqual({
        _tag: "UnauthorizedError",
        message: "Authentication required",
      });
      const info = await fetch(`${spawned.url}/api/info`, {
        headers: { authorization: openCodeBasicAuth(spawned.password ?? "") },
      });
      expect(info.headers.get("content-type")).toBe("application/json");
      expect(await info.json()).toEqual({
        version: "2.0.24",
        pid: spawned.fixture.child.pid,
        urls: [spawned.url],
        paths: { tmp: "/tmp/opencode" },
      });
      // A 1.x probe path serves the web UI, so it says nothing about the version.
      const health = await fetch(`${spawned.url}/global/health`, {
        headers: { authorization: openCodeBasicAuth(spawned.password ?? "") },
      });
      expect(health.headers.get("content-type")).toBe("text/html");

      const withPassword = await spawnFakeOpenCode(
        2,
        {},
        { OPENCODE_PASSWORD: "given" },
      );
      expect(withPassword.fixture.stdoutText()).toBe(
        `server listening on ${withPassword.url}\n`,
      );
      expect(
        (
          await fetch(`${withPassword.url}/api/info`, {
            headers: { authorization: openCodeBasicAuth("given") },
          })
        ).status,
      ).toBe(200);

      const version = spawnFixture(FAKE_OPENCODE_PATH, {
        args: ["--version"],
        env: { SENTINEL_OPENCODE_FAKE_GENERATION: "2" },
      });
      await withTimeout(version.exited, 5_000, "--version");
      expect(version.stdoutText()).toBe("opencode v2.0.18\n");
    },
    TEST_TIMEOUT,
  );

  it(
    "streams an execution: text, reasoning, a tool with permission, a form",
    async () => {
      const { api, fake } = await startV2({
        prompts: [
          {
            steps: [
              { type: "reasoning", text: ["Let me ", "think."] },
              {
                type: "tool",
                tool: "bash",
                callID: "call_1",
                input: { command: "ls" },
                output: "a.ts\n",
                metadata: { exit: 0 },
                permission: { permission: "bash", patterns: ["ls"] },
              },
              {
                type: "form",
                title: "Pick a database",
                fields: [
                  {
                    key: "db",
                    type: "string",
                    title: "Database",
                    options: [
                      { value: "pg", label: "Postgres" },
                      { value: "sqlite", label: "SQLite" },
                    ],
                  },
                ],
                branches: {
                  replied: [{ type: "text", text: ["Using ", "Postgres"] }],
                },
              },
            ],
            tokens: { input: 10, output: 4 },
            cost: 0.002,
          },
        ],
      });
      const created = await api.json<{ data: JsonObject }>(
        "POST",
        "/api/session",
        {
          title: "Fixture",
          location: { directory: "/work/repo" },
        },
      );
      // Read the id first: bun's toMatchObject writes asymmetric matchers back into the subject.
      const sessionID = String(created.data.id);
      expect(sessionID).toStartWith("ses_");
      expect(await api.json("GET", `/api/session/${sessionID}`)).toEqual({
        data: created.data,
      });
      expect(created.data).toMatchObject({
        title: "Fixture",
        location: { directory: "/work/repo" },
        cost: 0,
      });

      const prompt = await api.json<{ data: JsonObject }>(
        "POST",
        `/api/session/${sessionID}/prompt`,
        { text: "hello" },
      );
      expect(prompt.data).toMatchObject({
        sessionID,
        type: "user",
        payload: { text: "hello" },
        delivery: "queue",
      });

      const asked = data(await api.waitForEvent("permission.asked"));
      expect(asked).toMatchObject({
        sessionID,
        action: "bash",
        resources: ["ls"],
        source: { type: "tool", id: "call_1" },
      });
      expect(
        (
          await api.json<{ data: JsonObject[] }>(
            "GET",
            `/api/session/${sessionID}/permission`,
          )
        ).data,
      ).toHaveLength(1);
      const reply = await api.call(
        "POST",
        `/api/session/${sessionID}/permission/${String(asked.id)}/reply`,
        { decision: "once" },
      );
      expect(reply.status).toBe(204);

      const form = data(await api.waitForEvent("form.created"))
        .form as JsonObject;
      expect(form).toMatchObject({ sessionID, title: "Pick a database" });
      expect(
        (
          await api.call(
            "POST",
            `/api/session/${sessionID}/form/${String(form.id)}/reply`,
            {
              answer: { db: "pg" },
            },
          )
        ).status,
      ).toBe(204);
      await api.waitForEvent("session.idle");

      const events = api.events();
      const types = events.map((event) => String(event.type));
      expect(types.slice(0, 5)).toEqual([
        "server.connected",
        "session.created",
        "session.inbox.enqueued",
        "session.execution.started",
        "session.inbox.delivered",
      ]);
      expect(data(events[2])).toEqual({
        sessionID,
        inboxID: prompt.data.id,
        item: { type: "user", payload: { text: "hello" }, delivery: "queue" },
      });
      expect(types).toEqual(
        expect.arrayContaining([
          "session.step.started",
          "session.reasoning.started",
          "session.reasoning.delta",
          "session.reasoning.ended",
          "session.tool.input.started",
          "session.tool.input.delta",
          "session.tool.input.ended",
          "session.tool.called",
          "permission.asked",
          "permission.replied",
          "session.tool.progress",
          "session.tool.success",
          "form.created",
          "form.replied",
          "session.text.started",
          "session.text.delta",
          "session.text.ended",
          "session.step.ended",
          "session.execution.succeeded",
        ]),
      );
      expect(types.slice(-3)).toEqual([
        "session.execution.succeeded",
        "session.status",
        "session.idle",
      ]);
      const textDeltas = events.flatMap((event) =>
        event.type === "session.text.delta" ? [data(event).delta] : [],
      );
      expect(textDeltas).toEqual(["Using ", "Postgres"]);
      expect(
        data(events.find((event) => event.type === "session.text.ended")),
      ).toMatchObject({
        sessionID,
        // Ordinals index the assistant content: reasoning, tool, then this text.
        ordinal: 2,
        text: "Using Postgres",
      });
      expect(
        data(events.find((event) => event.type === "permission.replied")),
      ).toEqual({
        sessionID,
        requestID: asked.id,
        reply: "once",
      });
      expect(
        data(events.find((event) => event.type === "form.replied")),
      ).toEqual({
        id: form.id,
        sessionID,
        answer: { db: "pg" },
      });
      expect(
        data(events.find((event) => event.type === "session.tool.success")),
      ).toMatchObject({
        id: "call_1",
        content: [{ type: "text", text: "a.ts\n" }],
        executed: true,
      });

      // Durable session events carry a per-session sequence; deltas do not.
      const started = events.find(
        (event) => event.type === "session.execution.started",
      );
      expect(started).toMatchObject({
        id: expect.stringMatching(/^evt_/),
        created: expect.any(Number),
        durable: {
          aggregateID: sessionID,
          seq: expect.any(Number),
          version: 1,
        },
        location: { directory: expect.any(String) },
      });
      expect(
        events.find((event) => event.type === "session.text.delta"),
      ).not.toHaveProperty("durable");
      expect(
        (
          events.find((event) => event.type === "session.tool.success")
            ?.durable as JsonObject
        ).version,
      ).toBe(2);

      const messages = await api.json<{
        data: JsonObject[];
        cursor: JsonObject;
      }>("GET", `/api/session/${sessionID}/message`);
      expect(messages.data.map((message) => message.type)).toEqual([
        "user",
        "assistant",
      ]);
      expect(messages.data[1]).toMatchObject({
        finish: "stop",
        cost: 0.002,
        content: [
          { type: "reasoning" },
          { type: "tool", id: "call_1" },
          { type: "text" },
        ],
      });
      expect(
        fake.requests.some(
          (request) => request.path === `/api/session/${sessionID}/prompt`,
        ),
      ).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    "delivers steer prompts at the next step boundary and cancels queued inbox items",
    async () => {
      const { api } = await startV2({
        prompts: [
          { match: "steer", steps: [{ type: "text", text: "steered" }] },
          { match: "queued", steps: [{ type: "text", text: "queued run" }] },
          { match: "cancel", steps: [{ type: "text", text: "never runs" }] },
          {
            match: "long",
            steps: [
              { type: "text", text: "one" },
              { type: "permission", permission: "bash", patterns: ["make"] },
              { type: "text", text: "two" },
            ],
          },
        ],
      });
      const sessionID = String(
        (await api.json<{ data: JsonObject }>("POST", "/api/session", {})).data
          .id,
      );
      const prompt = (text: string, delivery?: string) =>
        api.json<{ data: JsonObject }>(
          "POST",
          `/api/session/${sessionID}/prompt`,
          {
            text,
            ...(delivery ? { delivery } : {}),
          },
        );
      await prompt("long task");
      const asked = data(await api.waitForEvent("permission.asked"));

      const steer = (await prompt("steer: use make", "steer")).data;
      expect(steer.delivery).toBe("steer");
      const queued = (await prompt("queued follow-up")).data;
      const cancelled = (await prompt("cancel me")).data;
      const inbox = await api.json<{ data: JsonObject[] }>(
        "GET",
        `/api/session/${sessionID}/inbox`,
      );
      expect(inbox.data.map((item) => item.id)).toEqual([
        steer.id,
        queued.id,
        cancelled.id,
      ]);
      expect(
        (
          await api.call(
            "DELETE",
            `/api/session/${sessionID}/inbox/${String(cancelled.id)}`,
          )
        ).status,
      ).toBe(204);
      expect(data(await api.waitForEvent("session.inbox.cancelled"))).toEqual({
        sessionID,
        inboxID: cancelled.id,
      });
      expect(
        (
          await api.call(
            "DELETE",
            `/api/session/${sessionID}/inbox/${String(cancelled.id)}`,
          )
        ).status,
      ).toBe(404);

      await api.call(
        "POST",
        `/api/session/${sessionID}/permission/${String(asked.id)}/reply`,
        {
          decision: "once",
        },
      );
      await api.waitForEvent("session.idle", 1);

      const events = api.events();
      const lifecycle = events.flatMap((event) => {
        const type = String(event.type);
        if (type === "session.inbox.delivered")
          return [`delivered:${String(data(event).inboxID)}`];
        if (type === "session.text.ended")
          return [`text:${String(data(event).text)}`];
        if (
          type.startsWith("session.execution.") ||
          type.startsWith("session.step.")
        )
          return [type];
        return [];
      });
      const [first] = events.filter(
        (event) => event.type === "session.inbox.delivered",
      );
      expect(lifecycle).toEqual([
        "session.execution.started",
        `delivered:${String(data(first).inboxID)}`,
        "session.step.started",
        "text:one",
        "session.step.ended",
        `delivered:${String(steer.id)}`,
        "session.step.started",
        "text:steered",
        "text:two",
        "session.step.ended",
        "session.execution.succeeded",
        "session.execution.started",
        `delivered:${String(queued.id)}`,
        "session.step.started",
        "text:queued run",
        "session.step.ended",
        "session.execution.succeeded",
      ]);

      const messages = await api.json<{ data: JsonObject[] }>(
        "GET",
        `/api/session/${sessionID}/message`,
      );
      expect(messages.data.map((message) => message.type)).toEqual([
        "user",
        "assistant",
        "user",
        "assistant",
        "user",
        "assistant",
      ]);
      expect(messages.data[2]).toMatchObject({
        id: steer.id,
        text: "steer: use make",
      });
      expect(
        (
          await api.json<{ data: JsonObject[] }>(
            "GET",
            `/api/session/${sessionID}/inbox`,
          )
        ).data,
      ).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    "interrupts a hung execution, cancels forms and reports failures",
    async () => {
      const { api } = await startV2({
        prompts: [
          {
            match: "form",
            steps: [
              {
                type: "form",
                title: "Q",
                fields: [{ key: "x", type: "boolean" }],
              },
            ],
          },
          {
            match: "fail",
            steps: [{ type: "error", message: "Provider exploded" }],
          },
          { steps: [{ type: "text", text: "working" }, { type: "hang" }] },
        ],
      });
      const sessionID = String(
        (await api.json<{ data: JsonObject }>("POST", "/api/session", {})).data
          .id,
      );
      await api.json("POST", `/api/session/${sessionID}/prompt`, {
        text: "go",
      });
      await api.waitForEvent("session.text.delta");
      expect(
        await api.json("POST", `/api/session/${sessionID}/interrupt`),
      ).toEqual({
        interrupted: true,
      });
      expect(
        data(await api.waitForEvent("session.execution.interrupted")),
      ).toEqual({
        sessionID,
        reason: "user",
      });
      expect(
        await api.json("POST", `/api/session/${sessionID}/interrupt`),
      ).toEqual({
        interrupted: false,
      });

      await api.json("POST", `/api/session/${sessionID}/prompt`, {
        text: "form please",
      });
      const form = data(await api.waitForEvent("form.created"))
        .form as JsonObject;
      expect(
        (
          await api.call(
            "DELETE",
            `/api/session/${sessionID}/form/${String(form.id)}`,
          )
        ).status,
      ).toBe(204);
      await api.waitForEvent("form.cancelled");

      await api.json("POST", `/api/session/${sessionID}/prompt`, {
        text: "fail now",
      });
      expect(data(await api.waitForEvent("session.execution.failed"))).toEqual({
        sessionID,
        error: { type: "provider", message: "Provider exploded" },
      });
      expect(data(await api.waitForEvent("session.step.failed"))).toMatchObject(
        {
          error: { message: "Provider exploded" },
        },
      );

      const missing = await api.call("GET", "/api/session/ses_missing");
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({
        _tag: "SessionNotFoundError",
        sessionID: "ses_missing",
      });
      const noPermission = await api.call(
        "POST",
        `/api/session/${sessionID}/permission/per_x/reply`,
        {
          decision: "once",
        },
      );
      expect(noPermission.status).toBe(404);
    },
    TEST_TIMEOUT,
  );

  it(
    "lists models, providers and agents, switches model and agent, and heartbeats",
    async () => {
      const { api } = await startV2({
        heartbeatMs: 50,
        directory: "/work/repo",
      });
      const models = await api.json<{
        location: JsonObject;
        data: JsonObject[];
      }>("GET", "/api/model");
      expect(models.location).toEqual({ directory: "/work/repo" });
      expect(models.data[0]).toMatchObject({
        providerID: "anthropic",
        modelID: "claude-sonnet-4-5",
      });
      const providers = await api.json<{ data: JsonObject[] }>(
        "GET",
        "/api/provider",
      );
      expect(providers.data.map((provider) => provider.id)).toEqual([
        "anthropic",
      ]);
      const agents = await api.json<{ data: JsonObject[] }>(
        "GET",
        "/api/agent",
      );
      expect(agents.data.map((agent) => agent.id)).toEqual([
        "build",
        "plan",
        "general",
      ]);

      const sessionID = String(
        (await api.json<{ data: JsonObject }>("POST", "/api/session", {})).data
          .id,
      );
      const model = { id: "claude-haiku-4-5", providerID: "anthropic" };
      expect(
        (await api.call("POST", `/api/session/${sessionID}/model`, { model }))
          .status,
      ).toBe(204);
      expect(
        (
          await api.call("POST", `/api/session/${sessionID}/agent`, {
            agent: "plan",
          })
        ).status,
      ).toBe(204);
      expect(data(await api.waitForEvent("session.model.selected"))).toEqual({
        sessionID,
        model,
      });
      expect(data(await api.waitForEvent("session.agent.selected"))).toEqual({
        sessionID,
        agent: "plan",
      });
      expect(await api.json("GET", `/api/session/${sessionID}`)).toMatchObject({
        data: { agent: "plan", model },
      });

      await waitFor(
        () =>
          api.items.filter((item) => item.comment === "heartbeat").length >= 2,
        "heartbeats",
      );
      const list = await api.json<{ data: JsonObject[]; cursor: JsonObject }>(
        "GET",
        "/api/session",
      );
      expect(list.data.map((session) => session.id)).toEqual([sessionID]);
      expect(list.cursor).toEqual({ previous: null, next: null });

      expect(
        (await api.call("DELETE", `/api/session/${sessionID}`)).status,
      ).toBe(204);
      const deleted = await api.waitForEvent("session.deleted");
      expect(deleted).toMatchObject({ data: { sessionID } });
      expect((deleted.durable as JsonObject).version).toBe(2);
      expect((await api.call("GET", `/api/session/${sessionID}`)).status).toBe(
        404,
      );
    },
    TEST_TIMEOUT,
  );
});
