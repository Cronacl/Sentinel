#!/usr/bin/env bun
// Mock ACP agent for protocol tests: a real `@agentclientprotocol/sdk` agent()
// app over stdio NDJSON, driven by a JSON scenario. See README.md next to this
// file for the scenario format and scenario.ts for its types.
//
//   SENTINEL_ACP_MOCK_SCENARIO='{"prompts":[...]}' bun scripts/fixtures/agents/acp/mock-agent.ts
//
// Every frame the mock receives (requests, notifications and responses to its
// own requests) is appended raw to SENTINEL_ACP_MOCK_LOG as JSONL.
import * as acp from "@agentclientprotocol/sdk";

import {
  applyTemplate,
  createJsonlLog,
  createStdoutWriter,
  deepClone,
  floodStderr,
  loadScenarioFromEnv,
  nodeReadableToWeb,
  sleep,
  waitForAbort,
  writeStderr,
  type JsonObject,
} from "../shared/fixture-io";
import {
  ACP_MOCK_LOG_ENV,
  ACP_MOCK_SCENARIO_ENV,
  ACP_MOCK_SCENARIO_FILE_ENV,
  DEFAULT_AGENT_CAPABILITIES,
  DEFAULT_AGENT_INFO,
  STANDARD_PERMISSION_OPTIONS,
  type AcpLegacyModelState,
  type AcpMockBranches,
  type AcpMockError,
  type AcpMockPromptScript,
  type AcpMockScenario,
  type AcpMockStep,
} from "./scenario";

const scenario = loadScenarioFromEnv<AcpMockScenario>(
  ACP_MOCK_SCENARIO_ENV,
  ACP_MOCK_SCENARIO_FILE_ENV,
);
const log = createJsonlLog(process.env[ACP_MOCK_LOG_ENV]);
const faults = scenario.faults ?? {};
const stdout = createStdoutWriter({
  splitFramesBytes: faults.splitFramesBytes,
});

type SessionState = {
  sessionId: string;
  cwd: string;
  modes: acp.SessionModeState | null;
  configOptions: JsonObject[] | null;
  models: AcpLegacyModelState | null;
  turn?: { controller: AbortController };
};

type TurnContext = {
  client: acp.AgentContext;
  session: SessionState;
  signal: AbortSignal;
};

/** A step list that ended the turn early. */
type StepOutcome = { stopReason: acp.StopReason | null };

const CANCELLED = Symbol("cancelled");
const sessions = new Map<string, SessionState>();
const rawRequests = new Map<acp.JsonRpcId, { params: unknown; seq: number }>();
const lastCancelSeq = new Map<string, number>();
let inboundSeq = 0;
let sessionCounter = 0;
let unmatchedPrompts = 0;
let elicitationCounter = 0;
let authenticated = !scenario.auth?.requireAuth;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRequestError(error: AcpMockError): acp.RequestError {
  return new acp.RequestError(error.code, error.message, error.data);
}

function errorToJson(error: unknown): JsonObject {
  if (error instanceof acp.RequestError) {
    return { code: error.code, message: error.message, data: error.data };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

async function exitProcess(code: number, event: string): Promise<never> {
  log({ kind: "lifecycle", event, detail: { code } });
  await stdout.flush();
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Inbound tap: logs raw frames before the SDK parses (and strips) them.
// ---------------------------------------------------------------------------

function recordInbound(message: unknown) {
  if (Array.isArray(message)) {
    for (const item of message) recordInbound(item);
    return;
  }
  if (!isObject(message)) return;
  const seq = ++inboundSeq;
  if (typeof message.method === "string") {
    if ("id" in message) {
      const id = message.id as acp.JsonRpcId;
      rawRequests.set(id, { params: message.params, seq });
      log({
        kind: "request",
        id,
        method: message.method,
        params: message.params,
      });
      return;
    }
    if (message.method === "session/cancel" && isObject(message.params)) {
      const sessionId = message.params.sessionId;
      if (typeof sessionId === "string") lastCancelSeq.set(sessionId, seq);
    }
    log({
      kind: "notification",
      method: message.method,
      params: message.params,
    });
    return;
  }
  log({
    kind: "response",
    id: (message.id as acp.JsonRpcId | undefined) ?? null,
    ...("result" in message ? { result: message.result } : {}),
    ...("error" in message ? { error: message.error } : {}),
  });
}

function rawParams(requestId: acp.JsonRpcId): JsonObject {
  const params = rawRequests.get(requestId)?.params;
  return isObject(params) ? params : {};
}

/** Applies hang/delay/error faults, then runs the handler. */
function guard<C extends { requestId: acp.JsonRpcId }, R>(
  method: string,
  handler: (ctx: C) => R | Promise<R>,
): (ctx: C) => Promise<R> {
  return async (ctx) => {
    try {
      if (faults.hangMethods?.includes(method)) {
        return await new Promise<never>(() => {});
      }
      const delay = faults.methodDelays?.[method];
      if (delay) await sleep(delay);
      const error = faults.methodErrors?.[method];
      if (error) throw toRequestError(error);
      return await handler(ctx);
    } finally {
      rawRequests.delete(ctx.requestId);
    }
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function requireAuthenticated() {
  if (authenticated) return;
  throw acp.RequestError.authRequired(
    scenario.auth?.errorData,
    scenario.auth?.message,
  );
}

function nextSessionId(): string {
  const configured = scenario.session?.ids?.[sessionCounter];
  sessionCounter += 1;
  return configured ?? `mock-session-${sessionCounter}`;
}

function createSession(sessionId: string, cwd: string): SessionState {
  const config = scenario.session ?? {};
  const state: SessionState = {
    sessionId,
    cwd,
    modes: deepClone(config.modes ?? null),
    configOptions: deepClone(
      (config.configOptions as JsonObject[] | null) ?? null,
    ),
    models: deepClone(config.models ?? null),
  };
  sessions.set(sessionId, state);
  return state;
}

function requireSession(sessionId: string): SessionState {
  const state = sessions.get(sessionId);
  if (!state) {
    throw acp.RequestError.invalidParams(
      { sessionId },
      `Unknown session ${sessionId}`,
    );
  }
  return state;
}

function sessionPayload(state: SessionState): JsonObject {
  const meta = scenario.session?.meta;
  return {
    ...(state.modes ? { modes: state.modes } : {}),
    ...(state.configOptions ? { configOptions: state.configOptions } : {}),
    ...(state.models ? { models: state.models } : {}),
    ...(meta ? { _meta: meta } : {}),
  };
}

function sessionVars(state: SessionState): Record<string, unknown> {
  return { sessionId: state.sessionId, cwd: state.cwd };
}

async function sendUpdate(
  client: acp.AgentContext,
  sessionId: string,
  update: JsonObject,
  meta?: JsonObject,
) {
  const method: string = acp.methods.client.session.update;
  await client.notify(method, {
    sessionId,
    update: meta ? { ...update, _meta: meta } : update,
  });
}

/** Sends updates once the current response has been queued. */
function sendAfterResponse(
  client: acp.AgentContext,
  sessionId: string,
  updates: JsonObject[],
) {
  if (updates.length === 0) return;
  setTimeout(() => {
    void (async () => {
      for (const update of updates) await sendUpdate(client, sessionId, update);
    })();
  }, 10);
}

function flatSelectValues(option: JsonObject): string[] {
  const options = Array.isArray(option.options) ? option.options : [];
  return options.flatMap((entry: unknown) => {
    if (!isObject(entry)) return [];
    if (Array.isArray(entry.options)) {
      return entry.options.flatMap((inner: unknown) =>
        isObject(inner) && typeof inner.value === "string" ? [inner.value] : [],
      );
    }
    return typeof entry.value === "string" ? [entry.value] : [];
  });
}

// ---------------------------------------------------------------------------
// Prompt turns
// ---------------------------------------------------------------------------

function promptText(prompt: acp.ContentBlock[]): string {
  return prompt
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n");
}

function selectScript(text: string): AcpMockPromptScript {
  const scripts = scenario.prompts ?? [];
  const matched = scripts.find(
    (script) => script.match !== undefined && text.includes(script.match),
  );
  if (matched) return matched;
  const ordered = scripts.filter((script) => script.match === undefined);
  const index = unmatchedPrompts++;
  return (
    ordered[Math.min(index, ordered.length - 1)] ?? {
      steps: [{ type: "text", text: "Mock agent reply." }],
    }
  );
}

function pickBranch(
  branches: AcpMockBranches | undefined,
  key: string,
): AcpMockStep[] | undefined {
  return branches?.[key] ?? branches?.["*"];
}

async function echo(turn: TurnContext, label: string, value: unknown) {
  await sendUpdate(turn.client, turn.session.sessionId, {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: `[${label}] ${JSON.stringify(value)}` },
  });
}

async function runSteps(
  steps: AcpMockStep[] | undefined,
  turn: TurnContext,
): Promise<StepOutcome | undefined> {
  for (const step of steps ?? []) {
    if (turn.signal.aborted) throw CANCELLED;
    const outcome = await runStep(step, turn);
    if (outcome) return outcome;
  }
  return undefined;
}

async function runStep(
  step: AcpMockStep,
  turn: TurnContext,
): Promise<StepOutcome | undefined> {
  const { client, session, signal } = turn;
  const sessionId = session.sessionId;

  switch (step.type) {
    case "update":
      await sendUpdate(
        client,
        step.sessionId ?? sessionId,
        step.update,
        step.meta,
      );
      return undefined;
    case "text":
    case "thought":
      await sendUpdate(
        client,
        sessionId,
        {
          sessionUpdate:
            step.type === "text"
              ? "agent_message_chunk"
              : "agent_thought_chunk",
          content: { type: "text", text: step.text },
          ...(step.messageId ? { messageId: step.messageId } : {}),
        },
        step.meta,
      );
      return undefined;
    case "image":
      await sendUpdate(
        client,
        sessionId,
        {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "image",
            data: step.data,
            mimeType: step.mimeType,
            ...(step.uri ? { uri: step.uri } : {}),
          },
        },
        step.meta,
      );
      return undefined;
    case "toolCall":
    case "toolCallUpdate": {
      const { type, meta, ...fields } = step;
      await sendUpdate(
        client,
        sessionId,
        {
          sessionUpdate: type === "toolCall" ? "tool_call" : "tool_call_update",
          ...fields,
        },
        meta,
      );
      return undefined;
    }
    case "plan":
      await sendUpdate(client, sessionId, {
        sessionUpdate: "plan",
        entries: step.entries,
      });
      return undefined;
    case "requestPermission": {
      const response: unknown = await client.request(
        acp.methods.client.session.requestPermission,
        {
          sessionId,
          toolCall: step.toolCall as acp.ToolCallUpdate,
          options: (step.options ??
            STANDARD_PERMISSION_OPTIONS) as acp.PermissionOption[],
          ...(step.meta ? { _meta: step.meta } : {}),
        },
      );
      const outcome = isObject(response) ? response.outcome : undefined;
      const key =
        isObject(outcome) &&
        outcome.outcome === "selected" &&
        typeof outcome.optionId === "string"
          ? outcome.optionId
          : "cancelled";
      return runSteps(pickBranch(step.branches, key), turn);
    }
    case "extRequest": {
      let key: string;
      let result: JsonObject;
      try {
        const value = await client.request<unknown, unknown>(
          step.method,
          step.params ?? {},
        );
        key =
          isObject(value) && typeof value.outcome === "string"
            ? value.outcome
            : "ok";
        result = { result: value };
      } catch (error) {
        key = "error";
        result = { error: errorToJson(error) };
      }
      if (step.echo) await echo(turn, step.method, result);
      return runSteps(pickBranch(step.branches, key), turn);
    }
    case "extNotification":
      await client.notify<unknown>(step.method, step.params ?? {});
      return undefined;
    case "clientFs": {
      try {
        if (step.op === "read") {
          const value = await client.request(
            acp.methods.client.fs.readTextFile,
            {
              sessionId,
              path: step.path,
              ...(step.line !== undefined ? { line: step.line } : {}),
              ...(step.limit !== undefined ? { limit: step.limit } : {}),
            },
          );
          if (step.echo)
            await echo(turn, "fs/read_text_file", { result: value });
        } else {
          await client.request(acp.methods.client.fs.writeTextFile, {
            sessionId,
            path: step.path,
            content: step.content,
          });
        }
      } catch (error) {
        if (step.op === "read" && step.echo) {
          await echo(turn, "fs/read_text_file", { error: errorToJson(error) });
        }
      }
      return undefined;
    }
    case "clientTerminal": {
      const report: JsonObject = {};
      try {
        const createParams: acp.CreateTerminalRequest = {
          sessionId,
          command: step.command,
          ...(step.args ? { args: step.args } : {}),
          ...(step.env ? { env: step.env } : {}),
          ...(step.cwd ? { cwd: step.cwd } : {}),
          ...(step.outputByteLimit !== undefined
            ? { outputByteLimit: step.outputByteLimit }
            : {}),
        };
        const created = await client.request(
          acp.methods.client.terminal.create,
          createParams,
        );
        const terminalId = created.terminalId;
        report.terminalId = terminalId;
        if (step.toolCallId) {
          await sendUpdate(client, sessionId, {
            sessionUpdate: "tool_call_update",
            toolCallId: step.toolCallId,
            content: [{ type: "terminal", terminalId }],
          });
        }
        if (step.kill) {
          await client.request(acp.methods.client.terminal.kill, {
            sessionId,
            terminalId,
          });
        }
        if (!step.noWait) {
          report.exit = await client.request(
            acp.methods.client.terminal.waitForExit,
            {
              sessionId,
              terminalId,
            },
          );
        }
        report.output = await client.request(
          acp.methods.client.terminal.output,
          {
            sessionId,
            terminalId,
          },
        );
        if (step.release !== false) {
          await client.request(acp.methods.client.terminal.release, {
            sessionId,
            terminalId,
          });
        }
      } catch (error) {
        report.error = errorToJson(error);
      }
      if (step.echo) await echo(turn, "terminal", report);
      return undefined;
    }
    case "elicitation": {
      const params =
        step.mode === "form"
          ? {
              mode: "form" as const,
              sessionId,
              ...(step.toolCallId ? { toolCallId: step.toolCallId } : {}),
              message: step.message,
              requestedSchema: step.requestedSchema,
            }
          : {
              mode: "url" as const,
              sessionId,
              elicitationId:
                step.elicitationId ??
                `mock-elicitation-${++elicitationCounter}`,
              url: step.url,
              message: step.message,
            };
      let key: string;
      let result: JsonObject;
      try {
        const value: unknown = await client.request(
          acp.methods.client.elicitation.create,
          params as acp.CreateElicitationRequest,
        );
        key =
          isObject(value) && typeof value.action === "string"
            ? value.action
            : "ok";
        result = { result: value };
      } catch (error) {
        key = "error";
        result = { error: errorToJson(error) };
      }
      if (params.mode === "url" && step.mode === "url" && step.complete) {
        await client.notify(acp.methods.client.elicitation.complete, {
          elicitationId: params.elicitationId,
        });
      }
      if (step.echo) await echo(turn, "elicitation/create", result);
      return runSteps(pickBranch(step.branches, key), turn);
    }
    case "delay":
      await sleep(step.ms, signal);
      return undefined;
    case "stdout":
      for (const line of step.lines) await stdout.write(`${line}\n`);
      return undefined;
    case "stderr":
      await writeStderr(`${step.text}\n`, step.repeat);
      return undefined;
    case "exit":
      if (step.stderr) await writeStderr(`${step.stderr}\n`);
      if (step.signal) {
        log({
          kind: "lifecycle",
          event: "kill",
          detail: { signal: step.signal },
        });
        await stdout.flush();
        process.kill(process.pid, step.signal);
        return waitForAbort();
      }
      return exitProcess(step.code ?? 1, "exit-step");
    case "hang":
      return waitForAbort(step.ignoreCancel ? undefined : signal);
    case "waitForCancel":
      return waitForAbort(signal);
    case "stop":
      return {
        stopReason:
          step.stopReason === undefined ? "end_turn" : step.stopReason,
      };
    case "fail":
      throw toRequestError(step.error);
  }
}

async function finishCancelled(turn: TurnContext): Promise<acp.PromptResponse> {
  const cancel = scenario.cancel ?? {};
  if (cancel.exitCode !== undefined) {
    return exitProcess(cancel.exitCode, "exit-on-cancel");
  }
  for (const update of cancel.updates ?? []) {
    await sendUpdate(
      turn.client,
      turn.session.sessionId,
      applyTemplate(update, sessionVars(turn.session)),
    );
  }
  return { stopReason: cancel.stopReason ?? "cancelled" };
}

async function runPrompt(
  params: acp.PromptRequest,
  client: acp.AgentContext,
  requestId: acp.JsonRpcId,
): Promise<acp.PromptResponse> {
  const session = requireSession(params.sessionId);
  const seq = rawRequests.get(requestId)?.seq ?? inboundSeq;
  const raw = rawParams(requestId);
  const rawMeta = isObject(raw._meta) ? raw._meta : undefined;

  // Per-turn cancellation state, adapted from t3code's acp-mock-agent.ts and
  // acpMockCancellationState.ts (MIT): a cancel belongs to the turn running
  // when it arrived and never leaks into the next prompt. Here each turn owns
  // an AbortController, and inbound sequence numbers keep a cancel that raced
  // ahead of this handler. A new prompt supersedes a running one, like the
  // SDK's example agent.
  session.turn?.controller.abort(CANCELLED);
  const controller = new AbortController();
  const turnState = { controller };
  session.turn = turnState;
  // A cancel that raced ahead of this prompt's handler still cancels it.
  if ((lastCancelSeq.get(session.sessionId) ?? 0) > seq)
    controller.abort(CANCELLED);

  const text = promptText(params.prompt);
  const script = selectScript(text);
  const vars = {
    ...sessionVars(session),
    promptText: text,
    promptId: rawMeta?.promptId ?? rawMeta?.requestId,
    promptMeta: rawMeta ?? null,
  };
  const turn: TurnContext = { client, session, signal: controller.signal };

  try {
    const outcome = await runSteps(applyTemplate(script.steps, vars), turn);
    if (controller.signal.aborted) return await finishCancelled(turn);
    if (script.error) throw toRequestError(script.error);
    const stopReason =
      outcome?.stopReason !== undefined
        ? outcome.stopReason
        : script.stopReason === undefined
          ? "end_turn"
          : script.stopReason;
    const meta = script.meta ? applyTemplate(script.meta, vars) : undefined;
    return {
      ...(stopReason === null ? {} : { stopReason }),
      ...(script.usage ? { usage: script.usage } : {}),
      ...(meta ? { _meta: meta } : {}),
    } as acp.PromptResponse;
  } catch (error) {
    if (controller.signal.aborted) return finishCancelled(turn);
    throw error;
  } finally {
    if (session.turn === turnState) session.turn = undefined;
  }
}

// ---------------------------------------------------------------------------
// Agent app
// ---------------------------------------------------------------------------

const passthrough = (params: unknown) => (isObject(params) ? params : {});

const app = acp
  .agent({ name: scenario.agentName ?? "sentinel-acp-mock" })
  .onRequest(
    "initialize",
    guard("initialize", ({ requestId }) => {
      const init = scenario.initialize ?? {};
      if (init.response) return init.response as acp.InitializeResponse;
      const raw = rawParams(requestId);
      const meta: JsonObject = { ...(init.meta ?? {}) };
      if (init.echoMeta) {
        meta["sentinel.mock/request"] = {
          protocolVersion: raw.protocolVersion ?? null,
          clientInfo: raw.clientInfo ?? null,
          clientCapabilities: raw.clientCapabilities ?? null,
          _meta: raw._meta ?? null,
        };
      }
      return {
        protocolVersion: init.protocolVersion ?? acp.PROTOCOL_VERSION,
        agentCapabilities: init.agentCapabilities ?? DEFAULT_AGENT_CAPABILITIES,
        authMethods: init.authMethods ?? [],
        agentInfo:
          init.agentInfo === undefined ? DEFAULT_AGENT_INFO : init.agentInfo,
        ...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
      } as acp.InitializeResponse;
    }),
  )
  .onRequest(
    "authenticate",
    guard("authenticate", async ({ params }) => {
      const auth = scenario.auth ?? {};
      if (auth.delayMs) await sleep(auth.delayMs);
      if (
        auth.acceptMethodIds &&
        !auth.acceptMethodIds.includes(params.methodId)
      ) {
        throw toRequestError(
          auth.rejectError ?? {
            code: -32602,
            message: `Invalid params: unsupported auth method ${params.methodId}`,
          },
        );
      }
      authenticated = true;
      return {};
    }),
  )
  .onRequest(
    "logout",
    guard("logout", () => {
      if (scenario.auth?.requireAuth) authenticated = false;
      return {};
    }),
  )
  .onRequest(
    "session/new",
    guard("session/new", ({ params, client }) => {
      requireAuthenticated();
      const state = createSession(nextSessionId(), params.cwd);
      sendAfterResponse(
        client,
        state.sessionId,
        applyTemplate(scenario.session?.afterNew ?? [], sessionVars(state)),
      );
      return {
        sessionId: state.sessionId,
        ...sessionPayload(state),
      } as acp.NewSessionResponse;
    }),
  )
  .onRequest(
    "session/load",
    guard("session/load", async ({ params, client }) => {
      requireAuthenticated();
      const load = scenario.session?.load ?? {};
      if (load.error) throw toRequestError(load.error);
      if (
        load.knownSessionIds &&
        !load.knownSessionIds.includes(params.sessionId)
      ) {
        throw toRequestError(
          load.unknownSessionError ?? {
            code: -32002,
            message: `Resource not found: session ${params.sessionId}`,
          },
        );
      }
      const state =
        sessions.get(params.sessionId) ??
        createSession(params.sessionId, params.cwd);
      state.cwd = params.cwd;
      for (const update of load.replay ?? []) {
        if (load.replayDelayMs) await sleep(load.replayDelayMs);
        await sendUpdate(
          client,
          state.sessionId,
          applyTemplate(update, sessionVars(state)),
        );
      }
      return sessionPayload(state) as acp.LoadSessionResponse;
    }),
  )
  .onRequest(
    "session/resume",
    guard("session/resume", ({ params }) => {
      requireAuthenticated();
      const resume = scenario.session?.resume ?? {};
      if (resume.error) throw toRequestError(resume.error);
      if (
        resume.knownSessionIds &&
        !resume.knownSessionIds.includes(params.sessionId)
      ) {
        throw toRequestError(
          resume.unknownSessionError ?? {
            code: -32002,
            message: `Resource not found: session ${params.sessionId}`,
          },
        );
      }
      const state =
        sessions.get(params.sessionId) ??
        createSession(params.sessionId, params.cwd);
      state.cwd = params.cwd;
      return sessionPayload(state) as acp.ResumeSessionResponse;
    }),
  )
  .onRequest(
    "session/fork",
    guard("session/fork", ({ params }) => {
      requireAuthenticated();
      const source = requireSession(params.sessionId);
      const state = createSession(nextSessionId(), params.cwd);
      state.modes = deepClone(source.modes);
      state.configOptions = deepClone(source.configOptions);
      state.models = deepClone(source.models);
      return {
        sessionId: state.sessionId,
        ...sessionPayload(state),
      } as acp.ForkSessionResponse;
    }),
  )
  .onRequest(
    "session/list",
    guard("session/list", () => ({
      sessions:
        scenario.session?.list ??
        [...sessions.values()].map((state) => ({
          sessionId: state.sessionId,
          cwd: state.cwd,
        })),
    })),
  )
  .onRequest(
    "session/close",
    guard("session/close", ({ params }) => {
      sessions.get(params.sessionId)?.turn?.controller.abort(CANCELLED);
      return {};
    }),
  )
  .onRequest(
    "session/delete",
    guard("session/delete", ({ params }) => {
      sessions.delete(params.sessionId);
      return {};
    }),
  )
  .onRequest(
    "session/set_mode",
    guard("session/set_mode", ({ params, client }) => {
      const state = requireSession(params.sessionId);
      if (
        state.modes &&
        !state.modes.availableModes.some((mode) => mode.id === params.modeId)
      ) {
        throw acp.RequestError.invalidParams(
          { modeId: params.modeId },
          `Unknown mode ${params.modeId}`,
        );
      }
      if (state.modes) state.modes.currentModeId = params.modeId;
      if (scenario.session?.emitCurrentModeUpdate) {
        sendAfterResponse(client, state.sessionId, [
          {
            sessionUpdate: "current_mode_update",
            currentModeId: params.modeId,
          },
        ]);
      }
      return {};
    }),
  )
  .onRequest(
    "session/set_config_option",
    guard("session/set_config_option", ({ params, client }) => {
      const state = requireSession(params.sessionId);
      const option = state.configOptions?.find(
        (entry) => entry.id === params.configId,
      );
      if (!option) {
        throw acp.RequestError.invalidParams(
          { configId: params.configId },
          `Unknown config option ${params.configId}`,
        );
      }
      const value = (params as { value: unknown }).value;
      if (
        option.type === "select" &&
        (typeof value !== "string" || !flatSelectValues(option).includes(value))
      ) {
        throw acp.RequestError.invalidParams(
          { configId: params.configId, value },
          `Invalid value for ${params.configId}`,
        );
      }
      option.currentValue = value;
      const replacement =
        scenario.session?.configOptionsAfterSet?.[
          `${params.configId}=${String(value)}`
        ];
      if (replacement)
        state.configOptions = deepClone(replacement as JsonObject[]);
      if (scenario.session?.emitConfigOptionUpdate) {
        sendAfterResponse(client, state.sessionId, [
          {
            sessionUpdate: "config_option_update",
            configOptions: state.configOptions,
          },
        ]);
      }
      return {
        configOptions: state.configOptions,
      } as acp.SetSessionConfigOptionResponse;
    }),
  )
  // Unstable legacy model picker: not in the 1.7 method tables, so it is
  // registered as an extension method with a pass-through parser.
  .onRequest(
    "session/set_model",
    passthrough,
    guard("session/set_model", ({ params }) => {
      const sessionId =
        typeof params.sessionId === "string" ? params.sessionId : "";
      const state = requireSession(sessionId);
      const modelId = params.modelId;
      if (
        typeof modelId !== "string" ||
        (state.models &&
          !state.models.availableModels.some(
            (model) => model.modelId === modelId,
          ))
      ) {
        throw acp.RequestError.invalidParams(
          { modelId },
          `Unknown model ${String(modelId)}`,
        );
      }
      if (state.models) state.models.currentModelId = modelId;
      return {};
    }),
  )
  .onRequest(
    "session/prompt",
    guard("session/prompt", ({ params, client, requestId }) =>
      runPrompt(params, client, requestId),
    ),
  )
  .onNotification("session/cancel", ({ params }) => {
    sessions.get(params.sessionId)?.turn?.controller.abort(CANCELLED);
  });

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
  for (const line of faults.startupStdout ?? [])
    await stdout.write(`${line}\n`);
  if (faults.startupStderr) await writeStderr(`${faults.startupStderr}\n`);
  if (faults.stderrFloodBytes) await floodStderr(faults.stderrFloodBytes);
  if (faults.exitAfterMs !== undefined) {
    setTimeout(() => {
      void exitProcess(faults.exitCode ?? 1, "exit-after-ms");
    }, faults.exitAfterMs);
  }

  const wire = acp.ndJsonStream(
    stdout.stream,
    nodeReadableToWeb(process.stdin),
  );
  const tap = new TransformStream<acp.AnyMessage, acp.AnyMessage>({
    transform(message, controller) {
      recordInbound(message);
      controller.enqueue(message);
    },
  });
  const connection = app.connect({
    readable: wire.readable.pipeThrough(tap),
    writable: wire.writable,
  });

  await connection.closed;
  if (faults.exitOnStdinClose === false) {
    log({ kind: "lifecycle", event: "stdin-closed-ignored" });
    setInterval(() => {}, 1 << 30);
    return;
  }
  await exitProcess(0, "stdin-closed");
}

void main();
