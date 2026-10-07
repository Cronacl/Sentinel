#!/usr/bin/env bun
// Mock `pi --mode rpc`: strict LF-delimited JSONL on stdio. Commands
// `{id?, type, ...}` get `{id, type:"response", command, success, data|error}`;
// everything else on stdout is a session event or an extension UI request.
// Shapes follow @earendil-works/pi-coding-agent 1.0.4 (see README.md).
//
//   SENTINEL_PI_MOCK_SCENARIO='{"prompts":[...]}' bun scripts/fixtures/agents/pi/mock-rpc.ts
//
// Every record received on stdin is appended to SENTINEL_PI_MOCK_LOG as JSONL.
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";

import {
  createJsonlLog,
  createStdoutWriter,
  deepClone,
  floodStderr,
  loadScenarioFromEnv,
  sleep,
  waitForAbort,
  writeStderr,
  type JsonObject,
} from "../shared/fixture-io";
import {
  DEFAULT_PI_MODELS,
  PI_MOCK_LOG_ENV,
  PI_MOCK_SCENARIO_ENV,
  PI_MOCK_SCENARIO_FILE_ENV,
  ZERO_PI_USAGE,
  type PiBranches,
  type PiModel,
  type PiMockScenario,
  type PiPromptScript,
  type PiStep,
  type PiThinkingLevel,
  type PiUsage,
} from "./scenario";

const scenario = loadScenarioFromEnv<PiMockScenario>(
  PI_MOCK_SCENARIO_ENV,
  PI_MOCK_SCENARIO_FILE_ENV,
);
const log = createJsonlLog(process.env[PI_MOCK_LOG_ENV]);
const faults = scenario.faults ?? {};
const stdout = createStdoutWriter({
  splitFramesBytes: faults.splitFramesBytes,
});
const EOL = faults.crlf ? "\r\n" : "\n";
const DIALOG_METHODS = new Set(["select", "confirm", "input", "editor"]);
const BUSY_MESSAGE =
  "Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.";

function output(record: JsonObject): Promise<void> {
  return stdout.write(`${JSON.stringify(record)}${EOL}`);
}

function success(id: unknown, command: string, data?: unknown): JsonObject {
  return data === undefined
    ? { id, type: "response", command, success: true }
    : { id, type: "response", command, success: true, data };
}

function failure(id: unknown, command: string, error: string): JsonObject {
  return { id, type: "response", command, success: false, error };
}

async function exitProcess(code: number, event: string): Promise<never> {
  log({ kind: "lifecycle", event, detail: { code } });
  await stdout.flush();
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

const models: PiModel[] = scenario.models ?? DEFAULT_PI_MODELS;
const modelKey = (model: PiModel) => `${model.provider}/${model.id}`;
let entryCounter = 0;
let sessionCounter = 0;

function newSessionIdentity() {
  sessionCounter += 1;
  const sessionId = `mock-pi-session-${sessionCounter}`;
  return {
    sessionId,
    sessionFile: `/mock/.pi/agent/sessions/--mock--/${sessionId}.jsonl` as
      string | undefined,
  };
}

const initialIdentity = newSessionIdentity();
const state = {
  sessionId: scenario.state?.sessionId ?? initialIdentity.sessionId,
  sessionFile:
    scenario.state?.sessionFile === null
      ? undefined
      : (scenario.state?.sessionFile ?? initialIdentity.sessionFile),
  sessionName: scenario.state?.sessionName as string | undefined,
  thinkingLevel: (scenario.state?.thinkingLevel ?? "medium") as PiThinkingLevel,
  model:
    scenario.state?.model === null
      ? undefined
      : (models.find((model) => modelKey(model) === scenario.state?.model) ??
        models[0]),
  autoCompactionEnabled: scenario.state?.autoCompactionEnabled ?? true,
  steeringMode: "one-at-a-time",
  followUpMode: "one-at-a-time",
  isCompacting: false,
  messages: deepClone(scenario.messages ?? []),
  entries: deepClone(scenario.entries ?? []),
};

function leafId(): string | null {
  const last = state.entries.at(-1);
  return typeof last?.id === "string" ? last.id : null;
}

function recordMessage(message: JsonObject) {
  state.messages.push(message);
  entryCounter += 1;
  state.entries.push({
    type: "message",
    id: `entry-${entryCounter}`,
    parentId: leafId(),
    timestamp: new Date().toISOString(),
    message,
  });
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as JsonObject).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part: unknown) =>
      part && typeof part === "object" && (part as JsonObject).type === "text"
        ? [String((part as JsonObject).text ?? "")]
        : [],
    )
    .join("");
}

function sessionStats(): JsonObject {
  const count = (role: string) =>
    state.messages.filter((message) => message.role === role).length;
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  let cost = 0;
  let toolCalls = 0;
  let lastContext = 0;
  for (const message of state.messages) {
    if (message.role !== "assistant") continue;
    const usage = message.usage as PiUsage | undefined;
    if (usage) {
      tokens.input += usage.input;
      tokens.output += usage.output;
      tokens.cacheRead += usage.cacheRead;
      tokens.cacheWrite += usage.cacheWrite;
      tokens.total += usage.totalTokens;
      cost += usage.cost.total;
      lastContext = usage.totalTokens || lastContext;
    }
    const content = Array.isArray(message.content) ? message.content : [];
    toolCalls += content.filter(
      (part: unknown) => (part as JsonObject | null)?.type === "toolCall",
    ).length;
  }
  const contextWindow = state.model?.contextWindow;
  return {
    sessionFile: state.sessionFile,
    sessionId: state.sessionId,
    userMessages: count("user"),
    assistantMessages: count("assistant"),
    toolCalls,
    toolResults: count("toolResult"),
    totalMessages: state.messages.length,
    tokens,
    cost,
    ...(contextWindow
      ? {
          contextUsage: {
            tokens: lastContext,
            contextWindow,
            percent: Math.round((lastContext / contextWindow) * 100),
          },
        }
      : {}),
    ...scenario.sessionStats,
  };
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

type QueuedInput = { text: string; images?: unknown[] };

type Run = {
  controller: AbortController;
  steering: QueuedInput[];
  followUp: QueuedInput[];
  /** Messages produced by this run, for `agent_end`. */
  messages: JsonObject[];
  turnOpen: boolean;
  assistant?: JsonObject;
  /** The tool currently executing, if any. */
  tool?: { id: string; name: string; args: JsonObject };
  done: Promise<void>;
};

let run: Run | undefined;
let unmatchedPrompts = 0;
const pendingDialogs = new Map<string, (response: JsonObject) => void>();

function selectScript(text: string): PiPromptScript {
  const scripts = scenario.prompts ?? [];
  const matched = scripts.find(
    (script) => script.match !== undefined && text.includes(script.match),
  );
  if (matched) return matched;
  const ordered = scripts.filter((script) => script.match === undefined);
  const index = unmatchedPrompts++;
  return (
    ordered[Math.min(index, ordered.length - 1)] ?? {
      steps: [{ type: "text", text: "Mock reply." }],
    }
  );
}

function emitQueueUpdate(current: Run) {
  return output({
    type: "queue_update",
    steering: current.steering.map((input) => input.text),
    followUp: current.followUp.map((input) => input.text),
  });
}

function assistantUsage(current: Run): PiUsage {
  return (current.assistant?.usage as PiUsage | undefined) ?? ZERO_PI_USAGE;
}

async function openTurn(current: Run) {
  if (current.turnOpen) return;
  current.turnOpen = true;
  await output({ type: "turn_start" });
}

async function deliverUserMessage(current: Run, input: QueuedInput) {
  await openTurn(current);
  const message = {
    role: "user",
    content: [{ type: "text", text: input.text }, ...(input.images ?? [])],
    timestamp: Date.now(),
  };
  await output({ type: "message_start", message });
  await output({ type: "message_end", message });
  current.messages.push(message);
  recordMessage(message);
}

async function ensureAssistant(current: Run): Promise<JsonObject> {
  await openTurn(current);
  if (current.assistant) return current.assistant;
  const model = state.model;
  current.assistant = {
    role: "assistant",
    content: [],
    api: model?.api ?? "unknown",
    provider: model?.provider ?? "unknown",
    model: model?.id ?? "unknown",
    usage: deepClone(ZERO_PI_USAGE),
    stopReason: "pending",
    timestamp: Date.now(),
  };
  await output({
    type: "message_start",
    message: deepClone(current.assistant),
  });
  return current.assistant;
}

function messageUpdate(current: Run, assistantMessageEvent: JsonObject) {
  return output({
    type: "message_update",
    usage: assistantUsage(current),
    assistantMessageEvent,
  });
}

async function closeAssistant(
  current: Run,
  stopReason: string,
  extra: { usage?: PiUsage; errorMessage?: string } = {},
): Promise<JsonObject | undefined> {
  const message = current.assistant;
  if (!message) return undefined;
  message.stopReason = stopReason;
  if (extra.usage) message.usage = extra.usage;
  if (extra.errorMessage) message.errorMessage = extra.errorMessage;
  await output({ type: "message_end", message });
  current.messages.push(message);
  recordMessage(message);
  current.assistant = undefined;
  return message;
}

async function endTurn(
  current: Run,
  message: JsonObject | undefined,
  toolResults: JsonObject[],
) {
  if (!current.turnOpen) return;
  current.turnOpen = false;
  await output({ type: "turn_end", message: message ?? null, toolResults });
}

async function streamBlock(
  current: Run,
  kind: "text" | "thinking",
  text: string | string[],
) {
  const assistant = await ensureAssistant(current);
  const content = assistant.content as JsonObject[];
  const contentIndex = content.length;
  const block: JsonObject =
    kind === "text"
      ? { type: "text", text: "" }
      : { type: "thinking", thinking: "" };
  content.push(block);
  const field = kind === "text" ? "text" : "thinking";
  await messageUpdate(current, { type: `${kind}_start`, contentIndex });
  for (const delta of Array.isArray(text) ? text : [text]) {
    if (current.controller.signal.aborted)
      throw current.controller.signal.reason;
    block[field] = `${String(block[field])}${delta}`;
    await messageUpdate(current, {
      type: `${kind}_delta`,
      contentIndex,
      delta,
    });
  }
  await messageUpdate(current, {
    type: `${kind}_end`,
    contentIndex,
    content: block[field],
  });
}

async function runToolCall(
  current: Run,
  step: Extract<PiStep, { type: "toolCall" }>,
) {
  const signal = current.controller.signal;
  const assistant = await ensureAssistant(current);
  const content = assistant.content as JsonObject[];
  const contentIndex = content.length;
  const toolCallId =
    step.id ?? `toolu_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const toolCall = {
    type: "toolCall",
    id: toolCallId,
    name: step.name,
    arguments: step.args,
  };
  content.push(toolCall);
  await messageUpdate(current, {
    type: "toolcall_start",
    contentIndex,
    id: toolCallId,
    toolName: step.name,
  });
  await messageUpdate(current, {
    type: "toolcall_delta",
    contentIndex,
    delta: JSON.stringify(step.args),
  });
  await messageUpdate(current, {
    type: "toolcall_end",
    contentIndex,
    toolCall,
  });
  const assistantMessage = await closeAssistant(current, "toolUse");

  current.tool = { id: toolCallId, name: step.name, args: step.args };
  await output({
    type: "tool_execution_start",
    toolCallId,
    toolName: step.name,
    args: step.args,
  });
  for (const partialResult of step.updates ?? []) {
    if (signal.aborted) throw signal.reason;
    await output({
      type: "tool_execution_update",
      toolCallId,
      toolName: step.name,
      args: step.args,
      partialResult,
    });
  }
  if (step.durationMs) await sleep(step.durationMs, signal);
  const result = step.result ?? {
    content: [{ type: "text", text: "ok" }],
    details: {},
  };
  await finishTool(current, assistantMessage, result, step.isError ?? false);
}

async function finishTool(
  current: Run,
  assistantMessage: JsonObject | undefined,
  result: JsonObject,
  isError: boolean,
) {
  const tool = current.tool;
  if (!tool) return;
  current.tool = undefined;
  await output({
    type: "tool_execution_end",
    toolCallId: tool.id,
    toolName: tool.name,
    result,
    isError,
  });
  const toolResult = {
    role: "toolResult",
    toolCallId: tool.id,
    toolName: tool.name,
    content: result.content ?? [],
    details: result.details ?? {},
    isError,
    timestamp: Date.now(),
  };
  await output({ type: "message_start", message: toolResult });
  await output({ type: "message_end", message: toolResult });
  current.messages.push(toolResult);
  recordMessage(toolResult);
  await endTurn(current, assistantMessage, [toolResult]);
}

function pickBranch(
  branches: PiBranches | undefined,
  key: string,
): PiStep[] | undefined {
  return branches?.[key] ?? branches?.["*"];
}

async function runDialog(
  current: Run,
  step: Extract<PiStep, { type: "ui" }>,
): Promise<string> {
  const id = randomUUID();
  const fields = step.fields ?? {};
  const response = new Promise<JsonObject>((resolve) =>
    pendingDialogs.set(id, resolve),
  );
  await output({
    type: "extension_ui_request",
    id,
    method: step.method,
    ...fields,
  });
  const waits: Array<Promise<JsonObject>> = [
    response,
    waitForAbort(current.controller.signal).catch(() => ({ cancelled: true })),
  ];
  if (typeof fields.timeout === "number") {
    const timeoutMs = fields.timeout;
    waits.push(sleep(timeoutMs).then(() => ({ timeout: true })));
  }
  const answer = await Promise.race(waits);
  pendingDialogs.delete(id);
  if (answer.timeout === true) return "timeout";
  if (answer.cancelled === true) return "cancelled";
  if (step.method === "confirm")
    return answer.confirmed === true ? "confirmed" : "declined";
  return typeof answer.value === "string" ? answer.value : "cancelled";
}

/** Runs steps; returns "steered" when a steering message cut the script short. */
async function runSteps(
  current: Run,
  steps: PiStep[] | undefined,
): Promise<"done" | "steered"> {
  const signal = current.controller.signal;
  for (const step of steps ?? []) {
    if (signal.aborted) throw signal.reason;
    switch (step.type) {
      case "text":
      case "thinking":
        await streamBlock(current, step.type, step.text);
        break;
      case "toolCall":
        await runToolCall(current, step);
        if (current.steering.length > 0) return "steered";
        break;
      case "ui":
        if (DIALOG_METHODS.has(step.method)) {
          const key = await runDialog(current, step);
          const outcome = await runSteps(
            current,
            pickBranch(step.branches, key),
          );
          if (outcome === "steered") return outcome;
        } else {
          await output({
            type: "extension_ui_request",
            id: randomUUID(),
            method: step.method,
            ...step.fields,
          });
        }
        break;
      case "compaction": {
        const reason = step.reason ?? "threshold";
        state.isCompacting = true;
        await output({ type: "compaction_start", reason });
        if (step.durationMs) await sleep(step.durationMs, signal);
        state.isCompacting = false;
        await output({
          type: "compaction_end",
          reason,
          ...(step.aborted || step.errorMessage
            ? {}
            : { result: step.result ?? compactionResult() }),
          aborted: step.aborted ?? false,
          willRetry: step.willRetry ?? false,
          ...(step.errorMessage ? { errorMessage: step.errorMessage } : {}),
        });
        break;
      }
      case "retry": {
        const attempt = step.attempt ?? 1;
        await output({
          type: "auto_retry_start",
          attempt,
          maxAttempts: step.maxAttempts ?? 3,
          delayMs: step.delayMs ?? 2000,
          errorMessage: step.errorMessage ?? "529 overloaded",
        });
        if (step.waitMs) await sleep(step.waitMs, signal);
        await output(
          step.success === false
            ? {
                type: "auto_retry_end",
                success: false,
                attempt,
                finalError:
                  step.finalError ?? step.errorMessage ?? "529 overloaded",
              }
            : { type: "auto_retry_end", success: true, attempt: attempt + 1 },
        );
        break;
      }
      case "event":
        await output(step.event);
        break;
      case "extensionError":
        await output({
          type: "extension_error",
          extensionPath:
            step.extensionPath ?? "/mock/.pi/extensions/sentinel.ts",
          event: step.event ?? "tool_call",
          error: step.error,
        });
        break;
      case "delay":
        await sleep(step.ms, signal);
        break;
      case "stdout":
        for (const line of step.lines) await stdout.write(`${line}\n`);
        break;
      case "stderr":
        await writeStderr(`${step.text}\n`, step.repeat);
        break;
      case "exit":
        if (step.signal) {
          await stdout.flush();
          process.kill(process.pid, step.signal);
          await waitForAbort();
        }
        await exitProcess(step.code ?? 1, "exit-step");
        break;
      case "hang":
        await waitForAbort(signal);
        break;
    }
  }
  return "done";
}

async function runScript(current: Run, script: PiPromptScript): Promise<void> {
  const outcome = await runSteps(current, script.steps);
  if (outcome === "steered") return;
  await ensureAssistant(current);
  const message = await closeAssistant(current, script.stopReason ?? "stop", {
    usage: script.usage ?? defaultUsage(),
    ...(script.errorMessage ? { errorMessage: script.errorMessage } : {}),
  });
  await endTurn(current, message, []);
}

function defaultUsage(): PiUsage {
  return {
    input: 120,
    output: 30,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 150,
    cost: {
      input: 0.00036,
      output: 0.00045,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0.00081,
    },
  };
}

function compactionResult(): JsonObject {
  return (
    scenario.compaction ?? {
      summary: "Summary of the conversation so far.",
      firstKeptEntryId: leafId() ?? "entry-0",
      tokensBefore: 150000,
      estimatedTokensAfter: 32000,
      usage: defaultUsage(),
      details: {},
    }
  );
}

async function finishAborted(current: Run) {
  const errorMessage = scenario.abortErrorMessage ?? "Request was aborted";
  if (current.tool) {
    await finishTool(
      current,
      undefined,
      { content: [{ type: "text", text: errorMessage }], details: {} },
      true,
    );
  }
  if (current.assistant) {
    const message = await closeAssistant(current, "aborted", { errorMessage });
    await endTurn(current, message, []);
  }
  await endTurn(current, undefined, []);
}

function startRun(input: QueuedInput, script: PiPromptScript): Run {
  const current: Run = {
    controller: new AbortController(),
    steering: [],
    followUp: [],
    messages: [],
    turnOpen: false,
    done: Promise.resolve(),
  };
  run = current;
  current.done = (async () => {
    await output({ type: "agent_start" });
    try {
      await deliverUserMessage(current, input);
      await runScript(current, script);
      for (;;) {
        const next = current.steering.shift() ?? current.followUp.shift();
        if (!next) break;
        await emitQueueUpdate(current);
        await deliverUserMessage(current, next);
        await runScript(current, selectScript(next.text));
      }
    } catch (error) {
      if (!current.controller.signal.aborted) {
        await writeStderr(`[pi-mock] run failed: ${String(error)}\n`);
      }
      await finishAborted(current);
    }
    for (const resolve of pendingDialogs.values()) resolve({ cancelled: true });
    await output({
      type: "agent_end",
      messages: current.messages,
      willRetry: false,
    });
    if (run === current) run = undefined;
    await output({ type: "agent_settled" });
  })();
  return current;
}

async function enqueue(kind: "steer" | "followUp", input: QueuedInput) {
  if (!run) {
    startRun(input, selectScript(input.text));
    return;
  }
  (kind === "steer" ? run.steering : run.followUp).push(input);
  await emitQueueUpdate(run);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function findModel(provider: unknown, modelId: unknown) {
  return models.find(
    (model) => model.provider === provider && model.id === modelId,
  );
}

function loadSession(
  identity: { sessionId: string; sessionFile?: string },
  data: {
    sessionName?: string;
    messages?: JsonObject[];
    entries?: JsonObject[];
  },
) {
  state.sessionId = identity.sessionId;
  state.sessionFile = identity.sessionFile;
  state.sessionName = data.sessionName;
  state.messages = deepClone(data.messages ?? []);
  state.entries = deepClone(data.entries ?? []);
}

async function handleCommand(
  command: JsonObject,
): Promise<JsonObject | undefined> {
  const id = command.id;
  const type = String(command.type);
  const message = typeof command.message === "string" ? command.message : "";
  const images = Array.isArray(command.images) ? command.images : undefined;

  switch (type) {
    case "prompt": {
      if (run) {
        const behavior = command.streamingBehavior;
        if (behavior !== "steer" && behavior !== "followUp") {
          return failure(id, "prompt", BUSY_MESSAGE);
        }
        await enqueue(behavior, { text: message, images });
        return success(id, "prompt", { disposition: "queued" });
      }
      const script = selectScript(message);
      if (script.reject) return failure(id, "prompt", script.reject);
      if (script.disposition === "handled") {
        return success(id, "prompt", { disposition: "handled" });
      }
      await output(success(id, "prompt", { disposition: "started" }));
      startRun({ text: message, images }, script);
      return undefined;
    }
    case "steer":
    case "follow_up":
      await enqueue(type === "steer" ? "steer" : "followUp", {
        text: message,
        images,
      });
      return success(id, type, { disposition: "queued" });
    case "abort": {
      const current = run;
      if (current) {
        current.controller.abort(new Error("aborted"));
        await current.done;
      }
      return success(id, "abort");
    }
    case "clear_queue": {
      const steering = run?.steering.splice(0).map((input) => input.text) ?? [];
      const followUp = run?.followUp.splice(0).map((input) => input.text) ?? [];
      if (run) await emitQueueUpdate(run);
      return success(id, "clear_queue", { steering, followUp });
    }
    case "new_session": {
      if (scenario.cancelled?.new_session) {
        return success(id, "new_session", { cancelled: true });
      }
      loadSession(newSessionIdentity(), {});
      return success(id, "new_session", { cancelled: false });
    }
    case "get_state":
      return success(id, "get_state", {
        model: state.model,
        thinkingLevel: state.thinkingLevel,
        isStreaming: run !== undefined,
        isCompacting: state.isCompacting,
        steeringMode: state.steeringMode,
        followUpMode: state.followUpMode,
        sessionFile: state.sessionFile,
        sessionId: state.sessionId,
        sessionName: state.sessionName,
        autoCompactionEnabled: state.autoCompactionEnabled,
        messageCount: state.messages.length,
        pendingMessageCount:
          (run?.steering.length ?? 0) + (run?.followUp.length ?? 0),
      });
    case "get_messages":
      return success(id, "get_messages", { messages: state.messages });
    case "set_model": {
      const model = findModel(command.provider, command.modelId);
      if (!model) {
        return failure(
          id,
          "set_model",
          `Model not found: ${String(command.provider)}/${String(command.modelId)}`,
        );
      }
      state.model = model;
      return success(id, "set_model", model);
    }
    case "cycle_model": {
      if (models.length < 2) return success(id, "cycle_model", null);
      const index = state.model ? models.indexOf(state.model) : -1;
      state.model = models[(index + 1) % models.length];
      return success(id, "cycle_model", {
        model: state.model,
        thinkingLevel: state.thinkingLevel,
        isScoped: false,
      });
    }
    case "get_available_models":
      return success(id, "get_available_models", { models });
    case "set_thinking_level": {
      const level = command.level as PiThinkingLevel;
      if (level !== state.thinkingLevel) {
        state.thinkingLevel = level;
        await output({ type: "thinking_level_changed", level });
      }
      return success(id, "set_thinking_level");
    }
    case "cycle_thinking_level": {
      const levels = availableThinkingLevels();
      if (levels.length < 2) return success(id, "cycle_thinking_level", null);
      const next =
        levels[(levels.indexOf(state.thinkingLevel) + 1) % levels.length];
      state.thinkingLevel = next ?? state.thinkingLevel;
      return success(id, "cycle_thinking_level", {
        level: state.thinkingLevel,
      });
    }
    case "get_available_thinking_levels":
      return success(id, "get_available_thinking_levels", {
        levels: availableThinkingLevels(),
      });
    case "set_steering_mode":
      state.steeringMode = String(command.mode);
      return success(id, type);
    case "set_follow_up_mode":
      state.followUpMode = String(command.mode);
      return success(id, type);
    case "set_auto_compaction":
      state.autoCompactionEnabled = command.enabled === true;
      return success(id, type);
    case "set_auto_retry":
    case "abort_retry":
    case "abort_bash":
      return success(id, type);
    case "compact": {
      const result = compactionResult();
      await output({ type: "compaction_start", reason: "manual" });
      await output({
        type: "compaction_end",
        reason: "manual",
        result,
        aborted: false,
        willRetry: false,
      });
      return success(id, "compact", result);
    }
    case "bash": {
      const shell = String(command.command);
      const configured = scenario.bash?.[shell];
      const text = configured?.output ?? `mock output for ${shell}\n`;
      await output({
        type: "bash_execution_update",
        ...(id === undefined ? {} : { id }),
        delta: text,
      });
      return success(id, "bash", {
        output: text,
        exitCode: configured?.exitCode ?? 0,
        cancelled: false,
        truncated: false,
      });
    }
    case "get_session_stats":
      return success(id, "get_session_stats", sessionStats());
    case "export_html":
      return success(id, "export_html", {
        path:
          typeof command.outputPath === "string"
            ? command.outputPath
            : "/tmp/pi-session.html",
      });
    case "switch_session": {
      if (scenario.cancelled?.switch_session) {
        return success(id, "switch_session", { cancelled: true });
      }
      const sessionPath = String(command.sessionPath);
      const target = scenario.sessions?.[sessionPath];
      if (!target) {
        return failure(
          id,
          "switch_session",
          `Session file not found: ${sessionPath}`,
        );
      }
      loadSession(
        {
          sessionId: target.sessionId ?? newSessionIdentity().sessionId,
          sessionFile: sessionPath,
        },
        target,
      );
      return success(id, "switch_session", { cancelled: false });
    }
    case "fork": {
      if (scenario.cancelled?.fork)
        return success(id, "fork", { cancelled: true });
      const index = state.entries.findIndex(
        (entry) => entry.id === command.entryId,
      );
      const entry = state.entries[index];
      if (!entry)
        return failure(
          id,
          "fork",
          `Entry not found: ${String(command.entryId)}`,
        );
      const text = messageText(entry.message);
      const kept = state.entries.slice(0, index);
      loadSession(newSessionIdentity(), {
        messages: kept.flatMap((item) =>
          item.message ? [item.message as JsonObject] : [],
        ),
        entries: kept,
      });
      return success(id, "fork", { text, cancelled: false });
    }
    case "clone": {
      if (scenario.cancelled?.clone)
        return success(id, "clone", { cancelled: true });
      if (!leafId()) {
        return failure(
          id,
          "clone",
          "Cannot clone session: no current entry selected",
        );
      }
      loadSession(newSessionIdentity(), {
        messages: state.messages,
        entries: state.entries,
      });
      return success(id, "clone", { cancelled: false });
    }
    case "get_fork_messages":
      return success(id, "get_fork_messages", {
        messages: state.entries.flatMap((entry) =>
          (entry.message as JsonObject | undefined)?.role === "user"
            ? [{ entryId: entry.id, text: messageText(entry.message) }]
            : [],
        ),
      });
    case "get_entries": {
      let entries = state.entries;
      if (command.since !== undefined) {
        const index = entries.findIndex((entry) => entry.id === command.since);
        if (index === -1) {
          return failure(
            id,
            "get_entries",
            `Entry not found: ${String(command.since)}`,
          );
        }
        entries = entries.slice(index + 1);
      }
      return success(id, "get_entries", { entries, leafId: leafId() });
    }
    case "get_tree": {
      // The mock's sessions never branch: the tree is one chain.
      let tree: JsonObject[] = [];
      for (const entry of [...state.entries].reverse()) {
        tree = [{ entry, children: tree }];
      }
      return success(id, "get_tree", { tree, leafId: leafId() });
    }
    case "get_last_assistant_text": {
      const last = [...state.messages]
        .reverse()
        .find((item) => item.role === "assistant");
      const text = last ? messageText(last) : "";
      return success(id, "get_last_assistant_text", {
        text: text === "" ? null : text,
      });
    }
    case "set_session_name": {
      const name = String(command.name ?? "").trim();
      if (!name)
        return failure(id, "set_session_name", "Session name cannot be empty");
      state.sessionName = name;
      await output({ type: "session_info_changed", name });
      return success(id, "set_session_name");
    }
    case "get_commands":
      return success(id, "get_commands", { commands: scenario.commands ?? [] });
    default:
      return failure(id, type, `Unknown command: ${type}`);
  }
}

function availableThinkingLevels(): PiThinkingLevel[] {
  if (scenario.thinkingLevels) return scenario.thinkingLevels;
  const model = state.model;
  if (!model?.reasoning) return ["off"];
  const ladder: PiThinkingLevel[] = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ];
  return ladder.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (level === "xhigh" || level === "max") return typeof mapped === "string";
    return mapped !== null;
  });
}

async function dispatch(command: JsonObject) {
  const type = String(command.type);
  try {
    if (scenario.hangCommands?.includes(type)) return;
    const delay = scenario.commandDelays?.[type];
    if (delay) await sleep(delay);
    const error = scenario.commandErrors?.[type];
    if (error !== undefined) {
      await output(failure(command.id, type, error));
      return;
    }
    const response = await handleCommand(command);
    if (response) await output(response);
  } catch (error) {
    await output(
      failure(
        command.id,
        type,
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
}

function handleLine(line: string) {
  if (line.trim() === "") return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    log({ kind: "unparsable", line });
    void output(
      failure(
        undefined,
        "parse",
        `Failed to parse command: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    log({ kind: "unparsable", line });
    return;
  }
  const record = parsed as JsonObject;
  if (record.type === "extension_ui_response") {
    log({ kind: "ui_response", record });
    pendingDialogs.get(String(record.id))?.(record);
    return;
  }
  log({ kind: "command", record });
  void dispatch(record);
}

async function main() {
  for (const line of faults.startupStdout ?? [])
    await stdout.write(`${line}\n`);
  if (faults.startupStderr) await writeStderr(`${faults.startupStderr}\n`);
  if (faults.stderrFloodBytes) await floodStderr(faults.stderrFloodBytes);
  if (faults.exitAfterMs !== undefined) {
    setTimeout(
      () => void exitProcess(faults.exitCode ?? 1, "exit-after-ms"),
      faults.exitAfterMs,
    );
  }

  // LF-only framing with a stripped trailing CR, never readline (which also
  // splits on U+2028/U+2029 inside JSON strings).
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  const emit = (line: string) =>
    handleLine(line.endsWith("\r") ? line.slice(0, -1) : line);
  process.stdin.on("data", (chunk: Buffer) => {
    buffer += decoder.write(chunk);
    for (
      let index = buffer.indexOf("\n");
      index !== -1;
      index = buffer.indexOf("\n")
    ) {
      emit(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
    }
  });
  process.stdin.on("end", () => {
    buffer += decoder.end();
    if (buffer) emit(buffer);
    if (faults.exitOnStdinClose === false) {
      log({ kind: "lifecycle", event: "stdin-closed-ignored" });
      setInterval(() => {}, 1 << 30);
      return;
    }
    void (async () => {
      if (run) {
        run.controller.abort(new Error("shutdown"));
        await run.done;
      }
      await exitProcess(0, "stdin-closed");
    })();
  });
}

void main();
