// Generation 1: the fake driven by the real @opencode-ai/sdk/v2 client, the
// one Sentinel's OpenCode engine uses against 1.x servers.
import { afterEach, describe, expect, it } from "bun:test";

import { createOpencodeClient, type Event } from "@opencode-ai/sdk/v2";

import {
  killAllFixtures,
  spawnFixture,
  waitFor,
  withTimeout,
} from "../shared/test-support";
import { start, type OpenCodeFake } from "./fake-server";
import { openCodeBasicAuth, type OpenCodeFakeScenario } from "./scenario";
import { FAKE_OPENCODE_PATH, spawnFakeOpenCode } from "./test-harness";

const TEST_TIMEOUT = 20_000;
const fakes: OpenCodeFake[] = [];
const pumps: Array<{ controller: AbortController; done: Promise<void> }> = [];

afterEach(async () => {
  // Stopping the servers ends every SDK event stream, so the pumps finish on
  // their own. Aborting a live stream instead makes the SDK's SSE client call
  // reader.cancel() without awaiting it, which surfaces as an unhandled
  // AbortError in whichever test runs next.
  await Promise.all(fakes.splice(0).map((fake) => fake.stop()));
  for (const pump of pumps.splice(0)) {
    await withTimeout(pump.done, 2_000, "event pump").catch(() =>
      pump.controller.abort(),
    );
  }
  await killAllFixtures();
});

async function startV1(scenario: OpenCodeFakeScenario = {}, password?: string) {
  const fake = await start({ generation: 1, scenario, password });
  fakes.push(fake);
  const client = createOpencodeClient({
    baseUrl: fake.url,
    directory: "/work/repo",
    throwOnError: true,
    ...(password
      ? { headers: { authorization: openCodeBasicAuth(password) } }
      : {}),
  });
  return { fake, client };
}

/** Subscribes like Sentinel's event pump and collects every event. */
async function collectEvents(client: ReturnType<typeof createOpencodeClient>) {
  const controller = new AbortController();
  const events: Event[] = [];
  // One attempt: when the fake stops, the stream ends instead of reconnecting.
  const subscription = await client.event.subscribe(undefined, {
    signal: controller.signal,
    sseMaxRetryAttempts: 1,
  });
  const done = (async () => {
    try {
      for await (const event of subscription.stream)
        events.push(event as Event);
    } catch {
      // the stream ended with the server
    }
  })();
  pumps.push({ controller, done });
  await waitFor(
    () => events.some((event) => event.type === "server.connected"),
    "server.connected",
  );
  return events;
}

/** The last element matching `predicate` (ES2022 lib has no findLast). */
function lastOf<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as T;
    if (predicate(item)) return item;
  }
  return undefined;
}

const idleFor = (events: Event[], sessionID: string) =>
  waitFor(
    () =>
      events.some(
        (event) =>
          event.type === "session.idle" &&
          event.properties.sessionID === sessionID,
      ),
    "session.idle",
  );

describe("OpenCode 1.x fake", () => {
  it(
    "answers health, providers, agents and session create through the SDK",
    async () => {
      const { client, fake } = await startV1({ version: "1.3.17" });
      const health = await client.global.health();
      expect(health.data).toEqual({ healthy: true, version: "1.3.17" });

      const providers = await client.provider.list();
      expect(providers.data?.default).toEqual({
        anthropic: "claude-sonnet-4-5",
      });
      expect(Object.keys(providers.data?.all[0]?.models ?? {})).toEqual([
        "claude-sonnet-4-5",
        "claude-haiku-4-5",
      ]);
      const agents = await client.app.agents();
      expect(agents.data?.map((agent) => agent.name)).toEqual([
        "build",
        "plan",
        "general",
      ]);

      const session = await client.session.create({ title: "Fixture" });
      // Read values before toMatchObject: Bun 1.4 writes asymmetric matchers
      // back into the received object.
      const sessionID = session.data?.id ?? "";
      expect(sessionID).toStartWith("ses_");
      expect(session.data).toMatchObject({
        title: "Fixture",
        directory: "/work/repo",
        version: "1.3.17",
      });
      expect((await client.session.get({ sessionID })).data?.id).toBe(
        sessionID,
      );
      const other =
        (await client.session.create({ title: "Doomed" })).data?.id ?? "";
      expect((await client.session.delete({ sessionID: other })).data).toBe(
        true,
      );
      expect(
        await client.session.get({ sessionID: other }).catch(() => "missing"),
      ).toBe("missing");
      // The SDK sends the directory as a header on POSTs and as a query on GETs.
      const created = fake.requests.find(
        (request) => request.method === "POST" && request.path === "/session",
      );
      expect(created?.headers["x-opencode-directory"]).toBe(
        encodeURIComponent("/work/repo"),
      );
      expect(fake.requests.at(-1)?.query.directory).toBe("/work/repo");

      // Unknown GET paths answer with the web UI, which the SDK rejects.
      const html = await fetch(`${fake.url}/api/info`);
      expect(html.headers.get("content-type")).toBe("text/html");
    },
    TEST_TIMEOUT,
  );

  it(
    "streams a prompt_async run as message.* events and ends with session.idle",
    async () => {
      const { client } = await startV1({
        prompts: [
          {
            steps: [
              { type: "reasoning", text: ["Let me ", "check."] },
              { type: "text", text: ["Hello ", "there"] },
              {
                type: "tool",
                tool: "bash",
                callID: "call_1",
                input: { command: "ls" },
                output: "a.ts\n",
                title: "ls",
                metadata: { exit: 0 },
              },
            ],
            tokens: { input: 10, output: 4 },
            cost: 0.002,
          },
        ],
      });
      const events = await collectEvents(client);
      const session = (await client.session.create({})).data!;
      const accepted = await client.session.promptAsync({
        sessionID: session.id,
        agent: "build",
        model: { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
        parts: [{ type: "text", text: "hi" }],
      });
      expect(accepted.response.status).toBe(204);
      await idleFor(events, session.id);

      const types = events.map((event) => event.type);
      expect(types[0]).toBe("server.connected");
      expect(types).toContain("message.part.delta");
      expect(types.at(-1)).toBe("session.idle");
      const deltas = events.flatMap((event) =>
        event.type === "message.part.delta" ? [event.properties.delta] : [],
      );
      expect(deltas).toEqual(["Let me ", "check.", "Hello ", "there"]);
      const toolStates = events.flatMap((event) =>
        event.type === "message.part.updated" &&
        event.properties.part.type === "tool"
          ? [event.properties.part.state.status]
          : [],
      );
      expect(toolStates).toEqual(["pending", "running", "completed"]);
      const finished = lastOf(
        events,
        (event) =>
          event.type === "message.updated" &&
          event.properties.info.role === "assistant",
      );
      expect(
        finished?.type === "message.updated" && finished.properties.info,
      ).toMatchObject({
        role: "assistant",
        finish: "stop",
        cost: 0.002,
        tokens: { input: 10, output: 4 },
        time: { completed: expect.any(Number) },
      });

      const messages =
        (await client.session.messages({ sessionID: session.id })).data ?? [];
      expect(messages.map((message) => message.info.role)).toEqual([
        "user",
        "assistant",
      ]);
      expect(messages[1]?.parts.map((part) => part.type)).toEqual([
        "step-start",
        "reasoning",
        "text",
        "tool",
        "step-finish",
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "asks permissions and questions and takes the replies",
    async () => {
      const { client, fake } = await startV1({
        prompts: [
          {
            steps: [
              {
                type: "tool",
                tool: "edit",
                input: { filePath: "/work/repo/a.ts" },
                output: "edited",
                permission: { permission: "edit", patterns: ["a.ts"] },
              },
              {
                type: "permission",
                permission: "bash",
                patterns: ["rm *"],
                branches: {
                  reject: [{ type: "text", text: "rejected" }],
                  "*": [{ type: "text", text: "allowed" }],
                },
              },
              {
                type: "question",
                questions: [
                  {
                    question: "Which DB?",
                    header: "DB",
                    options: [
                      { label: "Postgres", description: "SQL" },
                      { label: "SQLite", description: "File" },
                    ],
                  },
                ],
                branches: { replied: [{ type: "text", text: "answered" }] },
              },
              {
                type: "question",
                questions: [{ question: "Skip?", header: "Skip", options: [] }],
                branches: {
                  rejected: [{ type: "text", text: "question rejected" }],
                },
              },
            ],
          },
        ],
      });
      const events = await collectEvents(client);
      const session = (await client.session.create({})).data!;
      await client.session.promptAsync({
        sessionID: session.id,
        parts: [{ type: "text", text: "go" }],
      });

      const nextAsked = async <T extends Event["type"]>(
        type: T,
        index: number,
      ) =>
        (await waitFor(
          () => events.filter((event) => event.type === type)[index],
          `${type} #${index}`,
        )) as Extract<Event, { type: T }>;

      const editAsk = await nextAsked("permission.asked", 0);
      expect(editAsk.properties.tool?.callID).toStartWith("call_");
      expect(editAsk.properties).toMatchObject({
        sessionID: session.id,
        permission: "edit",
        patterns: ["a.ts"],
        always: ["a.ts"],
      });
      expect(
        (await client.permission.list()).data?.map((request) => request.id),
      ).toEqual([editAsk.properties.id]);
      await client.permission.reply({
        requestID: editAsk.properties.id,
        reply: "once",
      });

      const bashAsk = await nextAsked("permission.asked", 1);
      await client.permission.reply({
        requestID: bashAsk.properties.id,
        reply: "reject",
      });

      const question = await nextAsked("question.asked", 0);
      expect(
        question.properties.questions[0]?.options.map((option) => option.label),
      ).toEqual(["Postgres", "SQLite"]);
      await client.question.reply({
        requestID: question.properties.id,
        answers: [["SQLite"]],
      });
      const second = await nextAsked("question.asked", 1);
      await client.question.reject({ requestID: second.properties.id });
      await idleFor(events, session.id);

      const replies = events.flatMap((event) =>
        event.type === "permission.replied" ? [event.properties.reply] : [],
      );
      expect(replies).toEqual(["once", "reject"]);
      expect(events).toContainEqual({
        type: "question.replied",
        properties: {
          sessionID: session.id,
          requestID: question.properties.id,
          answers: [["SQLite"]],
        },
      });
      expect(events.some((event) => event.type === "question.rejected")).toBe(
        true,
      );
      const texts = events.flatMap((event) =>
        event.type === "message.part.updated" &&
        event.properties.part.type === "text" &&
        event.properties.part.time?.end
          ? [event.properties.part.text]
          : [],
      );
      expect(texts).toEqual(["rejected", "answered", "question rejected"]);

      const missing = await client.permission
        .reply({ requestID: "per_missing", reply: "once" })
        .catch((error: unknown) => error);
      expect(missing).toBeDefined();
      expect(fake.requests.at(-1)?.path).toBe("/permission/per_missing/reply");
    },
    TEST_TIMEOUT,
  );

  it(
    "aborts a hung run with MessageAbortedError and reports script errors",
    async () => {
      const { client } = await startV1({
        prompts: [
          {
            match: "fail",
            steps: [
              { type: "text", text: "partial" },
              { type: "error", message: "Provider exploded", name: "APIError" },
            ],
          },
          { steps: [{ type: "text", text: "working" }, { type: "hang" }] },
        ],
      });
      const events = await collectEvents(client);
      const session = (await client.session.create({})).data!;
      await client.session.promptAsync({
        sessionID: session.id,
        parts: [{ type: "text", text: "go" }],
      });
      await waitFor(
        () => events.some((event) => event.type === "message.part.delta"),
        "delta",
      );
      const aborted = await client.session.abort({ sessionID: session.id });
      expect(aborted.data).toBe(true);
      await idleFor(events, session.id);
      const error = events.find((event) => event.type === "session.error");
      expect(
        error?.type === "session.error" && error.properties.error?.name,
      ).toBe("MessageAbortedError");

      const failed = (await client.session.create({})).data!;
      await client.session.promptAsync({
        sessionID: failed.id,
        parts: [{ type: "text", text: "please fail" }],
      });
      await idleFor(events, failed.id);
      const failure = lastOf(events, (event) => event.type === "session.error");
      expect(
        failure?.type === "session.error" && failure.properties,
      ).toMatchObject({
        sessionID: failed.id,
        error: { name: "APIError", data: { message: "Provider exploded" } },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "requires Basic auth when a password is set and emits heartbeats",
    async () => {
      const { fake, client } = await startV1({ heartbeatMs: 50 }, "s3cret");
      expect((await fetch(`${fake.url}/global/health`)).status).toBe(401);
      expect((await client.global.health()).data?.healthy).toBe(true);
      const events = await collectEvents(client);
      await waitFor(
        () =>
          events.filter(
            (event) => (event.type as string) === "server.heartbeat",
          ).length >= 2,
        "heartbeats",
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "runs as `opencode serve` with the 1.x readiness line and --version output",
    async () => {
      const spawned = await spawnFakeOpenCode(
        1,
        { version: "1.18.35" },
        { OPENCODE_SERVER_PASSWORD: "pw" },
      );
      expect(spawned.fixture.stdoutText()).toBe(
        `opencode server listening on ${spawned.url}\n`,
      );
      const client = createOpencodeClient({
        baseUrl: spawned.url,
        headers: { authorization: openCodeBasicAuth("pw") },
      });
      expect((await client.global.health()).data).toEqual({
        healthy: true,
        version: "1.18.35",
      });

      const version = spawnFixture(FAKE_OPENCODE_PATH, { args: ["--version"] });
      await withTimeout(version.exited, 5_000, "--version");
      expect(version.stdoutText()).toBe("1.18.32\n");
    },
    TEST_TIMEOUT,
  );
});
