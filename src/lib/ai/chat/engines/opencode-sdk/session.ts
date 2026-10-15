import "server-only";

import { pathToFileURL } from "node:url";

import {
  createOpencodeClient,
  type OpencodeClient,
  type PermissionRuleset,
} from "@opencode-ai/sdk/v2";

import type { ForwardedMcpServer } from "@/lib/ai/chat/engines/platform/mcp-forwarding";
import { getInstanceRuntimeKey } from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import {
  parseQuestionResponse,
  type ExternalQuestion,
} from "@/lib/ai/chat/runtime/external/user-input";
import { getErrorMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { PermissionMode } from "@/server/db/enums";

import type { OpenCodeRunEvent } from "./events";
import {
  buildOpenCodeV1McpConfig,
  buildOpenCodeV2McpServers,
  mergeOpenCodeConfigContent,
} from "./mcp";
import type { OpenCodeServerExit } from "./server";
import { openOpenCodeEventStream } from "./sse";
import {
  acquireOpenCodeServer,
  disposeOpenCodeServer,
  getOpenCodeServerPool,
  type PooledOpenCodeServer,
} from "./server-pool";
import { normalizeV1Event } from "./v1/events";
import {
  createOpenCode2Client,
  openOpenCode2EventStream,
  type OpenCode2Client,
} from "./v2/client";
import { normalizeV2Event, toFormAnswer } from "./v2/events";
import { classifyOpenCodeVersion, type OpenCodeGeneration } from "./version";

// One thread's OpenCode session for one turn, on the instance's pooled
// server, behind one interface for both generations (design
// acp-and-agents §5). The runtime prompts, answers and reads events
// through it and never touches a generation's client.
//
// Resume: a persisted session id of the same generation is looked up
// (1.x session.get, 2.x GET /api/session/{id}); when it exists the turn
// prompts it directly and the transcript is not replayed. Otherwise a new
// session is created. Either way the session gets this turn's rules (the
// thread's permission mode, plus an edit deny in plan mode): a resumed
// session whose rules cannot be updated is not continued, since it could
// keep a laxer mode's rules.

const log = createLogger("OpenCodeSession");

export type OpenCodeModelRef = {
  modelID: string;
  providerID: string;
  variant?: string | null;
};

export type OpenCodePromptFile = {
  filename?: string;
  mediaType: string;
  /** The stored file, when there is one (2.x sends it as a file:// URI). */
  path?: string | null;
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
  /** Ends the instance's server (an execution that cannot be stopped). */
  discardServer(): Promise<void>;
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

/**
 * 1.x ruleset (last matching rule wins). Session rules come after the
 * agent's, so plan mode denies edits here too: otherwise full access or
 * accept_edits would let the plan agent edit.
 */
export function buildOpenCodePermissionRules(
  mode: PermissionMode,
  options: { plan?: boolean } = {},
): PermissionRuleset {
  const plan: PermissionRuleset = options.plan
    ? [{ action: "deny", pattern: "*", permission: "edit" }]
    : [];
  if (mode === "full") {
    return [{ action: "allow", pattern: "*", permission: "*" }, ...plan];
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
    ...plan,
  ];
}

type OpenCode2Rule = {
  action: string;
  effect: "allow" | "ask" | "deny";
  resource: string;
};

/**
 * 2.x session rules (t3code provider-opencode v2/adapter.ts sessionRules,
 * MIT): the mode's, then an edit deny in plan mode (session rules override
 * the agent's; shell and read are never denied).
 */
export function buildOpenCode2PermissionRules(
  mode: PermissionMode,
  options: { plan?: boolean } = {},
): OpenCode2Rule[] {
  const rule = (action: string, effect: OpenCode2Rule["effect"]) => ({
    action,
    effect,
    resource: "*",
  });
  return [
    ...(mode === "full"
      ? [rule("*", "allow")]
      : [
          rule("shell", "ask"),
          rule("edit", mode === "accept_edits" ? "allow" : "ask"),
          rule("external_directory", "ask"),
        ]),
    ...(options.plan ? [rule("edit", "deny")] : []),
  ];
}

/**
 * Sent with a declined 2.x permission: a reject without a message is
 * OpenCode's "stop", which ends the whole execution (t3code).
 */
const OPENCODE2_DECLINED_MESSAGE = "The user declined this request.";

/** A persisted session that exists but is not continued. */
class SessionNotContinued extends Error {}

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
  discardServer(): Promise<void>;
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
  const rules = buildOpenCodePermissionRules(input.permissionMode, {
    plan: input.planMode,
  });
  let sessionId: string | null = null;
  let resumed = false;

  if (input.resumeSessionId) {
    try {
      const existing = await client.session.get({
        sessionID: input.resumeSessionId,
      });
      // The thread's mode may have changed since the session was made; a
      // session that keeps its old rules is not continued.
      if (
        existing.data?.id &&
        (await client.session
          .update({ permission: rules, sessionID: existing.data.id })
          .then(
            () => true,
            () => false,
          ))
      ) {
        sessionId = existing.data.id;
        resumed = true;
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
    discardServer: common.discardServer,
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
  const permissions = buildOpenCode2PermissionRules(input.permissionMode, {
    plan: input.planMode,
  });
  // MCP tool calls ask through the session's rules like any other tool.
  await syncV2McpServers(client, common, input.mcp);
  let info: {
    agent?: string;
    id: string;
    model?: { id: string; providerID: string; variant?: string };
  } | null = null;
  let resumed = false;

  if (input.resumeSessionId) {
    try {
      const existing = await client.session.get({
        sessionID: input.resumeSessionId,
      });
      // The thread's mode may have changed since the session was made; a
      // session that keeps its old rules is not continued.
      const updated = await client.session
        .update({ permissions, sessionID: existing.id })
        .then(
          () => true,
          () => false,
        );
      if (!updated) throw new SessionNotContinued();
      info = existing;
      resumed = true;
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
      if (!(error instanceof SessionNotContinued) && !isNotFound(error)) {
        throw error;
      }
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
    // Plan mode is turn-scoped: a session still on `plan` (a plan turn
    // whose restore never ran: Sentinel quit, or the switch back failed)
    // goes back to `build` on a turn that picks no agent.
    const agent =
      prompt.agent ?? (currentAgent === "plan" ? "build" : currentAgent);
    if (agent && agent !== currentAgent) {
      // The agent the session had comes back when the turn ends.
      if (agent === "plan") {
        restoreAgent =
          currentAgent && currentAgent !== "plan" ? currentAgent : "build";
      }
      await client.session.switchAgent({ agent, sessionID: id });
      currentAgent = agent;
    }
  };
  // Stored files go by path: whether 2.x resolves data: URIs is unverified.
  const toFiles = (prompt: Pick<OpenCodePromptInput, "files">) =>
    prompt.files.map((file) => ({
      ...(file.filename ? { name: file.filename } : {}),
      uri: file.path ? pathToFileURL(file.path).toString() : file.url,
    }));

  return {
    async abort() {
      await client.session.interrupt({ sessionID: id });
    },
    discardServer: common.discardServer,
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
  /** The user's MCP servers and their forwardedMcpServersKey. */
  mcp?: { key: string; servers: readonly ForwardedMcpServer[] } | null;
  /** The model a new 2.x session starts on. */
  model: OpenCodeModelRef;
  permissionMode: PermissionMode;
  /** A plan-mode turn: the session's rules also deny edits. */
  planMode?: boolean;
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
 * 1.x: the server environment with the forwarded MCP servers merged into
 * its OPENCODE_CONFIG_CONTENT, and their key. Null without servers, for a
 * binary whose generation is unknown (a 2.x server would reject the 1.x
 * shape), or when the content is not a JSON object.
 */
function buildV1McpLaunch(input: OpenOpenCodeSessionInput) {
  const mcp = input.mcp;
  if (
    !mcp?.servers.length ||
    classifyOpenCodeVersion(input.cliVersion)?.generation !== "v1"
  ) {
    return null;
  }
  const content = mergeOpenCodeConfigContent(
    input.env.OPENCODE_CONFIG_CONTENT,
    buildOpenCodeV1McpConfig(mcp.servers),
  );
  if (content === null) {
    log.warn("opencode_config_content_not_merged", {
      reason: "OPENCODE_CONFIG_CONTENT is not a JSON object",
    });
    return null;
  }
  return {
    env: { ...input.env, OPENCODE_CONFIG_CONTENT: content },
    key: mcp.key,
  };
}

/** Never a forwardedMcpServersKey (hex or empty). */
const INCOMPLETE_MCP_SYNC = "incomplete";

/**
 * 2.x: adds the forwarded MCP servers to the server for `directory` (add
 * replaces a server of the same name) and removes the ones a previous turn
 * added that are gone. Skipped while the directory has the same key. Best
 * effort: a server that cannot be added leaves the turn running without it.
 */
async function syncV2McpServers(
  client: OpenCode2Client,
  common: SessionCommon,
  mcp: OpenOpenCodeSessionInput["mcp"],
) {
  const key = mcp?.key ?? "";
  const current = common.server.forwardedMcp.get(common.directory);
  if ((current?.key ?? "") === key) {
    return;
  }
  const location = { directory: common.directory };
  const servers = buildOpenCodeV2McpServers(mcp?.servers ?? []);
  const names = Object.keys(servers);
  let complete = true;
  const leftover: string[] = [];
  for (const name of current?.names ?? []) {
    if (names.includes(name)) continue;
    await client.mcp
      .remove({ location, server: name })
      .catch((error: unknown) => {
        // Already gone (never added, or the user removed it) is done.
        if (isNotFound(error)) return;
        complete = false;
        leftover.push(name);
        log.warn("opencode_mcp_remove_failed", {
          error: getErrorMessage(error),
          server: name,
        });
      });
  }
  for (const [name, config] of Object.entries(servers)) {
    await client.mcp
      .add({ config, location, server: name })
      .catch((error: unknown) => {
        complete = false;
        // Logged by name, never with its config (secrets).
        log.warn("opencode_mcp_add_failed", {
          error: getErrorMessage(error),
          server: name,
        });
      });
  }
  // After a failure the next turn retries (no key matches) and again
  // removes what is no longer forwarded.
  common.server.forwardedMcp.set(
    common.directory,
    complete
      ? { key, names }
      : { key: INCOMPLETE_MCP_SYNC, names: [...names, ...leftover] },
  );
}

/**
 * The thread's session on the instance's server: the persisted one when it
 * still exists on this generation, else a new one. Release the result when
 * the turn ends.
 */
export async function openOpenCodeSession(
  input: OpenOpenCodeSessionInput,
): Promise<OpenCodeTurnSession> {
  const instanceId = input.instance?.id ?? "opencode";
  const v1Mcp = buildV1McpLaunch(input);
  const lease = await acquireOpenCodeServer(
    {
      binaryPath: input.binaryPath,
      env: v1Mcp?.env ?? input.env,
      instanceId,
      ...(v1Mcp ? { mcpKey: v1Mcp.key } : {}),
      runtimeKey: getInstanceRuntimeKey(input.instance),
      version: input.cliVersion,
    },
    { signal: input.signal },
  );
  let released = false;
  const common: SessionCommon = {
    directory: input.cwd,
    async discardServer() {
      // Only the server this lease is on (a replacement keeps running).
      if (getOpenCodeServerPool().peek(instanceId) === lease.server) {
        await disposeOpenCodeServer(instanceId);
      }
    },
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
