#!/usr/bin/env bun
// Fake OpenCode HTTP server (Bun.serve) for both generations:
//   1.x — what @opencode-ai/sdk/v2 talks to: /global/health, /provider,
//         /agent, /session*, /permission/*, /question/*, SSE /event.
//   2.x — @opencode/client's /api/* routes with HTTP Basic auth and SSE
//         /api/event (`: heartbeat` comments).
// Use it in-process (`start({generation, scenario})`) or as a stand-in binary:
//   SENTINEL_OPENCODE_FAKE_GENERATION=2 bun fake-server.ts serve --hostname=127.0.0.1 --port=0
// which prints the readiness line the real `opencode serve` prints.
import { randomBytes } from "node:crypto";

import {
  createJsonlLog,
  loadScenarioFromEnv,
  sleep,
  waitForAbort,
  type JsonObject,
} from "../shared/fixture-io";
import {
  OPENCODE_FAKE_GENERATION_ENV,
  OPENCODE_FAKE_LOG_ENV,
  OPENCODE_FAKE_SCENARIO_ENV,
  OPENCODE_FAKE_SCENARIO_FILE_ENV,
  openCodeBasicAuth,
  type OpenCodeBranches,
  type OpenCodeFakeRequest,
  type OpenCodeFakeScenario,
  type OpenCodeGeneration,
  type OpenCodePromptScript,
  type OpenCodeStep,
} from "./scenario";

export type StartOpenCodeFakeOptions = {
  generation: OpenCodeGeneration;
  scenario?: OpenCodeFakeScenario;
  hostname?: string;
  /** 0 (default) picks a free port. */
  port?: number;
  /**
   * Basic-auth password. 1.x: `null`/unset serves without auth (like an unset
   * OPENCODE_SERVER_PASSWORD). 2.x always requires one and generates it when
   * unset.
   */
  password?: string | null;
  /** Append every request to this JSONL file. */
  logPath?: string;
};

export type OpenCodeFake = {
  generation: OpenCodeGeneration;
  url: string;
  password: string | null;
  version: string;
  /** Every request received, in order. */
  requests: OpenCodeFakeRequest[];
  /** Pushes a raw event (already in the generation's wire shape) to every SSE subscriber. */
  emit(event: JsonObject): void;
  stop(): Promise<void>;
};

// Bun.serve without depending on bun-types: the fixtures only run under bun.
type BunServerLike = {
  port: number;
  stop(closeActiveConnections?: boolean): unknown;
};
type BunServeOptions = {
  hostname: string;
  port: number;
  idleTimeout?: number;
  fetch(request: Request): Response | Promise<Response>;
};

function bunServe(options: BunServeOptions): BunServerLike {
  const bun = (
    globalThis as { Bun?: { serve(options: BunServeOptions): BunServerLike } }
  ).Bun;
  if (!bun) throw new Error("fake-server.ts needs the bun runtime (Bun.serve)");
  return bun.serve(options);
}

const SPA_HTML =
  '<!doctype html>\n<html lang="en" style="background-color: var(--v2-background-bg-deep, #fafafa)">\n';
const encoder = new TextEncoder();

type Subscriber = { write(text: string): void };

type PendingReply = {
  sessionID: string;
  resolve(outcome: string, payload?: unknown): void;
};
type Reply = { outcome: string; payload?: unknown };

type SessionRecord = {
  id: string;
  title: string;
  directory: string;
  created: number;
  updated: number;
  agent?: string;
  model?: JsonObject;
  messages: JsonObject[];
  run?: {
    controller: AbortController;
    done: Promise<void>;
    /** 2.x `delivery:"steer"` prompts waiting for the next step boundary. */
    steers: PendingPrompt[];
  };
  queue: QueuedTask[];
};

/** A 2.x prompt sitting in the session inbox. */
type PendingPrompt = { userMessage: JsonObject; script: OpenCodePromptScript };

type QueuedTask = {
  /** 2.x inbox id (the user message id); absent for 1.x prompts. */
  inboxID?: string;
  run(signal: AbortSignal): Promise<void>;
  /** Drops the task without running it. */
  cancel(): void;
};

type RunContext = {
  session: SessionRecord;
  signal: AbortSignal;
  assistantMessageID: string;
  /** 1.x parts / 2.x content blocks of the assistant message. */
  blocks: JsonObject[];
  assistant: JsonObject;
};

class StepFailure extends Error {
  constructor(
    message: string,
    readonly errorName: string,
  ) {
    super(message);
  }
}

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_mock${Date.now().toString(36)}${idCounter.toString().padStart(4, "0")}`;
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function textOf(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .flatMap((part: unknown) =>
      part && typeof part === "object" && (part as JsonObject).type === "text"
        ? [String((part as JsonObject).text ?? "")]
        : [],
    )
    .join("\n");
}

function pickBranch(branches: OpenCodeBranches | undefined, key: string) {
  return branches?.[key] ?? branches?.["*"];
}

const DURABLE_VERSION: Record<string, number> = {
  "session.tool.success": 2,
  "session.tool.failed": 2,
  "session.deleted": 2,
};
const NON_DURABLE = new Set([
  "session.text.delta",
  "session.reasoning.delta",
  "session.tool.input.delta",
  "session.tool.progress",
  "session.status",
  "session.idle",
  "permission.asked",
  "permission.replied",
  "form.created",
  "form.replied",
  "form.cancelled",
]);

class FakeOpenCodeServer {
  readonly requests: OpenCodeFakeRequest[] = [];
  readonly version: string;
  private readonly subscribers = new Set<Subscriber>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly permissions = new Map<
    string,
    PendingReply & { request: JsonObject }
  >();
  private readonly questions = new Map<
    string,
    PendingReply & { request: JsonObject }
  >();
  private readonly forms = new Map<
    string,
    PendingReply & { form: JsonObject }
  >();
  private readonly seq = new Map<string, number>();
  /** 2.x user messages by inbox id, until delivered or cancelled. */
  private readonly inboxItems = new Map<string, JsonObject>();
  private readonly log: (record: JsonObject) => void;
  private unmatchedPrompts = 0;

  constructor(
    readonly generation: OpenCodeGeneration,
    readonly scenario: OpenCodeFakeScenario,
    readonly password: string | null,
    logPath: string | undefined,
  ) {
    this.version =
      scenario.version ?? (generation === 1 ? "1.18.32" : "2.0.18");
    this.log = createJsonlLog(logPath);
    for (const session of scenario.sessions ?? []) {
      this.createSession(
        { id: session.id, title: session.title, directory: session.directory },
        false,
      );
    }
  }

  get directory(): string {
    return this.scenario.directory ?? process.cwd();
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  async handle(request: Request, origin: string): Promise<Response> {
    const url = new URL(request.url);
    const text =
      request.method === "GET" || request.method === "HEAD"
        ? ""
        : await request.text();
    let body: unknown = text === "" ? undefined : text;
    try {
      body = text === "" ? undefined : JSON.parse(text);
    } catch {
      // keep the raw text
    }
    const headers: Record<string, string> = {};
    for (const name of [
      "authorization",
      "content-type",
      "x-opencode-directory",
      "accept",
      "last-event-id",
    ]) {
      const value = request.headers.get(name);
      if (value !== null) headers[name] = value;
    }
    const record: OpenCodeFakeRequest = {
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers,
      body,
    };
    this.requests.push(record);
    this.log({ ...record });

    if (
      this.password !== null &&
      request.headers.get("authorization") !== openCodeBasicAuth(this.password)
    ) {
      return this.generation === 1
        ? new Response("", { status: 401 })
        : json(
            { _tag: "UnauthorizedError", message: "Authentication required" },
            401,
            {
              "www-authenticate": "Basic",
            },
          );
    }

    const response =
      this.generation === 1
        ? await this.routeV1(request.method, url, body, request.headers)
        : await this.routeV2(request.method, url, body, origin);
    if (response) return response;
    if (request.method === "GET") {
      // Both generations serve their web UI for unknown paths.
      return new Response(SPA_HTML, {
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("Not Found", { status: 404 });
  }

  private async routeV1(
    method: string,
    url: URL,
    body: unknown,
    headers: Headers,
  ): Promise<Response | undefined> {
    const path = url.pathname;
    const input = (body ?? {}) as JsonObject;
    const notFound = (message: string) =>
      json({ name: "NotFoundError", data: { message } }, 404);
    let match: RegExpExecArray | null;

    if (method === "GET" && path === "/global/health") {
      return json({ healthy: true, version: this.version });
    }
    if (method === "GET" && path === "/event") return this.sse();
    if (method === "GET" && path === "/provider") {
      return json(this.scenario.providers ?? defaultV1Providers());
    }
    if (method === "GET" && path === "/agent")
      return json(this.scenario.agents ?? defaultV1Agents());
    if (method === "GET" && path === "/command")
      return json(this.scenario.commands ?? []);
    if (method === "GET" && path === "/session") {
      return json(
        [...this.sessions.values()].map((session) =>
          this.sessionInfoV1(session),
        ),
      );
    }
    if (method === "POST" && path === "/session") {
      const directoryHeader = headers.get("x-opencode-directory");
      const directory =
        url.searchParams.get("directory") ??
        (directoryHeader ? decodeURIComponent(directoryHeader) : undefined);
      const session = this.createSession({
        title: typeof input.title === "string" ? input.title : undefined,
        directory,
      });
      return json(this.sessionInfoV1(session));
    }
    if (method === "GET" && path === "/permission") {
      return json(
        [...this.permissions.values()].map((pending) => pending.request),
      );
    }
    if (method === "GET" && path === "/question") {
      return json(
        [...this.questions.values()].map((pending) => pending.request),
      );
    }
    if (
      (match = /^\/permission\/([^/]+)\/reply$/.exec(path)) &&
      method === "POST"
    ) {
      const pending = this.permissions.get(decodeURIComponent(match[1] ?? ""));
      if (!pending)
        return notFound(`Permission request not found: ${match[1]}`);
      pending.resolve(String(input.reply));
      return json(true);
    }
    if (
      (match = /^\/question\/([^/]+)\/(reply|reject)$/.exec(path)) &&
      method === "POST"
    ) {
      const id = decodeURIComponent(match[1] ?? "");
      const pending = this.questions.get(id);
      if (!pending) return notFound(`Question request not found: ${id}`);
      if (match[2] === "reply") {
        pending.resolve("replied", input.answers);
      } else {
        pending.resolve("rejected");
      }
      return json(true);
    }
    if ((match = /^\/session\/([^/]+)(\/.*)?$/.exec(path))) {
      const session = this.sessions.get(decodeURIComponent(match[1] ?? ""));
      const rest = match[2] ?? "";
      if (!session) return notFound(`Session not found: ${match[1]}`);
      if (method === "GET" && rest === "")
        return json(this.sessionInfoV1(session));
      if (method === "DELETE" && rest === "") {
        session.run?.controller.abort();
        this.sessions.delete(session.id);
        this.publish("session.deleted", {
          sessionID: session.id,
          info: this.sessionInfoV1(session),
        });
        return json(true);
      }
      if (method === "GET" && rest === "/message")
        return json(session.messages);
      if (method === "POST" && rest === "/abort") {
        const running = session.run;
        if (running) {
          running.controller.abort();
          await running.done;
        }
        return json(true);
      }
      if (
        method === "POST" &&
        (rest === "/prompt_async" || rest === "/message")
      ) {
        const text = textOf(input.parts);
        const script = this.selectScript(text);
        if (script.reject)
          return json(script.reject.body, script.reject.status);
        const done = this.enqueue(session, (signal) =>
          this.runV1(session, signal, input, script),
        );
        if (rest === "/prompt_async")
          return new Response(null, { status: 204 });
        await done;
        return json(session.messages.at(-1) ?? {});
      }
    }
    return undefined;
  }

  private async routeV2(
    method: string,
    url: URL,
    body: unknown,
    origin: string,
  ): Promise<Response | undefined> {
    const path = url.pathname;
    const input = (body ?? {}) as JsonObject;
    const location = { directory: this.directory };
    let match: RegExpExecArray | null;
    const sessionNotFound = (id: string) =>
      json(
        {
          _tag: "SessionNotFoundError",
          sessionID: id,
          message: `Session not found: ${id}`,
        },
        404,
      );

    if (method === "GET" && path === "/api/info") {
      return json({
        version: this.version,
        pid: process.pid,
        urls: [origin],
        paths: { tmp: "/tmp/opencode" },
      });
    }
    if (method === "GET" && path === "/api/event") return this.sse();
    if (method === "GET" && path === "/api/model") {
      return json(
        this.scenario.models ?? { location, data: defaultV2Models() },
      );
    }
    if (method === "GET" && path === "/api/provider") {
      return json(
        this.scenario.providers ?? { location, data: defaultV2Providers() },
      );
    }
    if (method === "GET" && path === "/api/agent") {
      return json(
        this.scenario.agents ?? { location, data: defaultV2Agents() },
      );
    }
    if (method === "GET" && path === "/api/command") {
      return json(this.scenario.commands ?? { location, data: [] });
    }
    if (method === "GET" && path === "/api/session") {
      return json({
        data: [...this.sessions.values()].map((session) =>
          this.sessionInfoV2(session),
        ),
        cursor: { previous: null, next: null },
      });
    }
    if (method === "POST" && path === "/api/session") {
      const requested = input.location as JsonObject | undefined;
      const session = this.createSession({
        id: typeof input.id === "string" ? input.id : undefined,
        title: typeof input.title === "string" ? input.title : undefined,
        directory:
          typeof requested?.directory === "string"
            ? requested.directory
            : undefined,
        agent: typeof input.agent === "string" ? input.agent : undefined,
        model: input.model as JsonObject | undefined,
      });
      return json({ data: this.sessionInfoV2(session) });
    }
    if ((match = /^\/api\/session\/([^/]+)(\/.*)?$/.exec(path))) {
      const id = decodeURIComponent(match[1] ?? "");
      const rest = match[2] ?? "";
      const session = this.sessions.get(id);
      if (!session) return sessionNotFound(id);
      if (method === "GET" && rest === "")
        return json({ data: this.sessionInfoV2(session) });
      if (method === "DELETE" && rest === "") {
        session.run?.controller.abort();
        this.sessions.delete(id);
        this.publish("session.deleted", { sessionID: id });
        return new Response(null, { status: 204 });
      }
      if (method === "GET" && rest === "/message") {
        return json({
          data: session.messages,
          cursor: { previous: null, next: null },
        });
      }
      if (method === "POST" && rest === "/prompt") {
        const text = typeof input.text === "string" ? input.text : "";
        const script = this.selectScript(text);
        if (script.reject)
          return json(script.reject.body, script.reject.status);
        const userMessage = {
          id: typeof input.id === "string" ? input.id : makeId("msg"),
          sessionID: id,
          time: { created: Date.now() },
          type: "user",
          payload: {
            text,
            ...(Array.isArray(input.files) ? { files: input.files } : {}),
            ...(Array.isArray(input.agents) ? { agents: input.agents } : {}),
            ...(Array.isArray(input.skills) ? { skills: input.skills } : {}),
            ...(input.metadata ? { metadata: input.metadata } : {}),
          },
          delivery: input.delivery === "steer" ? "steer" : "queue",
        };
        this.inboxItems.set(String(userMessage.id), userMessage);
        this.publish("session.inbox.enqueued", {
          sessionID: id,
          inboxID: userMessage.id,
          item: {
            type: "user",
            payload: userMessage.payload,
            delivery: userMessage.delivery,
          },
        });
        const pending: PendingPrompt = { userMessage, script };
        if (userMessage.delivery === "steer" && session.run) {
          // Delivered into the running execution at its next step boundary.
          session.run.steers.push(pending);
        } else if (input.resume !== false) {
          void this.enqueue(
            session,
            (signal) => this.runV2(session, signal, pending),
            String(userMessage.id),
          );
        }
        return json({ data: userMessage });
      }
      if (method === "GET" && rest === "/inbox") {
        // Undelivered prompts, including `resume:false` ones nobody runs.
        return json({
          data: [...this.inboxItems.values()].filter(
            (item) => item.sessionID === id,
          ),
        });
      }
      if ((match = /^\/inbox\/([^/]+)$/.exec(rest)) && method === "DELETE") {
        const inboxID = decodeURIComponent(match[1] ?? "");
        if (this.inboxItems.get(inboxID)?.sessionID !== id) {
          return json(
            {
              _tag: "MessageNotFoundError",
              messageID: inboxID,
              message: `Inbox item not found: ${inboxID}`,
            },
            404,
          );
        }
        const steers = session.run?.steers ?? [];
        const steerIndex = steers.findIndex(
          (item) => item.userMessage.id === inboxID,
        );
        if (steerIndex !== -1) steers.splice(steerIndex, 1);
        const queueIndex = session.queue.findIndex(
          (task) => task.inboxID === inboxID,
        );
        if (queueIndex !== -1) session.queue.splice(queueIndex, 1)[0]?.cancel();
        this.inboxItems.delete(inboxID);
        this.publish("session.inbox.cancelled", { sessionID: id, inboxID });
        return new Response(null, { status: 204 });
      }
      if (method === "POST" && rest === "/interrupt") {
        const running = session.run;
        if (running) {
          running.controller.abort();
          await running.done;
        }
        return json({ interrupted: running !== undefined });
      }
      if (method === "POST" && rest === "/model") {
        const previous = session.model;
        session.model = input.model as JsonObject;
        this.publish("session.model.selected", {
          sessionID: id,
          model: session.model,
          ...(previous ? { previous } : {}),
        });
        return new Response(null, { status: 204 });
      }
      if (method === "POST" && rest === "/agent") {
        const previous = session.agent;
        session.agent = String(input.agent);
        this.publish("session.agent.selected", {
          sessionID: id,
          agent: session.agent,
          ...(previous ? { previous } : {}),
        });
        return new Response(null, { status: 204 });
      }
      if (method === "GET" && rest === "/permission") {
        return json({
          data: [...this.permissions.values()]
            .filter((pending) => pending.sessionID === id)
            .map((pending) => pending.request),
        });
      }
      if (
        (match = /^\/permission\/([^/]+)\/reply$/.exec(rest)) &&
        method === "POST"
      ) {
        const requestID = decodeURIComponent(match[1] ?? "");
        const pending = this.permissions.get(requestID);
        if (!pending || pending.sessionID !== id) {
          return json(
            {
              _tag: "PermissionNotFoundError",
              requestID,
              message: `Permission request not found: ${requestID}`,
            },
            404,
          );
        }
        pending.resolve(String(input.decision));
        return new Response(null, { status: 204 });
      }
      if ((match = /^\/form\/([^/]+)(\/reply)?$/.exec(rest))) {
        const formID = decodeURIComponent(match[1] ?? "");
        const pending = this.forms.get(formID);
        if (!pending || pending.sessionID !== id) {
          return json(
            {
              _tag: "FormNotFoundError",
              id: formID,
              message: `Form not found: ${formID}`,
            },
            404,
          );
        }
        if (method === "GET" && !match[2]) return json({ data: pending.form });
        if (method === "POST" && match[2]) {
          pending.resolve("replied", input.answer);
          return new Response(null, { status: 204 });
        }
        if (method === "DELETE" && !match[2]) {
          pending.resolve("cancelled");
          return new Response(null, { status: 204 });
        }
      }
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // SSE
  // -------------------------------------------------------------------------

  private sse(): Response {
    let subscriber: Subscriber | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const heartbeatMs =
      this.scenario.heartbeatMs ?? (this.generation === 1 ? 10_000 : 15_000);
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const current: Subscriber = {
          write: (text) => {
            try {
              controller.enqueue(encoder.encode(text));
            } catch {
              this.subscribers.delete(current);
            }
          },
        };
        subscriber = current;
        this.subscribers.add(current);
        current.write(
          this.frame(
            this.generation === 1
              ? { type: "server.connected", properties: {} }
              : { id: makeId("evt"), type: "server.connected", data: {} },
          ),
        );
        timer = setInterval(() => {
          current.write(
            this.generation === 1
              ? this.frame({ type: "server.heartbeat", properties: {} })
              : ": heartbeat\n\n",
          );
        }, heartbeatMs);
      },
      cancel: () => {
        if (timer) clearInterval(timer);
        if (subscriber) this.subscribers.delete(subscriber);
      },
    });
    return new Response(stream, {
      headers:
        this.generation === 1
          ? {
              "content-type": "text/event-stream",
              "cache-control": "no-cache",
              connection: "keep-alive",
            }
          : {
              "content-type": "text/event-stream",
              "cache-control": "no-cache, no-transform",
              "x-accel-buffering": "no",
              "x-content-type-options": "nosniff",
            },
    });
  }

  private frame(event: JsonObject): string {
    return `data: ${JSON.stringify(event)}\n\n`;
  }

  emitRaw(event: JsonObject) {
    const frame = this.frame(event);
    for (const subscriber of this.subscribers) subscriber.write(frame);
  }

  /** Publishes an event in the generation's shape. */
  publish(type: string, data: JsonObject) {
    if (this.generation === 1) {
      this.emitRaw({ type, properties: data });
      return;
    }
    const sessionID =
      typeof data.sessionID === "string" ? data.sessionID : undefined;
    let durable: JsonObject | undefined;
    if (sessionID && !NON_DURABLE.has(type) && type.startsWith("session.")) {
      const seq = (this.seq.get(sessionID) ?? 0) + 1;
      this.seq.set(sessionID, seq);
      durable = {
        aggregateID: sessionID,
        seq,
        version: DURABLE_VERSION[type] ?? 1,
      };
    }
    this.emitRaw({
      id: makeId("evt"),
      created: Date.now(),
      type,
      ...(durable ? { durable } : {}),
      location: { directory: this.directory },
      data,
    });
  }

  // -------------------------------------------------------------------------
  // Sessions and runs
  // -------------------------------------------------------------------------

  private createSession(
    input: {
      id?: string;
      title?: string;
      directory?: string;
      agent?: string;
      model?: JsonObject;
    },
    announce = true,
  ): SessionRecord {
    const now = Date.now();
    const session: SessionRecord = {
      id: input.id ?? makeId("ses"),
      title: input.title ?? `New session - ${new Date(now).toISOString()}`,
      directory: input.directory ?? this.directory,
      created: now,
      updated: now,
      ...(input.agent ? { agent: input.agent } : {}),
      ...(input.model ? { model: input.model } : {}),
      messages: [],
      queue: [],
    };
    this.sessions.set(session.id, session);
    if (announce) {
      if (this.generation === 1) {
        const info = this.sessionInfoV1(session);
        this.publish("session.created", { sessionID: session.id, info });
        this.publish("session.updated", { sessionID: session.id, info });
      } else {
        this.publish("session.created", {
          sessionID: session.id,
          projectID: "prj_mock",
          location: { directory: session.directory },
          slug: session.id.slice(4, 12),
          title: session.title,
          ...(session.agent ? { agent: session.agent } : {}),
          ...(session.model ? { model: session.model } : {}),
          version: this.version,
        });
      }
    }
    return session;
  }

  private sessionInfoV1(session: SessionRecord): JsonObject {
    return {
      id: session.id,
      slug: session.id.slice(4, 12),
      projectID: "prj_mock",
      directory: session.directory,
      title: session.title,
      version: this.version,
      time: { created: session.created, updated: session.updated },
    };
  }

  private sessionInfoV2(session: SessionRecord): JsonObject {
    return {
      id: session.id,
      projectID: "prj_mock",
      ...(session.agent ? { agent: session.agent } : {}),
      ...(session.model ? { model: session.model } : {}),
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      time: { created: session.created, updated: session.updated },
      title: session.title,
      location: { directory: session.directory },
    };
  }

  private selectScript(text: string): OpenCodePromptScript {
    const scripts = this.scenario.prompts ?? [];
    const matched = scripts.find(
      (script) => script.match !== undefined && text.includes(script.match),
    );
    if (matched) return matched;
    const ordered = scripts.filter((script) => script.match === undefined);
    const index = this.unmatchedPrompts++;
    return (
      ordered[Math.min(index, ordered.length - 1)] ?? {
        steps: [{ type: "text", text: "Mock reply." }],
      }
    );
  }

  /** Runs `task` after the session's current run, like a busy session queueing prompts. */
  private enqueue(
    session: SessionRecord,
    task: (signal: AbortSignal) => Promise<void>,
    inboxID?: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      session.queue.push({
        ...(inboxID ? { inboxID } : {}),
        run: async (signal) => {
          try {
            await task(signal);
          } finally {
            resolve();
          }
        },
        cancel: resolve,
      });
      if (!session.run) void this.drain(session);
    });
  }

  private async drain(session: SessionRecord): Promise<void> {
    for (let next = session.queue.shift(); next; next = session.queue.shift()) {
      const controller = new AbortController();
      const running = {
        controller,
        done: Promise.resolve(),
        steers: [] as PendingPrompt[],
      };
      session.run = running;
      running.done = next.run(controller.signal);
      await running.done;
      session.run = undefined;
      // Steers that missed the last step boundary of a run that finished on
      // its own start the next execution; after an interrupt they stay queued
      // in the inbox (GET /inbox) until cancelled.
      if (!controller.signal.aborted) {
        for (const steer of running.steers.reverse()) {
          session.queue.unshift({
            inboxID: String(steer.userMessage.id),
            run: (signal) => this.runV2(session, signal, steer),
            cancel: () => {},
          });
        }
      }
    }
  }

  private awaitReply<E extends PendingReply>(
    store: Map<string, E>,
    id: string,
    entry: Omit<E, "resolve">,
    signal: AbortSignal,
  ): Promise<Reply> {
    return new Promise((resolve) => {
      const finish = (outcome: string, payload?: unknown) => {
        store.delete(id);
        resolve({ outcome, payload });
      };
      store.set(id, { ...entry, resolve: finish } as E);
      signal.addEventListener("abort", () => finish("aborted"), { once: true });
    });
  }

  private async runV1(
    session: SessionRecord,
    signal: AbortSignal,
    input: JsonObject,
    script: OpenCodePromptScript,
  ) {
    const sessionID = session.id;
    const agent =
      typeof input.agent === "string"
        ? input.agent
        : (session.agent ?? "build");
    const model = (input.model as JsonObject | undefined) ?? {
      providerID: "anthropic",
      modelID: "claude-sonnet-4-5",
    };
    const now = Date.now();
    const userInfo = {
      id: typeof input.messageID === "string" ? input.messageID : makeId("msg"),
      sessionID,
      role: "user",
      time: { created: now },
      agent,
      model: { providerID: model.providerID, modelID: model.modelID },
    };
    const userParts = (Array.isArray(input.parts) ? input.parts : []).map(
      (part: unknown) => ({
        ...(part as JsonObject),
        id: makeId("prt"),
        sessionID,
        messageID: userInfo.id,
      }),
    );
    this.publish("message.updated", { sessionID, info: userInfo });
    for (const part of userParts)
      this.publish("message.part.updated", {
        sessionID,
        part,
        time: Date.now(),
      });
    session.messages.push({ info: userInfo, parts: userParts });
    if (input.noReply === true) return;

    this.publish("session.status", { sessionID, status: { type: "busy" } });
    const assistant: JsonObject = {
      id: makeId("msg"),
      sessionID,
      role: "assistant",
      time: { created: Date.now() },
      parentID: userInfo.id,
      modelID: model.modelID,
      providerID: model.providerID,
      mode: agent,
      agent,
      path: { cwd: session.directory, root: session.directory },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };
    this.publish("message.updated", { sessionID, info: assistant });
    const ctx: RunContext = {
      session,
      signal,
      assistantMessageID: String(assistant.id),
      blocks: [],
      assistant,
    };
    this.publishPartV1(ctx, { type: "step-start" });

    try {
      await this.runSteps(ctx, script.steps);
      const tokens = {
        input: script.tokens?.input ?? 120,
        output: script.tokens?.output ?? 30,
        reasoning: script.tokens?.reasoning ?? 0,
        cache: {
          read: script.tokens?.cacheRead ?? 0,
          write: script.tokens?.cacheWrite ?? 0,
        },
      };
      const cost = script.cost ?? 0.0012;
      this.publishPartV1(ctx, {
        type: "step-finish",
        reason: script.finish ?? "stop",
        cost,
        tokens,
      });
      Object.assign(assistant, {
        time: {
          created: (assistant.time as JsonObject).created,
          completed: Date.now(),
        },
        cost,
        tokens,
        finish: script.finish ?? "stop",
      });
      this.publish("message.updated", { sessionID, info: assistant });
    } catch (error) {
      const aborted = signal.aborted;
      const failure = {
        name: aborted
          ? "MessageAbortedError"
          : error instanceof StepFailure
            ? error.errorName
            : "UnknownError",
        data: {
          message: aborted
            ? "The operation was aborted."
            : error instanceof Error
              ? error.message
              : String(error),
        },
      };
      Object.assign(assistant, {
        time: {
          created: (assistant.time as JsonObject).created,
          completed: Date.now(),
        },
        error: failure,
      });
      this.publish("message.updated", { sessionID, info: assistant });
      if (!aborted || this.scenario.abortEmitsSessionError !== false) {
        this.publish("session.error", { sessionID, error: failure });
      }
    }
    session.messages.push({ info: assistant, parts: ctx.blocks });
    session.updated = Date.now();
    this.publish("session.status", { sessionID, status: { type: "idle" } });
    this.publish("session.idle", { sessionID });
  }

  private async runV2(
    session: SessionRecord,
    signal: AbortSignal,
    pending: PendingPrompt,
  ) {
    const sessionID = session.id;
    this.publish("session.execution.started", { sessionID });
    this.deliverV2(session, pending.userMessage);
    this.publish("session.status", { sessionID, status: { type: "busy" } });
    const ctx: RunContext = {
      session,
      signal,
      assistantMessageID: "",
      blocks: [],
      assistant: {},
    };
    this.startStepV2(ctx);
    try {
      await this.runSteps(ctx, pending.script.steps);
      this.endStepV2(ctx, pending.script);
      this.publish("session.execution.succeeded", { sessionID });
    } catch (error) {
      if (signal.aborted) {
        this.publish("session.execution.interrupted", {
          sessionID,
          reason: "user",
        });
      } else {
        const failure = {
          type: error instanceof StepFailure ? error.errorName : "unknown",
          message: error instanceof Error ? error.message : String(error),
        };
        Object.assign(ctx.assistant, { error: failure });
        this.publish("session.step.failed", {
          sessionID,
          assistantMessageID: ctx.assistantMessageID,
          error: failure,
        });
        this.publish("session.execution.failed", { sessionID, error: failure });
      }
    }
    session.messages.push(ctx.assistant);
    session.updated = Date.now();
    this.publish("session.status", { sessionID, status: { type: "idle" } });
    this.publish("session.idle", { sessionID });
  }

  /** Moves a 2.x prompt out of the inbox into the conversation. */
  private deliverV2(session: SessionRecord, userMessage: JsonObject) {
    const inboxID = String(userMessage.id);
    this.inboxItems.delete(inboxID);
    this.publish("session.inbox.delivered", { sessionID: session.id, inboxID });
    const payload = userMessage.payload as JsonObject;
    session.messages.push({
      id: userMessage.id,
      time: userMessage.time,
      type: "user",
      text: payload.text,
      ...(Array.isArray(payload.files) ? { files: payload.files } : {}),
      ...(Array.isArray(payload.agents) ? { agents: payload.agents } : {}),
      ...(Array.isArray(payload.skills) ? { skills: payload.skills } : {}),
      ...(payload.metadata ? { metadata: payload.metadata } : {}),
    });
  }

  /** Opens a new 2.x step: a fresh assistant message. */
  private startStepV2(ctx: RunContext) {
    const session = ctx.session;
    const agent = session.agent ?? "build";
    const model = session.model ?? {
      id: "claude-sonnet-4-5",
      providerID: "anthropic",
    };
    ctx.assistant = {
      id: makeId("msg"),
      time: { created: Date.now() },
      type: "assistant",
      agent,
      model,
      content: [],
    };
    ctx.assistantMessageID = String(ctx.assistant.id);
    ctx.blocks = ctx.assistant.content as JsonObject[];
    this.publish("session.step.started", {
      sessionID: session.id,
      assistantMessageID: ctx.assistantMessageID,
      agent,
      model,
      started: Date.now(),
    });
  }

  private endStepV2(ctx: RunContext, script: OpenCodePromptScript) {
    const tokens = {
      input: script.tokens?.input ?? 120,
      output: script.tokens?.output ?? 30,
      reasoning: script.tokens?.reasoning ?? 0,
      cache: {
        read: script.tokens?.cacheRead ?? 0,
        write: script.tokens?.cacheWrite ?? 0,
      },
    };
    const cost = script.cost ?? 0.0012;
    const finish = script.finish ?? "stop";
    this.publish("session.step.ended", {
      sessionID: ctx.session.id,
      assistantMessageID: ctx.assistantMessageID,
      finish,
      cost,
      tokens,
    });
    Object.assign(ctx.assistant, {
      time: {
        created: (ctx.assistant.time as JsonObject).created,
        completed: Date.now(),
      },
      finish,
      cost,
      tokens,
    });
  }

  /**
   * Delivers pending `delivery:"steer"` prompts at a step boundary: the
   * current step ends, the steering user message joins the conversation and a
   * new step runs the steer's script inside the same execution.
   */
  private async deliverSteersV2(ctx: RunContext) {
    const steers = ctx.session.run?.steers;
    for (let steer = steers?.shift(); steer; steer = steers?.shift()) {
      if (ctx.signal.aborted) throw new Error("aborted");
      this.endStepV2(ctx, {});
      ctx.session.messages.push(ctx.assistant);
      this.deliverV2(ctx.session, steer.userMessage);
      this.startStepV2(ctx);
      await this.runSteps(ctx, steer.script.steps);
    }
  }

  private publishPartV1(ctx: RunContext, part: JsonObject): JsonObject {
    const full = {
      id: typeof part.id === "string" ? part.id : makeId("prt"),
      sessionID: ctx.session.id,
      messageID: ctx.assistantMessageID,
      ...part,
    };
    const index = ctx.blocks.findIndex((block) => block.id === full.id);
    if (index === -1) ctx.blocks.push(full);
    else ctx.blocks[index] = full;
    this.publish("message.part.updated", {
      sessionID: ctx.session.id,
      part: full,
      time: Date.now(),
    });
    return full;
  }

  private async runSteps(
    ctx: RunContext,
    steps: OpenCodeStep[] | undefined,
  ): Promise<void> {
    for (const step of steps ?? []) {
      if (ctx.signal.aborted) throw new Error("aborted");
      await this.runStep(ctx, step);
      if (this.generation === 2) await this.deliverSteersV2(ctx);
    }
  }

  private async streamText(
    ctx: RunContext,
    kind: "text" | "reasoning",
    text: string | string[],
  ) {
    const deltas = Array.isArray(text) ? text : [text];
    const sessionID = ctx.session.id;
    if (this.generation === 1) {
      const start = Date.now();
      const part = this.publishPartV1(ctx, {
        type: kind,
        text: "",
        time: { start },
      });
      let full = "";
      for (const delta of deltas) {
        if (ctx.signal.aborted) throw new Error("aborted");
        full += delta;
        this.publish("message.part.delta", {
          sessionID,
          messageID: ctx.assistantMessageID,
          partID: part.id,
          field: "text",
          delta,
        });
      }
      this.publishPartV1(ctx, {
        ...part,
        text: full,
        time: { start, end: Date.now() },
      });
      return;
    }
    const ordinal = ctx.blocks.length;
    const block: JsonObject = { type: kind, text: "" };
    ctx.blocks.push(block);
    const base = {
      sessionID,
      assistantMessageID: ctx.assistantMessageID,
      ordinal,
    };
    this.publish(`session.${kind}.started`, base);
    for (const delta of deltas) {
      if (ctx.signal.aborted) throw new Error("aborted");
      block.text = `${String(block.text)}${delta}`;
      this.publish(`session.${kind}.delta`, { ...base, delta });
    }
    this.publish(`session.${kind}.ended`, { ...base, text: block.text });
  }

  private async askPermission(
    ctx: RunContext,
    ask: {
      permission: string;
      patterns?: string[];
      metadata?: JsonObject;
      message?: string;
    },
    tool?: { callID: string },
  ): Promise<string> {
    const id = makeId("per");
    const sessionID = ctx.session.id;
    const patterns = ask.patterns ?? ["*"];
    const request =
      this.generation === 1
        ? {
            id,
            sessionID,
            permission: ask.permission,
            patterns,
            metadata: ask.metadata ?? {},
            always: patterns,
            ...(tool
              ? {
                  tool: {
                    messageID: ctx.assistantMessageID,
                    callID: tool.callID,
                  },
                }
              : {}),
          }
        : {
            id,
            sessionID,
            action: ask.permission,
            resources: patterns,
            save: patterns,
            ...(ask.metadata ? { metadata: ask.metadata } : {}),
            ...(tool
              ? {
                  source: {
                    type: "tool",
                    messageID: ctx.assistantMessageID,
                    id: tool.callID,
                  },
                }
              : {}),
            ...(ask.message ? { message: ask.message } : {}),
          };
    const reply = this.awaitReply(
      this.permissions,
      id,
      { sessionID, request },
      ctx.signal,
    );
    this.publish("permission.asked", request);
    const { outcome } = await reply;
    if (outcome !== "aborted") {
      this.publish("permission.replied", {
        sessionID,
        requestID: id,
        reply: outcome,
      });
    }
    return outcome;
  }

  private async runStep(ctx: RunContext, step: OpenCodeStep): Promise<void> {
    const sessionID = ctx.session.id;
    switch (step.type) {
      case "text":
      case "reasoning":
        await this.streamText(ctx, step.type, step.text);
        return;
      case "tool": {
        const callID = step.callID ?? makeId("call");
        const started = Date.now();
        let part: JsonObject | undefined;
        if (this.generation === 1) {
          part = this.publishPartV1(ctx, {
            type: "tool",
            callID,
            tool: step.tool,
            state: { status: "pending", input: {}, raw: "" },
          });
          part = this.publishPartV1(ctx, {
            ...part,
            state: {
              status: "running",
              input: step.input,
              time: { start: started },
            },
          });
        } else {
          const base = {
            sessionID,
            assistantMessageID: ctx.assistantMessageID,
            id: callID,
          };
          const raw = JSON.stringify(step.input);
          this.publish("session.tool.input.started", {
            ...base,
            name: step.tool,
          });
          this.publish("session.tool.input.delta", { ...base, delta: raw });
          this.publish("session.tool.input.ended", { ...base, text: raw });
          this.publish("session.tool.called", {
            ...base,
            input: step.input,
            executed: true,
          });
        }
        let error = step.error;
        if (step.permission) {
          const reply = await this.askPermission(ctx, step.permission, {
            callID,
          });
          if (reply === "aborted") throw new Error("aborted");
          if (reply === "reject")
            error = "The user rejected permission to use this tool";
        }
        if (step.durationMs) await sleep(step.durationMs, ctx.signal);
        if (this.generation === 1 && part) {
          const time = { start: started, end: Date.now() };
          this.publishPartV1(ctx, {
            ...part,
            state: error
              ? { status: "error", input: step.input, error, time }
              : {
                  status: "completed",
                  input: step.input,
                  output: step.output ?? "",
                  title: step.title ?? step.tool,
                  metadata: step.metadata ?? {},
                  time,
                },
          });
        } else {
          const base = {
            sessionID,
            assistantMessageID: ctx.assistantMessageID,
            id: callID,
          };
          if (step.metadata)
            this.publish("session.tool.progress", {
              ...base,
              metadata: step.metadata,
            });
          ctx.blocks.push({
            type: "tool",
            id: callID,
            name: step.tool,
            state: error
              ? {
                  status: "error",
                  input: step.input,
                  error: { type: "tool", message: error },
                }
              : {
                  status: "completed",
                  input: step.input,
                  content: [{ type: "text", text: step.output ?? "" }],
                },
            time: { created: started, completed: Date.now() },
          });
          if (error) {
            this.publish("session.tool.failed", {
              ...base,
              error: { type: "tool", message: error },
              executed: true,
            });
          } else {
            this.publish("session.tool.success", {
              ...base,
              content: [{ type: "text", text: step.output ?? "" }],
              ...(step.metadata ? { metadata: step.metadata } : {}),
              executed: true,
            });
          }
        }
        return;
      }
      case "permission": {
        const reply = await this.askPermission(ctx, step);
        if (reply === "aborted") throw new Error("aborted");
        await this.runSteps(ctx, pickBranch(step.branches, reply));
        return;
      }
      case "question": {
        if (this.generation !== 1)
          throw new StepFailure("question steps are 1.x only", "UnknownError");
        const id = makeId("que");
        const request: JsonObject = {
          id,
          sessionID,
          questions: step.questions,
        };
        const reply = this.awaitReply(
          this.questions,
          id,
          { sessionID, request },
          ctx.signal,
        );
        this.publish("question.asked", request);
        const { outcome, payload } = await reply;
        if (outcome === "aborted") throw new Error("aborted");
        if (outcome === "replied") {
          this.publish("question.replied", {
            sessionID,
            requestID: id,
            answers: payload ?? [],
          });
        } else {
          this.publish("question.rejected", { sessionID, requestID: id });
        }
        await this.runSteps(ctx, pickBranch(step.branches, outcome));
        return;
      }
      case "form": {
        if (this.generation !== 2)
          throw new StepFailure("form steps are 2.x only", "UnknownError");
        const id = makeId("frm");
        const form: JsonObject = {
          id,
          sessionID,
          title: step.title,
          ...(step.metadata ? { metadata: step.metadata } : {}),
          fields: step.fields,
        };
        const reply = this.awaitReply(
          this.forms,
          id,
          { sessionID, form },
          ctx.signal,
        );
        this.publish("form.created", { form });
        const { outcome, payload } = await reply;
        if (outcome === "aborted") throw new Error("aborted");
        if (outcome === "replied") {
          this.publish("form.replied", {
            id,
            sessionID,
            answer: payload ?? {},
          });
        } else {
          this.publish("form.cancelled", { id, sessionID });
        }
        await this.runSteps(ctx, pickBranch(step.branches, outcome));
        return;
      }
      case "event":
        this.emitRaw(step.event);
        return;
      case "delay":
        await sleep(step.ms, ctx.signal);
        return;
      case "error":
        throw new StepFailure(
          step.message,
          step.name ?? (this.generation === 1 ? "UnknownError" : "provider"),
        );
      case "hang":
        await waitForAbort(ctx.signal);
        return;
    }
  }
}

function defaultV1Providers(): JsonObject {
  const model = (id: string, name: string, reasoning: boolean) => ({
    id,
    providerID: "anthropic",
    api: { id, url: "https://api.anthropic.com/v1", npm: "@ai-sdk/anthropic" },
    name,
    family: "claude",
    capabilities: {
      temperature: true,
      reasoning,
      attachment: true,
      toolcall: true,
      input: { text: true, audio: false, image: true, video: false, pdf: true },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: false,
    },
    cost: { input: 3, output: 15, cache: { read: 0.3, write: 3.75 } },
    limit: { context: 200000, output: 64000 },
    status: "active",
    options: {},
    headers: {},
    release_date: "2025-09-29",
    variants: reasoning
      ? { high: { thinking: { type: "enabled", budgetTokens: 16000 } } }
      : {},
  });
  return {
    all: [
      {
        id: "anthropic",
        name: "Anthropic",
        source: "env",
        env: ["ANTHROPIC_API_KEY"],
        options: {},
        models: {
          "claude-sonnet-4-5": model(
            "claude-sonnet-4-5",
            "Claude Sonnet 4.5",
            true,
          ),
          "claude-haiku-4-5": model(
            "claude-haiku-4-5",
            "Claude Haiku 4.5",
            false,
          ),
        },
      },
    ],
    default: { anthropic: "claude-sonnet-4-5" },
    connected: ["anthropic"],
  };
}

function defaultV1Agents(): JsonObject[] {
  const agent = (name: string, mode: string, description: string) => ({
    name,
    description,
    mode,
    native: true,
    permission: [],
    options: {},
  });
  return [
    agent("build", "primary", "Default agent with every tool enabled"),
    agent("plan", "primary", "Read-only planning agent"),
    agent("general", "subagent", "General-purpose subagent"),
  ];
}

function defaultV2Models(): JsonObject[] {
  return [
    {
      id: "anthropic/claude-sonnet-4-5",
      modelID: "claude-sonnet-4-5",
      providerID: "anthropic",
      name: "Claude Sonnet 4.5",
      capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
      variants: [{ id: "high" }],
      time: { released: Date.UTC(2025, 8, 29) },
      cost: [{ input: 3, output: 15, cache: { read: 0.3, write: 3.75 } }],
      status: "active",
      enabled: true,
      limit: { context: 200000, output: 64000 },
    },
  ];
}

function defaultV2Providers(): JsonObject[] {
  return [
    {
      id: "anthropic",
      name: "Anthropic",
      activation: "auto",
      package: "@ai-sdk/anthropic",
    },
  ];
}

function defaultV2Agents(): JsonObject[] {
  const agent = (id: string, mode: string) => ({
    id,
    name: id,
    request: { settings: {}, headers: {}, body: {} },
    mode,
    hidden: false,
    permissions: [],
  });
  return [
    agent("build", "primary"),
    agent("plan", "primary"),
    agent("general", "subagent"),
  ];
}

/** Starts a fake OpenCode server; `stop()` closes it and every SSE stream. */
export async function start(
  options: StartOpenCodeFakeOptions,
): Promise<OpenCodeFake> {
  const scenario = options.scenario ?? {};
  const password =
    options.password === undefined || options.password === null
      ? options.generation === 2
        ? randomBytes(24).toString("base64url")
        : null
      : options.password;
  const fake = new FakeOpenCodeServer(
    options.generation,
    scenario,
    password,
    options.logPath,
  );
  const hostname = options.hostname ?? "127.0.0.1";
  let origin = "";
  const server = bunServe({
    hostname,
    port: options.port ?? 0,
    // SSE streams stay open between heartbeats.
    idleTimeout: 0,
    fetch: (request) => fake.handle(request, origin),
  });
  origin = `http://${hostname}:${server.port}`;
  return {
    generation: options.generation,
    url: origin,
    password,
    version: fake.version,
    requests: fake.requests,
    emit: (event) => fake.emitRaw(event),
    stop: async () => {
      await server.stop(true);
    },
  };
}

// ---------------------------------------------------------------------------
// CLI: a stand-in for `opencode serve` / `opencode --version`.
// ---------------------------------------------------------------------------

async function cli(argv: string[]) {
  const generation: OpenCodeGeneration =
    process.env[OPENCODE_FAKE_GENERATION_ENV] === "2" ? 2 : 1;
  const scenario = loadScenarioFromEnv<OpenCodeFakeScenario>(
    OPENCODE_FAKE_SCENARIO_ENV,
    OPENCODE_FAKE_SCENARIO_FILE_ENV,
  );
  const version = scenario.version ?? (generation === 1 ? "1.18.32" : "2.0.18");
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(
      generation === 1 ? `${version}\n` : `opencode v${version}\n`,
    );
    return;
  }
  if (argv[0] !== "serve") {
    process.stderr.write(
      "usage: fake-server.ts serve [--hostname=HOST] [--port=PORT] | --version\n",
    );
    process.exit(2);
  }
  const flag = (name: string) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const passwordEnv =
    generation === 1
      ? process.env.OPENCODE_SERVER_PASSWORD
      : process.env.OPENCODE_PASSWORD;
  const fake = await start({
    generation,
    scenario,
    hostname: flag("hostname") || "127.0.0.1",
    port: Number(flag("port") ?? "0") || 0,
    password: passwordEnv || null,
    logPath: process.env[OPENCODE_FAKE_LOG_ENV],
  });
  if (generation === 1) {
    process.stdout.write(`opencode server listening on ${fake.url}\n`);
  } else {
    process.stdout.write(`server listening on ${fake.url}\n`);
    if (!passwordEnv)
      process.stdout.write(`server password ${fake.password}\n`);
  }
  const shutdown = () => {
    void fake.stop().finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if ((import.meta as { main?: boolean }).main) {
  void cli(process.argv.slice(2));
}
