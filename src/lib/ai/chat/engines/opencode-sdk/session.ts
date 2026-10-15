import "server-only";

import {
  createOpencodeClient,
  type OpencodeClient,
  type PermissionRuleset,
} from "@opencode-ai/sdk/v2";

import { getInstanceRuntimeKey } from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import {
  parseQuestionResponse,
  type ExternalQuestion,
} from "@/lib/ai/chat/runtime/external/user-input";
import type { PermissionMode } from "@/server/db/enums";

import type { OpenCodeRunEvent } from "./events";
import type { OpenCodeServerExit } from "./server";
import { openOpenCodeEventStream } from "./sse";
import {
  acquireOpenCodeServer,
  type PooledOpenCodeServer,
} from "./server-pool";
import { normalizeV1Event } from "./v1/events";
import {
  createOpenCode2Client,
  openOpenCode2EventStream,
  type OpenCode2Client,
} from "./v2/client";
import { normalizeV2Event, toFormAnswer } from "./v2/events";
import type { OpenCodeGeneration } from "./version";

// One thread's OpenCode session for one turn, on the instance's pooled
// server, behind one interface for both generations (design
// acp-and-agents §5). The runtime prompts, answers and reads events
// through it and never touches a generation's client.
//
// Resume: a persisted session id of the same generation is looked up
// (1.x session.get, 2.x GET /api/session/{id}); when it exists the turn
// prompts it directly and the transcript is not replayed. Otherwise a new
// session is created. Either way the session gets the rules of the
// thread's current permission mode.

export type OpenCodeModelRef = {
  modelID: string;
  providerID: string;
  variant?: string | null;
};

export type OpenCodePromptFile = {
  filename?: string;
  mediaType: string;
  /** A data: URL (images) or a file:// URL. */
  url: string;
};

export type OpenCodePromptInput = {
  /** The turn's agent (1.x per prompt; 2.x switched before it). */
  agent: string | null;
  files: OpenCodePromptFile[];
  model: OpenCodeModelRef;
  text: string;
};

export type OpenCodeCommandInput = Omit<OpenCodePromptInput, "text"> & {
  arguments: string;
  name: string;
};

export type OpenCodePermissionReply = "always" | "once" | "reject";

export interface OpenCodeTurnSession {
  /** Asks the session to stop (1.x abort, 2.x interrupt). */
  abort(): Promise<void>;
  /** `sessionId`: the asking (sub)session, default this one. */
  answerQuestion(
    requestId: string,
    response: string,
    sessionId?: string,
  ): Promise<void>;
  /** Runs one of the session's commands (`/name args`). */
  command(input: OpenCodeCommandInput): Promise<void>;
  directory: string;
  /** Opens the event stream; resolves once the server accepted it. */
  events(signal: AbortSignal): Promise<AsyncIterable<OpenCodeRunEvent>>;
  /** Restores what a turn changed on the session (2.x plan agent). */
  finishTurn(): Promise<void>;
  generation: OpenCodeGeneration;
  /** Names of the session's commands (for `/name` prompts). */
  listCommands(): Promise<string[]>;
  prompt(input: OpenCodePromptInput): Promise<void>;
  rejectQuestion(requestId: string, sessionId?: string): Promise<void>;
  /** Ends this turn's use of the server (idempotent). */
  release(): void;
  replyPermission(
    requestId: string,
    reply: OpenCodePermissionReply,
    sessionId?: string,
  ): Promise<void>;
  /** True when the persisted session was continued. */
  resumed: boolean;
  serverExited: Promise<OpenCodeServerExit>;
  serverVersion: string;
  sessionId: string;
}

/** 1.x ruleset (last matching rule wins). */
export function buildOpenCodePermissionRules(
  mode: PermissionMode,
): PermissionRuleset {
  if (mode === "full") {
    return [{ action: "allow", pattern: "*", permission: "*" }];
  }
  return [
    { action: "ask", pattern: "*", permission: "*" },
    { action: "ask", pattern: "*", permission: "bash" },
    {
      action: mode === "accept_edits" ? "allow" : "ask",
      pattern: "*",
      permission: "edit",
    },
    { action: "ask", pattern: "*", permission: "webfetch" },
    { action: "ask", pattern: "*", permission: "websearch" },
    { action: "allow", pattern: "*", permission: "question" },
  ];
}

type OpenCode2Rule = {
  action: string;
  effect: "allow" | "ask" | "deny";
  resource: string;
};

/** 2.x session rules (t3code OpenCode2AdapterV2.ts sessionRules, MIT). */
export function buildOpenCode2PermissionRules(
  mode: PermissionMode,
): OpenCode2Rule[] {
  const rule = (action: string, effect: OpenCode2Rule["effect"]) => ({
    action,
    effect,
    resource: "*",
  });
  if (mode === "full") return [rule("*", "allow")];
  return [
    rule("shell", "ask"),
    rule("edit", mode === "accept_edits" ? "allow" : "ask"),
    rule("external_directory", "ask"),
  ];
}

/**
 * Sent with a declined 2.x permission: a reject without a message is
 * OpenCode's "stop", which ends the whole execution (t3code).
 */
const OPENCODE2_DECLINED_MESSAGE = "The user declined this request.";

function isNotFound(error: unknown) {
  const record = error as {
    _tag?: unknown;
    cause?: { status?: unknown };
    name?: unknown;
    status?: unknown;
  } | null;
  return (
    record?.name === "NotFoundError" ||
    record?.name === "SessionNotFoundError" ||
    record?._tag === "SessionNotFoundError" ||
    record?.status === 404 ||
    record?.cause?.status === 404 ||
    /\b404\b|not found/i.test(error instanceof Error ? error.message : "")
  );
}

/** Per-question answers (labels plus free text) for a 1.x question.reply. */
export function toOpenCodeQuestionAnswers(
  questions: readonly ExternalQuestion[],
  response: string,
): string[][] {
  const parsed = parseQuestionResponse(questions, response);
  return questions.map((question) => {
    const answer = parsed.answers.find(
      (item) => item.questionId === question.id,
    );
    if (!answer) return [];
    const labels = answer.selectedOptionIds.flatMap((id) => {
      const option = question.options.find((candidate) => candidate.id === id);
      return option ? [option.label] : [];
    });
    return answer.text ? [...labels, answer.text] : labels;
  });
}

function modelString(model: OpenCodeModelRef) {
  return `${model.providerID}/${model.modelID}`;
}

type SessionCommon = {
  directory: string;
  release(): void;
  server: PooledOpenCodeServer;
};

async function openV1Session(
  common: SessionCommon,
  input: OpenOpenCodeSessionInput,
): Promise<OpenCodeTurnSession> {
  const client: OpencodeClient = createOpencodeClient({
    baseUrl: common.server.url,
    directory: common.directory,
    headers: { Authorization: common.server.authorization },
    throwOnError: true,
  });
  const rules = buildOpenCodePermissionRules(input.permissionMode);
  let sessionId: string | null = null;
  let resumed = false;

  if (input.resumeSessionId) {
    try {
      const existing = await client.session.get({
        sessionID: input.resumeSessionId,
      });
      if (existing.data?.id) {
        sessionId = existing.data.id;
        resumed = true;
        // The thread's mode may have changed since the session was made.
        await client.session
          .update({ permission: rules, sessionID: sessionId })
          .catch(() => undefined);
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
  if (!sessionId) {
    const created = await client.session.create({
      permission: rules,
      title: input.title,
    });
    sessionId = created.data?.id ?? null;
    if (!sessionId) {
      throw new Error("OpenCode session.create returned no session id.");
    }
  }

  const questions = new Map<string, ExternalQuestion[]>();
  const id = sessionId;
  const toParts = (prompt: Pick<OpenCodePromptInput, "files">) =>
    prompt.files.map((file) => ({
      ...(file.filename ? { filename: file.filename } : {}),
      mime: file.mediaType,
      type: "file" as const,
      url: file.url,
    }));

  return {
    async abort() {
      await client.session.abort({ sessionID: id });
    },
    async answerQuestion(requestId, response) {
      await client.question.reply({
        answers: toOpenCodeQuestionAnswers(
          questions.get(requestId) ?? [],
          response,
        ),
        requestID: requestId,
      });
    },
    async command(command) {
      await client.session.command({
        ...(command.agent ? { agent: command.agent } : {}),
        arguments: command.arguments,
        command: command.name,
        model: modelString(command.model),
        ...(command.files.length > 0 ? { parts: toParts(command) } : {}),
        sessionID: id,
        ...(command.model.variant ? { variant: command.model.variant } : {}),
      });
    },
    directory: common.directory,
    async events(signal) {
      // `/event` of this directory (the SDK's GET rewrite: `?directory=`).
      const url = new URL("/event", common.server.url);
      url.searchParams.set("directory", encodeURIComponent(common.directory));
      const stream = await openOpenCodeEventStream({
        authorization: common.server.authorization,
        headers: {
          "x-opencode-directory": encodeURIComponent(common.directory),
        },
        signal,
        // 1.x heartbeats (`server.heartbeat`) are not in every release.
        silenceMs: null,
        url,
      });
      return {
        async *[Symbol.asyncIterator]() {
          for await (const raw of stream) {
            const event = normalizeV1Event(raw);
            if (!event) continue;
            if (event.type === "question.asked") {
              questions.set(event.requestId, event.questions);
            }
            yield event;
          }
        },
      };
    },
    async finishTurn() {},
    generation: "v1",
    async listCommands() {
      const result = await client.command.list();
      return (result.data ?? []).map((command) => command.name);
    },
    async prompt(prompt) {
      await client.session.promptAsync({
        ...(prompt.agent ? { agent: prompt.agent } : {}),
        model: {
          modelID: prompt.model.modelID,
          providerID: prompt.model.providerID,
        },
        parts: [{ text: prompt.text, type: "text" }, ...toParts(prompt)],
        sessionID: id,
        ...(prompt.model.variant ? { variant: prompt.model.variant } : {}),
      });
    },
    async rejectQuestion(requestId) {
      // POST /question/{requestID}/reject shipped with question.asked
      // (1.1.7), so any server that asks also takes the rejection.
      await client.question.reject({ requestID: requestId });
    },
    release: common.release,
    async replyPermission(requestId, reply) {
      await client.permission.reply({ reply, requestID: requestId });
    },
    resumed,
    serverExited: common.server.exited,
    serverVersion: common.server.version,
    sessionId: id,
  };
}

async function openV2Session(
  common: SessionCommon,
  input: OpenOpenCodeSessionInput,
): Promise<OpenCodeTurnSession> {
  const client: OpenCode2Client = createOpenCode2Client({
    authorization: common.server.authorization,
    baseUrl: common.server.url,
  });
  const location = { directory: common.directory };
  const permissions = buildOpenCode2PermissionRules(input.permissionMode);
  let info: {
    agent?: string;
    id: string;
    model?: { id: string; providerID: string; variant?: string };
  } | null = null;
  let resumed = false;

  if (input.resumeSessionId) {
    try {
      info = await client.session.get({ sessionID: input.resumeSessionId });
      resumed = true;
      // The thread's mode may have changed since the session was made.
      await client.session
        .update({ permissions, sessionID: info.id })
        .catch(() => undefined);
      // OpenCode keeps no request across its own restart, but a server
      // that outlived Sentinel's run may still wait on one nobody shows.
      const [pending, forms] = await Promise.all([
        client.permission.list({ sessionID: info.id }).catch(() => []),
        client.session.form.list({ sessionID: info.id }).catch(() => []),
      ]);
      await Promise.all([
        ...pending.map((request) =>
          client.permission
            .reply({
              decision: "reject",
              message: OPENCODE2_DECLINED_MESSAGE,
              requestID: request.id,
              sessionID: info!.id,
            })
            .catch(() => undefined),
        ),
        ...forms.map((form) =>
          client.session.form
            .cancel({ formID: form.id, sessionID: info!.id })
            .catch(() => undefined),
        ),
      ]);
    } catch (error) {
      if (!isNotFound(error)) throw error;
      info = null;
      resumed = false;
    }
  }
  if (!info) {
    info = await client.session.create({
      location,
      model: {
        id: input.model.modelID,
        providerID: input.model.providerID,
        ...(input.model.variant ? { variant: input.model.variant } : {}),
      },
      permissions,
      ...(input.title ? { title: input.title } : {}),
    });
  }

  const id = info.id;
  let currentAgent = info.agent ?? null;
  let currentModel = info.model ?? null;
  let restoreAgent: string | null = null;
  const forms = new Map<string, unknown>();

  const prepare = async (prompt: Omit<OpenCodePromptInput, "text">) => {
    const model = {
      id: prompt.model.modelID,
      providerID: prompt.model.providerID,
      ...(prompt.model.variant ? { variant: prompt.model.variant } : {}),
    };
    if (
      currentModel?.id !== model.id ||
      currentModel.providerID !== model.providerID ||
      (currentModel.variant ?? null) !== (model.variant ?? null)
    ) {
      await client.session.switchModel({ model, sessionID: id });
      currentModel = model;
    }
    if (prompt.agent && prompt.agent !== currentAgent) {
      // Plan mode is turn-scoped: the agent the session had comes back
      // when the turn ends.
      if (prompt.agent === "plan") restoreAgent = currentAgent ?? "build";
      await client.session.switchAgent({ agent: prompt.agent, sessionID: id });
      currentAgent = prompt.agent;
    }
  };
  const toFiles = (prompt: Pick<OpenCodePromptInput, "files">) =>
    prompt.files.map((file) => ({
      ...(file.filename ? { name: file.filename } : {}),
      uri: file.url,
    }));

  return {
    async abort() {
      await client.session.interrupt({ sessionID: id });
    },
    async answerQuestion(requestId, response, sessionId) {
      await client.session.form.reply({
        answer: toFormAnswer(forms.get(requestId), response),
        formID: requestId,
        sessionID: sessionId ?? id,
      });
    },
    async command(command) {
      await prepare(command);
      await client.session.command({
        ...(command.files.length > 0 ? { files: toFiles(command) } : {}),
        name: command.name,
        sessionID: id,
        text: command.arguments,
      });
    },
    directory: common.directory,
    async events(signal) {
      const stream = await openOpenCode2EventStream({
        authorization: common.server.authorization,
        baseUrl: common.server.url,
        signal,
        silenceMs: input.silenceMs,
      });
      return {
        async *[Symbol.asyncIterator]() {
          for await (const frame of stream) {
            if (frame.type === "form.created") {
              const form = (
                frame.data as { form?: { fields?: unknown; id?: unknown } }
              )?.form;
              if (typeof form?.id === "string") forms.set(form.id, form.fields);
            }
            const event = normalizeV2Event(frame);
            if (event) yield event;
          }
        },
      };
    },
    async finishTurn() {
      if (!restoreAgent) return;
      const agent = restoreAgent;
      restoreAgent = null;
      await client.session.switchAgent({ agent, sessionID: id });
      currentAgent = agent;
    },
    generation: "v2",
    async listCommands() {
      const result = await client.command.list({ location });
      return result.data.map((command) => command.name);
    },
    async prompt(prompt) {
      await prepare(prompt);
      await client.session.prompt({
        ...(prompt.files.length > 0 ? { files: toFiles(prompt) } : {}),
        sessionID: id,
        text: prompt.text,
      });
    },
    async rejectQuestion(requestId, sessionId) {
      await client.session.form.cancel({
        formID: requestId,
        sessionID: sessionId ?? id,
      });
    },
    release: common.release,
    async replyPermission(requestId, reply, sessionId) {
      await client.permission.reply({
        decision: reply,
        ...(reply === "reject" ? { message: OPENCODE2_DECLINED_MESSAGE } : {}),
        requestID: requestId,
        sessionID: sessionId ?? id,
      });
    },
    resumed,
    serverExited: common.server.exited,
    serverVersion: common.server.version,
    sessionId: id,
  };
}

export type OpenOpenCodeSessionInput = {
  binaryPath: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** `--version` output of the binary. */
  cliVersion: string | null;
  /** Its id and configuration (pool slot and fingerprint). */
  instance: Parameters<typeof getInstanceRuntimeKey>[0];
  /** The model a new 2.x session starts on. */
  model: OpenCodeModelRef;
  permissionMode: PermissionMode;
  /** A persisted session of this server's generation to continue. */
  resumeSessionId: string | null;
  /** Only resume a session created on this generation. */
  resumeGeneration: OpenCodeGeneration | null;
  signal?: AbortSignal;
  /** 2.x event-stream silence limit (tests). */
  silenceMs?: number;
  title: string;
};

/**
 * The thread's session on the instance's server: the persisted one when it
 * still exists on this generation, else a new one. Release the result when
 * the turn ends.
 */
export async function openOpenCodeSession(
  input: OpenOpenCodeSessionInput,
): Promise<OpenCodeTurnSession> {
  const lease = await acquireOpenCodeServer(
    {
      binaryPath: input.binaryPath,
      env: input.env,
      instanceId: input.instance?.id ?? "opencode",
      runtimeKey: getInstanceRuntimeKey(input.instance),
      version: input.cliVersion,
    },
    { signal: input.signal },
  );
  let released = false;
  const common: SessionCommon = {
    directory: input.cwd,
    release() {
      if (released) return;
      released = true;
      lease.release();
    },
    server: lease.server,
  };
  const generation = lease.server.generation;
  const resume =
    input.resumeSessionId && input.resumeGeneration === generation
      ? input
      : { ...input, resumeSessionId: null };
  try {
    return generation === "v2"
      ? await openV2Session(common, resume)
      : await openV1Session(common, resume);
  } catch (error) {
    common.release();
    throw error;
  }
}
