import { afterAll, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { normalizeV2Event, toFormAnswer, toFormQuestions } =
  await import("./events");
const { OpenCode2SilentStreamError, openOpenCode2EventStream } =
  await import("./client");

// Bun.serve without depending on bun-types (tsconfig types: node).
type TestServer = { port: number; stop(force?: boolean): unknown };
const { serve: bunServe } = (
  globalThis as unknown as {
    Bun: { serve(options: Record<string, unknown>): TestServer };
  }
).Bun;
const servers: TestServer[] = [];

afterAll(() => {
  for (const server of servers) server.stop(true);
});

const envelope = (type: string, data: Record<string, unknown>) => ({
  created: 1,
  data,
  id: "evt_1",
  location: { directory: "/w" },
  type,
});

describe("normalizeV2Event", () => {
  it("ends the turn on any session.execution.* but started", () => {
    expect(
      normalizeV2Event(
        envelope("session.execution.started", { sessionID: "s" }),
      ),
    ).toEqual({ sessionId: "s", type: "execution.started" });
    expect(
      normalizeV2Event(
        envelope("session.execution.failed", {
          error: { message: "boom", type: "provider" },
          sessionID: "s",
        }),
      ),
    ).toEqual({
      error: "boom",
      outcome: "failed",
      sessionId: "s",
      type: "execution.ended",
    });
    // A newer server's execution end still settles the turn.
    expect(
      normalizeV2Event(
        envelope("session.execution.cancelled", { sessionID: "s" }),
      ),
    ).toEqual(
      expect.objectContaining({ outcome: "failed", type: "execution.ended" }),
    );
  });

  it("marks aborted steps as interruptions", () => {
    expect(
      normalizeV2Event(
        envelope("session.step.failed", {
          error: { message: "Step interrupted", type: "aborted" },
          sessionID: "s",
        }),
      ),
    ).toEqual({
      aborted: true,
      message: "Step interrupted",
      sessionId: "s",
      type: "step.failed",
    });
  });

  it("keys text by step message and ordinal, and tools by call id", () => {
    const base = { assistantMessageID: "m1", ordinal: 2, sessionID: "s" };
    expect(
      normalizeV2Event(
        envelope("session.text.delta", { ...base, delta: "Hi" }),
      ),
    ).toEqual({
      delta: "Hi",
      field: "text",
      messageId: "m1",
      partId: "m1:text:2",
      sessionId: "s",
      type: "part.delta",
    });
    expect(
      normalizeV2Event(
        envelope("session.tool.success", {
          assistantMessageID: "m1",
          content: [{ text: "out", type: "text" }],
          id: "call_1",
          sessionID: "s",
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        callId: "call_1",
        output: "out",
        status: "completed",
        type: "tool",
      }),
    );
  });

  it("attaches permission requests to the asking tool call", () => {
    expect(
      normalizeV2Event(
        envelope("permission.asked", {
          action: "shell",
          id: "per_1",
          resources: ["make"],
          sessionID: "s",
          source: { id: "call_1", messageID: "m1", type: "tool" },
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        permission: "shell",
        patterns: ["make"],
        requestId: "per_1",
        toolCallId: "call_1",
      }),
    );
  });

  it("maps a subagent session and skips unknown events", () => {
    expect(
      normalizeV2Event(
        envelope("session.created", { parentID: "s", sessionID: "child" }),
      ),
    ).toEqual({ parentId: "s", sessionId: "child", type: "session.child" });
    expect(
      normalizeV2Event(envelope("session.inbox.enqueued", { sessionID: "s" })),
    ).toBeNull();
    expect(normalizeV2Event({ type: "x" })).toBeNull();
  });
});

describe("forms", () => {
  const fields = [
    {
      key: "env",
      options: [
        { label: "Staging", value: "staging" },
        { label: "Production", value: "prod" },
      ],
      title: "Environment",
      type: "string",
    },
    { key: "force", title: "Force?", type: "boolean" },
    { key: "count", title: "How many?", type: "integer" },
    {
      key: "tags",
      options: [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ],
      title: "Tags",
      type: "multiselect",
    },
    { hidden: true, key: "secret", type: "string" },
  ];

  it("asks one question per visible field", () => {
    const questions = toFormQuestions(fields);
    expect(questions.map((question) => question.id)).toEqual([
      "env",
      "force",
      "count",
      "tags",
    ]);
    expect(questions[3]?.multiSelect).toBe(true);
    expect(questions[1]?.options.map((option) => option.label)).toEqual([
      "Yes",
      "No",
    ]);
  });

  it("types the card's answer per field", () => {
    const response = [
      "Environment: Production",
      "Force?: Yes",
      "How many?: 3",
      "Tags: A, B",
    ].join("\n");
    expect(toFormAnswer(fields, response)).toEqual({
      count: 3,
      env: "prod",
      force: true,
      tags: ["a", "b"],
    });
  });
});

describe("openOpenCode2EventStream", () => {
  /** An SSE endpoint writing `chunks`, then closing or staying open. */
  function serve(chunks: string[], close: boolean) {
    const encoder = new TextEncoder();
    const server = bunServe({
      fetch: () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              for (const chunk of chunks)
                controller.enqueue(encoder.encode(chunk));
              if (close) controller.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
      hostname: "127.0.0.1",
      idleTimeout: 0,
      port: 0,
    });
    servers.push(server);
    return `http://127.0.0.1:${server.port}`;
  }

  it("skips undecodable frames and keeps reading", async () => {
    const baseUrl = serve(
      [
        "data: {not json\n\n",
        ": heartbeat\n\n",
        `data: ${JSON.stringify(envelope("session.execution.started", { sessionID: "s" }))}\n\n`,
      ],
      true,
    );
    const abort = new AbortController();
    const stream = await openOpenCode2EventStream({
      authorization: "Basic x",
      baseUrl,
      signal: abort.signal,
    });
    const types: string[] = [];
    for await (const frame of stream) types.push(frame.type);
    expect(types).toEqual(["session.execution.started"]);
  });

  it("fails after the silence limit", async () => {
    const baseUrl = serve([": heartbeat\n\n"], false);
    const stream = await openOpenCode2EventStream({
      authorization: "Basic x",
      baseUrl,
      signal: new AbortController().signal,
      silenceMs: 150,
    });
    const read = (async () => {
      for await (const _ of stream) {
        // nothing arrives
      }
    })();
    await expect(read).rejects.toBeInstanceOf(OpenCode2SilentStreamError);
  });
});
