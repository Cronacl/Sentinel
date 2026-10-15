import "server-only";

import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { DRIVER_CATALOG } from "@/lib/ai/chat/engines/catalog";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import {
  getLoginShellCandidates,
  getLoginShellMarkers,
} from "@/lib/ai/chat/engines/platform/runtime/login-shell";
import {
  getInstanceRuntimeKey,
  isExecutableFile,
  recordResolvedBinary,
  resolveBinaryStandard,
  type BinaryVerifier,
  type ResolvedBinary,
} from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import { probeBinaryVersion } from "@/lib/ai/chat/engines/platform/runtime/version-probe";
import { buildPlanOutput } from "@/lib/ai/chat/runtime/external/acp-updates";
import type { ExternalAssistantMirror } from "@/lib/ai/chat/runtime/external/mirror";
import {
  resolvePermissionDisposition,
  type PermissionDispositionInput,
} from "@/lib/ai/chat/runtime/external/permissions";
import type {
  ExternalQuestion,
  ExternalQuestionResponse,
} from "@/lib/ai/chat/runtime/external/user-input";
import type { PermissionMode } from "@/server/db/enums";

import type { AcpConfigOptionInfo, AcpCatalogModel } from "../config-options";
import type {
  AcpAgentDescriptor,
  AcpBinaryResolution,
  AcpExtContext,
  AcpExtNotificationHandler,
  AcpExtRequestHandler,
} from "../descriptor";
import { getErrorMessage, getRpcErrorCode } from "../errors";
import {
  asRecord,
  readArray,
  readNonEmptyString,
  readNumber,
  readRecord,
  readString,
  type AcpPermissionOptionInfo,
  type AcpSessionUpdateEnvelope,
} from "../schema";

// Grok Build (`grok agent stdio`) on the shared ACP engine (design
// acp-and-agents §3.2). Ported from t3code packages/provider-grok
// (acpSupport.ts, xaiAcpExtension.ts, MIT):
// - the permission mode is a launch flag, so a mode change respawns;
// - `initialize _meta {clientType:"extension"}` makes Auto mode ask instead
//   of silently denying; `session/cancel _meta {cancelTrigger:"ctrl_c"}`
//   stops stale background wake turns;
// - auth is `xai.api_key` with XAI_API_KEY in the environment, else the
//   `cached_token` of `grok login`; neither opens a browser;
// - models come from `initialize _meta.modelState` (reasoning efforts in
//   each model's `_meta`); `grok-build` keeps the session's model and is
//   never sent;
// - a turn ends on the first of the session/prompt response,
//   `x.ai/session/prompt_complete` and a `turn_completed` session
//   notification for the same prompt id (released builds use `_x.ai/`
//   names, source builds `x.ai/`); `task-completed-*` prompt ids are
//   background wake turns and never end a user turn; a completion with
//   stopReason "rate_limit" or "error" fails the turn (it wins the race
//   against the failed response, so it carries the failure);
// - xAI frames replayed by session/load, or of another session, are ignored;
// - `x.ai/exit_plan_mode` becomes a plan card and `x.ai/ask_user_question`
//   a question card; background tasks and subagents get their own cards;
// - error -32003 is the account's rate limit;
// - background tasks pin the pool entry until they finish, and Stop kills
//   the process group so they die with the turn.

export const GROK_DEFAULT_MODEL_ID = "grok-build";
export const GROK_API_KEY_ENV = "XAI_API_KEY";
export const GROK_API_KEY_METHOD_ID = "xai.api_key";
export const GROK_CACHED_TOKEN_METHOD_ID = "cached_token";
export const GROK_RATE_LIMIT_CODE = -32003;

const RESOLUTION_TTL_MS = 15_000;
const FALLBACK_SHELLS = ["/bin/zsh", "/bin/bash", "/usr/bin/fish"];
const BACKGROUND_PROMPT_PREFIXES = ["task-completed-", "subagent-completed-"];
const ALLOW_EDITS_SESSION_OPTION_ID = "allow-edits-session";
const AGENT_RESULT_MAX_CHARS = 500;
const EMPTY_PLAN =
  "# No plan written yet\n\n(Grok left plan mode without writing a plan.)";

/** `grok` argv per permission mode (t3code acpSupport.ts grokAcpSpawnArgs). */
export function grokLaunchArgs(permissionMode: PermissionMode) {
  switch (permissionMode) {
    case "auto":
      return ["--permission-mode", "auto", "agent", "stdio"];
    case "full":
      return ["agent", "--always-approve", "stdio"];
    default:
      // `--permission-mode` beats the user's Grok config, so asking mode
      // never inherits a configured always-approve.
      return ["--permission-mode", "default", "agent", "stdio"];
  }
}

const resolutions = new Map<
  string,
  { expiresAt: number; promise: Promise<AcpBinaryResolution> }
>();

const launchableVerifier: BinaryVerifier = async (candidatePath, env) => {
  const probe = await probeBinaryVersion({ command: candidatePath, env });
  return probe.launchable
    ? { path: candidatePath, version: probe.version }
    : null;
};

/** `~/.grok/bin/grok`, where x.ai's install script puts the CLI. */
async function findInstallScriptBinary(
  env: Record<string, string | undefined>,
): Promise<ResolvedBinary | null> {
  if (process.platform === "win32") {
    return null;
  }
  const home = env.HOME?.trim() || os.homedir();
  const candidate = path.join(home, ".grok", "bin", "grok");
  if (!(await isExecutableFile(candidate))) {
    return null;
  }
  const verified = await launchableVerifier(candidate, env);
  return verified ? { env, source: "managed-path", ...verified } : null;
}

async function resolveGrokBinaryUncached(
  instance: ResolvedEngineInstance,
): Promise<AcpBinaryResolution> {
  const env = instance.env;
  const standard = await resolveBinaryStandard({
    command: "grok",
    env,
    instance,
    legacyEnvKeys: [],
    loginShell: {
      markers: getLoginShellMarkers("grok"),
      shells: getLoginShellCandidates(env, FALLBACK_SHELLS),
    },
    strategy: "pathext-or-bare",
    verify: launchableVerifier,
  });
  const resolved =
    standard.resolved ??
    (standard.rejectedOverride ? null : await findInstallScriptBinary(env));
  if (!resolved) {
    return {
      binary: null,
      error: standard.rejectedOverride
        ? `Grok at ${standard.rejectedOverride.path} is not launchable.`
        : "Grok Build was not found in PATH.",
    };
  }
  await recordResolvedBinary(resolved, { instanceId: instance.id });
  return {
    binary: {
      env: resolved.env,
      path: resolved.path,
      source: resolved.source,
      version: resolved.version,
    },
    error: null,
  };
}

export function resolveGrokBinary(
  instance: ResolvedEngineInstance,
  options: { forceRefresh?: boolean } = {},
) {
  const key = getInstanceRuntimeKey(instance);
  const cached = resolutions.get(key);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }
  const promise = resolveGrokBinaryUncached(instance);
  resolutions.set(key, { expiresAt: Date.now() + RESOLUTION_TTL_MS, promise });
  promise.catch(() => resolutions.delete(key));
  return promise;
}

// --- Models -----------------------------------------------------------------

function effortOptionOf(meta: unknown): AcpConfigOptionInfo | null {
  const values = (readArray(meta, "reasoningEfforts") ?? []).flatMap(
    (entry) => {
      const value =
        typeof entry === "string"
          ? entry
          : (readNonEmptyString(entry, "value") ??
            readNonEmptyString(entry, "id"));
      return value
        ? [
            {
              description: readString(entry, "description"),
              name: readNonEmptyString(entry, "label") ?? value,
              value,
            },
          ]
        : [];
    },
  );
  if (values.length === 0) {
    return null;
  }
  return {
    category: "thought_level",
    currentValue: readNonEmptyString(meta, "reasoningEffort"),
    description: null,
    id: "reasoning_effort",
    name: "Reasoning effort",
    type: "select",
    values,
  };
}

/**
 * Grok's model picker state (`initialize _meta.modelState`, or a session's
 * legacy `models`) as catalog models: `grok-build` first (the default: keep
 * whatever model the session runs), then every listed model with its
 * reasoning efforts.
 */
export function readGrokModels(modelState: unknown): AcpCatalogModel[] {
  const seen = new Set<string>([GROK_DEFAULT_MODEL_ID]);
  const listed = (readArray(modelState, "availableModels") ?? []).flatMap(
    (model): AcpCatalogModel[] => {
      const id = readNonEmptyString(model, "modelId")?.trim();
      if (!id || seen.has(id)) {
        return [];
      }
      seen.add(id);
      return [
        {
          effortOption: effortOptionOf(readRecord(model, "_meta")),
          id,
          name: readNonEmptyString(model, "name")?.trim() || id,
        },
      ];
    },
  );
  return [
    { id: GROK_DEFAULT_MODEL_ID, isDefault: true, name: "Grok Build" },
    ...listed,
  ];
}

/** The model state Grok put on its initialize result. */
export function readGrokInitializeModels(initializeResult: unknown) {
  const modelState =
    readRecord(readRecord(initializeResult, "_meta"), "modelState") ??
    readRecord(initializeResult, "models");
  return modelState ? readGrokModels(modelState) : [];
}

// --- Turn completion and background turns -----------------------------------

/** Both spellings of an xAI extension method (`_x.ai/…` and `x.ai/…`). */
function xai(name: string) {
  return [`_x.ai/${name}`, `x.ai/${name}`] as const;
}

export function isGrokBackgroundPromptId(promptId: unknown) {
  return (
    typeof promptId === "string" &&
    BACKGROUND_PROMPT_PREFIXES.some((prefix) => promptId.startsWith(prefix))
  );
}

function stopReasonOf(value: unknown) {
  return (
    readNonEmptyString(value, "stopReason") ??
    readNonEmptyString(value, "stop_reason")
  );
}

/**
 * A completion that reports a failure (t3code xAiPromptFailure): Grok sends
 * it before the failed session/prompt response, and the completion wins the
 * race, so it must fail the turn itself.
 */
export function grokCompletionFailure(
  stopReason: string | null,
  agentResult: unknown,
): Error | null {
  if (stopReason === "rate_limit") {
    // Named by grokPromptErrorMessage, like the -32003 response would be.
    return Object.assign(new Error(""), { code: GROK_RATE_LIMIT_CODE });
  }
  if (stopReason === "error") {
    const detail = typeof agentResult === "string" ? agentResult.trim() : "";
    return Object.assign(
      new Error(
        detail
          ? `Grok ended the turn with an error: ${
              detail.length > AGENT_RESULT_MAX_CHARS
                ? `${detail.slice(0, AGENT_RESULT_MAX_CHARS)}…`
                : detail
            }`
          : "Grok ended the turn with an error.",
      ),
      { code: -32603 },
    );
  }
  return null;
}

/**
 * xAI frames worth acting on: live (a session/load replays stored ones) and
 * of the run's session (when they name one).
 */
function isLiveFrame(params: unknown, context: AcpExtContext) {
  if (context.replaying) {
    return false;
  }
  const sessionId = readNonEmptyString(params, "sessionId");
  return !sessionId || !context.sessionId || sessionId === context.sessionId;
}

/** Settles the user turn when `promptId` is the one Sentinel sent. */
function completeIfCurrent(
  context: AcpExtContext,
  promptId: string | null,
  completion: { agentResult: unknown; stopReason: string | null },
) {
  if (
    promptId &&
    !isGrokBackgroundPromptId(promptId) &&
    promptId === context.promptId
  ) {
    const error = grokCompletionFailure(
      completion.stopReason,
      completion.agentResult,
    );
    context.completeTurn(
      error ? { error } : { stopReason: completion.stopReason },
    );
  }
}

function onPromptComplete(params: unknown, context: AcpExtContext) {
  if (!isLiveFrame(params, context)) {
    return;
  }
  // Without a prompt id it is the run's own prompt: one prompt runs per
  // session at a time (t3code resolveXAiPromptCompletionFallback). Never
  // without a session id, which could be anyone's turn.
  const promptId =
    readNonEmptyString(params, "promptId") ??
    (context.sessionId &&
    readNonEmptyString(params, "sessionId") === context.sessionId
      ? context.promptId
      : null);
  completeIfCurrent(context, promptId, {
    agentResult: asRecord(params)?.agentResult,
    stopReason: stopReasonOf(params),
  });
}

function showSubagentFinished(update: unknown, context: AcpExtContext) {
  const childSessionId = readNonEmptyString(update, "child_session_id");
  const status = readString(update, "status");
  if (
    !childSessionId ||
    (status !== "completed" && status !== "failed" && status !== "cancelled")
  ) {
    return;
  }
  const result =
    readNonEmptyString(update, status === "completed" ? "output" : "error") ??
    "";
  context.mirror.upsertTool({
    content: result ? { text: result } : {},
    id: `grok-subagent:${childSessionId}`,
    input: {},
    kind: "subagent",
    meta: { childSessionId },
    status: status === "completed" ? "completed" : "failed",
    title: status === "cancelled" ? "Subagent cancelled" : "Subagent",
  });
  context.update();
}

/** An xAI session update (turn_completed, subagent_finished). */
function handleXaiSessionUpdate(update: unknown, context: AcpExtContext) {
  switch (readString(update, "sessionUpdate")) {
    case "turn_completed":
      // Always with a prompt id: a turn_completed never settles by session.
      completeIfCurrent(
        context,
        readNonEmptyString(update, "prompt_id") ??
          readNonEmptyString(update, "promptId"),
        {
          agentResult:
            asRecord(update)?.agent_result ?? asRecord(update)?.agentResult,
          stopReason: stopReasonOf(update),
        },
      );
      return true;
    case "subagent_finished":
      showSubagentFinished(update, context);
      return true;
    default:
      return false;
  }
}

function onSessionNotification(params: unknown, context: AcpExtContext) {
  if (isLiveFrame(params, context)) {
    handleXaiSessionUpdate(readRecord(params, "update"), context);
  }
}

function taskStatus(snapshot: unknown, completed: boolean) {
  const status = readString(snapshot, "status")?.toLowerCase();
  const exitCode = readNumber(snapshot, "exit_code");
  if (
    status === "failed" ||
    status === "error" ||
    status === "killed" ||
    status === "stopped" ||
    status === "cancelled" ||
    (exitCode !== null && exitCode !== 0)
  ) {
    return "failed" as const;
  }
  return completed ? ("completed" as const) : ("in_progress" as const);
}

/**
 * A task lifecycle frame (t3code xAiBackgroundTaskLifecycleMutation): the
 * snapshot's fields first, then the update's, the tool call id last.
 */
export function readGrokTask(params: unknown) {
  const update = readRecord(params, "update") ?? asRecord(params);
  const snapshot =
    readRecord(update, "task_snapshot") ?? readRecord(update, "task");
  const field = (...keys: string[]) => {
    for (const source of [snapshot, update]) {
      for (const key of keys) {
        const value = readNonEmptyString(source, key);
        if (value) {
          return value;
        }
      }
    }
    return null;
  };
  const taskId =
    field("task_id", "taskId") ??
    readNonEmptyString(update, "tool_call_id") ??
    readNonEmptyString(update, "toolCallId");
  return taskId
    ? {
        command: field("command"),
        output: field("output"),
        snapshot: snapshot ?? update,
        taskId,
      }
    : null;
}

const taskHoldId = (taskId: string) => `grok-task:${taskId}`;

/** x.ai/task_backgrounded and x.ai/task_completed: a background command. */
function onBackgroundTask(completed: boolean): AcpExtNotificationHandler {
  return (params, context) => {
    if (!isLiveFrame(params, context)) {
      return;
    }
    const task = readGrokTask(params);
    if (!task) {
      return;
    }
    const { command, output, taskId } = task;
    // An idle reap would kill the task: the pool entry stays until it ends.
    if (completed) {
      context.releaseProcess(taskHoldId(taskId));
    } else {
      context.holdProcess(taskHoldId(taskId));
    }
    context.mirror.upsertTool({
      ...(output ? { content: { text: output } } : {}),
      id: `grok-task:${taskId}`,
      input: { ...(command ? { command } : {}), runInBackground: true },
      kind: "execute",
      meta: { background: true, taskId },
      status: taskStatus(task.snapshot, completed),
      title: command
        ? `Background: ${command.split("\n")[0]!.slice(0, 200)}`
        : "Background task",
    });
    context.update();
  };
}

/** A task frame between turns: only its hold changes. */
function onIdleBackgroundTask(
  completed: boolean,
): NonNullable<AcpAgentDescriptor["idleNotifications"]>[string] {
  return (params, context) => {
    const task = readGrokTask(params);
    if (!task) {
      return;
    }
    context.log("grok_idle_background_task", {
      completed,
      taskId: task.taskId,
    });
    if (completed) {
      context.releaseProcess(taskHoldId(task.taskId));
    } else {
      context.holdProcess(taskHoldId(task.taskId));
    }
  };
}

type GrokRunState = {
  /** The last plan.md written this turn (exit_plan_mode's fallback). */
  planFile: string | null;
  /** Text of background wake turns, per prompt id. */
  wakeText: Map<string, string>;
};

const runStates = new WeakMap<ExternalAssistantMirror, GrokRunState>();

function runState(context: Pick<AcpExtContext, "mirror">) {
  let state = runStates.get(context.mirror);
  if (!state) {
    state = { planFile: null, wakeText: new Map() };
    runStates.set(context.mirror, state);
  }
  return state;
}

function normalizeFsPath(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

const CANONICAL_GROK_SESSION_PLAN =
  /^(?:\/home\/[^/]+|\/Users\/[^/]+|[a-zA-Z]:\/Users\/[^/]+)\/\.grok\/sessions\/(?:[^/]+\/)+plan\.md$/;

/**
 * Grok's session plan file, `<home>/.grok/sessions/<cwd>/<id>/plan.md` or
 * `$GROK_HOME/sessions/…/plan.md` (t3code isGrokPlanMarkdownPath). A
 * workspace file named plan.md (docs/plan.md, a repo-local .grok/) is not.
 */
export function isGrokPlanPath(
  filePath: string | null | undefined,
  env: Record<string, string | undefined>,
) {
  if (typeof filePath !== "string") {
    return false;
  }
  const normalized = normalizeFsPath(filePath);
  const win32 = process.platform === "win32";
  const haystack = win32 ? normalized.toLowerCase() : normalized;
  if (!haystack.endsWith("/plan.md") || normalized.split("/").includes("..")) {
    return false;
  }
  const prefixes = new Set<string>();
  for (const home of [os.homedir(), "~", env.HOME, env.USERPROFILE]) {
    const root = home ? normalizeFsPath(home) : "";
    if (root) prefixes.add(`${root}/.grok/sessions/`);
  }
  const grokHome = env.GROK_HOME ? normalizeFsPath(env.GROK_HOME) : "";
  if (grokHome) {
    prefixes.add(`${grokHome}/sessions/`);
    prefixes.add(`${grokHome}/.grok/sessions/`);
  }
  for (const prefix of prefixes) {
    const needle = win32 ? prefix.toLowerCase() : prefix;
    if (!haystack.startsWith(needle)) {
      continue;
    }
    // <prefix><encoded-cwd>/<session-id>/plan.md: never the prefix's own.
    const rest = haystack.slice(needle.length);
    if (rest !== "plan.md") {
      return true;
    }
  }
  return new RegExp(CANONICAL_GROK_SESSION_PLAN.source, win32 ? "i" : "").test(
    haystack,
  );
}

/**
 * The plan text a tool call writes to Grok's plan file (t3code
 * extractGrokPlanMarkdownFromToolCallData): a raw write, else a diff.
 */
export function readGrokPlanWrite(
  update: unknown,
  env: Record<string, string | undefined>,
) {
  const rawInput = readRecord(update, "rawInput");
  const rawPath =
    readString(rawInput, "file_path") ?? readString(rawInput, "path");
  const rawContent = readString(rawInput, "content");
  if (rawContent !== null && isGrokPlanPath(rawPath, env)) {
    return rawContent;
  }
  for (const entry of readArray(update, "content") ?? []) {
    const text = readString(entry, "newText");
    if (
      readString(entry, "type") === "diff" &&
      text !== null &&
      isGrokPlanPath(readString(entry, "path"), env)
    ) {
      return text;
    }
  }
  return null;
}

function sniffPlanFile(update: unknown, context: AcpExtContext) {
  const text = readGrokPlanWrite(update, context.env);
  if (text?.trim()) {
    runState(context).planFile = text;
  }
}

/** A background wake turn's frames: one update card, never the reply. */
function showWakeUpdate(
  promptId: string,
  update: AcpSessionUpdateEnvelope["update"],
  context: AcpExtContext,
) {
  if (update.sessionUpdate !== "agent_message_chunk") {
    return;
  }
  const text = readString(readRecord(update, "content"), "text");
  if (!text) {
    return;
  }
  const state = runState(context);
  const combined = `${state.wakeText.get(promptId) ?? ""}${text}`;
  state.wakeText.set(promptId, combined);
  context.mirror.upsertTool({
    content: { text: combined },
    id: `grok-wake:${promptId}`,
    input: {},
    kind: "other",
    meta: { background: true, promptId },
    status: "completed",
    title: "Background task update",
    toolName: "grok_background_update",
  });
}

export function interceptGrokSessionUpdate(
  envelope: AcpSessionUpdateEnvelope,
  context: AcpExtContext,
) {
  const promptId = envelope.meta?.promptId;
  if (isGrokBackgroundPromptId(promptId)) {
    showWakeUpdate(promptId as string, envelope.update, context);
    return true;
  }
  if (handleXaiSessionUpdate(envelope.update, context)) {
    return true;
  }
  const kind = envelope.update.sessionUpdate;
  if (kind === "tool_call" || kind === "tool_call_update") {
    sniffPlanFile(envelope.update, context);
  }
  return false;
}

// --- Plan mode and questions --------------------------------------------------

/** xAI requests come bare or wrapped as `{method, params}`. */
function unwrap(params: unknown) {
  const inner = readRecord(params, "params");
  return inner && readString(params, "method") ? inner : params;
}

function planTitle(markdown: string) {
  const heading = markdown.match(/^\s*#{1,3}\s+(.+?)\s*$/m)?.[1];
  return heading && heading.toLowerCase() !== "plan" ? heading : "Grok plan";
}

/**
 * x.ai/exit_plan_mode: the plan becomes Sentinel's plan card and Grok's own
 * approval gate is abandoned, so the turn ends and the user decides from the
 * card (t3code makeXAiExitPlanModeCapturedResponse).
 */
export function captureGrokPlan(params: unknown, context: AcpExtContext) {
  const request = unwrap(params);
  const toolCallId =
    readNonEmptyString(request, "toolCallId") ?? `grok-plan-${Date.now()}`;
  const markdown =
    readString(request, "planContent")?.trim() ||
    runState(context).planFile?.trim() ||
    EMPTY_PLAN;
  context.mirror.upsertTool({
    id: `plan:${toolCallId}`,
    input: {},
    kind: "plan",
    output: buildPlanOutput({
      document: markdown,
      goal: "Grok proposed a plan.",
      tasks: [],
      title: planTitle(markdown),
    }),
    status: "completed",
    toolName: "create_plan",
  });
  context.update();
  return {
    feedback:
      "Sentinel captured your proposed plan. Stop here and wait for the user's feedback or implementation request in a later turn.",
    outcome: "abandoned",
  };
}

/** `text`: Grok's question verbatim, the key its answers go back under. */
type GrokQuestion = ExternalQuestion & { text: string };

export function readGrokQuestions(params: unknown): GrokQuestion[] {
  return (readArray(unwrap(params), "questions") ?? []).flatMap(
    (raw, index) => {
      const text = readString(raw, "question");
      if (!text?.trim()) {
        return [];
      }
      return [
        {
          id: readNonEmptyString(raw, "id") ?? `question-${index + 1}`,
          multiSelect: raw != null && asRecord(raw)?.multiSelect === true,
          // Grok answers by label: the label is the option id.
          options: (readArray(raw, "options") ?? []).flatMap((option) => {
            const label = readNonEmptyString(option, "label")?.trim();
            const description = readNonEmptyString(option, "description");
            return label
              ? [{ id: label, label, ...(description ? { description } : {}) }]
              : [];
          }),
          question: text.trim(),
          text,
        },
      ];
    },
  );
}

/**
 * The accepted answer: `{answers: {[questionText]: labels}}`, free text as
 * "Other" with the text in `annotations[question].notes` (t3code
 * makeXAiAskUserQuestionResponse).
 */
export function toGrokAnswers(
  questions: readonly GrokQuestion[],
  response: ExternalQuestionResponse,
) {
  const answers: Record<string, string[]> = {};
  const annotations: Record<string, { notes: string }> = {};
  for (const question of questions) {
    const answer = response.answers.find(
      (entry) => entry.questionId === question.id,
    );
    const labels = (answer?.selectedOptionIds ?? []).filter((id) =>
      question.options.some((option) => option.id === id),
    );
    const notes = answer?.text?.trim();
    if (labels.length === 0 && !notes) {
      continue;
    }
    answers[question.text] = labels.length > 0 ? labels : ["Other"];
    if (notes) {
      annotations[question.text] = { notes };
    }
  }
  const extra = response.additionalContext?.trim();
  const last = questions.at(-1);
  if (extra && last) {
    answers[last.text] ??= ["Other"];
    annotations[last.text] = {
      notes: [annotations[last.text]?.notes, extra].filter(Boolean).join("\n"),
    };
  }
  return {
    answers,
    ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    outcome: "accepted",
  };
}

export const answerGrokQuestions: AcpExtRequestHandler = async (
  params,
  context,
) => {
  const questions = readGrokQuestions(params);
  if (questions.length === 0) {
    return { outcome: "cancelled" };
  }
  const response = await context.askUser({
    questions: questions.map(({ text: _text, ...question }) => question),
    title: "Grok has a question",
    toolCallId:
      readNonEmptyString(unwrap(params), "toolCallId") ??
      `grok-question-${Date.now()}`,
  });
  return response
    ? toGrokAnswers(questions, response)
    : { outcome: "cancelled" };
};

// --- Approvals and errors ----------------------------------------------------

/**
 * The options Grok's answers honour (t3code grokApprovalOptions): allow
 * once, decline, and "allow all edits this session"; Grok's other
 * always-allow rows save a project-wide grant that outlives the session.
 */
export function grokPermissionOptions(
  options: readonly AcpPermissionOptionInfo[],
) {
  return options.filter(
    (option) =>
      option.kind === "allow_once" ||
      option.kind === "reject_once" ||
      (option.kind === "allow_always" &&
        option.optionId.trim() === ALLOW_EDITS_SESSION_OPTION_ID),
  );
}

/**
 * Grok applies its own permission mode (a launch flag) and asks only about
 * what that mode did not allow, so every request goes to the user (Auto
 * included), except under full access.
 */
export function grokPermissionDisposition(input: PermissionDispositionInput) {
  return input.permissionMode === "full"
    ? null
    : resolvePermissionDisposition({
        ...input,
        kind: "other",
        permissionMode: "default",
      });
}

export function grokPromptErrorMessage(error: unknown) {
  if (getRpcErrorCode(error) !== GROK_RATE_LIMIT_CODE) {
    return null;
  }
  const retryAfter = readNumber(
    readRecord(asRecord(error), "data"),
    "retryAfterSeconds",
  );
  const detail = getErrorMessage(error);
  return `Grok usage limit reached${detail ? `: ${detail}` : ""}.${
    retryAfter && retryAfter > 0
      ? ` Try again in ${Math.ceil(retryAfter / 60)} min.`
      : " Try again later."
  }`;
}

function both<T>(names: readonly string[], handler: T) {
  return Object.fromEntries(names.map((name) => [name, handler])) as Record<
    string,
    T
  >;
}

export const grokAcpAgent: AcpAgentDescriptor = {
  auth: {
    headless: true,
    loginHint: (binaryPath) =>
      `run \`${binaryPath ? path.basename(binaryPath) : "grok"} login\` in a terminal, or set ${GROK_API_KEY_ENV} on the instance`,
    methodId: (_methods, context) =>
      context?.env[GROK_API_KEY_ENV]?.trim()
        ? GROK_API_KEY_METHOD_ID
        : GROK_CACHED_TOKEN_METHOD_ID,
    strategy: "lazy",
  },
  cancelGraceMs: 5_000,
  cancelMeta: { cancelTrigger: "ctrl_c" },
  driver: "grok",
  extNotifications: {
    ...both(xai("session/prompt_complete"), onPromptComplete),
    ...both(
      [...xai("session_notification"), "_x.ai/session/update"],
      onSessionNotification,
    ),
    ...both(xai("task_backgrounded"), onBackgroundTask(false)),
    ...both(xai("task_completed"), onBackgroundTask(true)),
  },
  extRequests: {
    ...both<AcpExtRequestHandler>(
      xai("exit_plan_mode"),
      async (params, context) => captureGrokPlan(params, context),
    ),
    ...both(xai("ask_user_question"), answerGrokQuestions),
  },
  idleNotifications: {
    ...both(xai("task_backgrounded"), onIdleBackgroundTask(false)),
    ...both(xai("task_completed"), onIdleBackgroundTask(true)),
  },
  fallbackModels: [
    { id: GROK_DEFAULT_MODEL_ID, isDefault: true, name: "Grok Build" },
  ],
  forceImagePrompts: true,
  id: "grok",
  initializeMeta: { clientType: "extension" },
  interceptSessionUpdate: interceptGrokSessionUpdate,
  invalidate: () => resolutions.clear(),
  label: "Grok",
  launchArgs: grokLaunchArgs("default"),
  launchArgsFor: ({ permissionMode }) => grokLaunchArgs(permissionMode),
  permissionDisposition: grokPermissionDisposition,
  permissionModes: DRIVER_CATALOG.grok.capabilities.permissionModes,
  permissionOptions: grokPermissionOptions,
  planMode: "preamble",
  probe: {
    // Grok lists its models on initialize; nothing else is asked.
    listModels: async (process) =>
      readGrokInitializeModels(process.initializeResult),
    timeoutMs: 8_000,
  },
  processLabel: "Grok Build",
  promptErrorMessage: grokPromptErrorMessage,
  promptMeta: ({ promptId }) => ({ promptId, requestId: randomUUID() }),
  resolveBinary: resolveGrokBinary,
  session: { prefer: "load" },
  stopStrategy: "kill",
  toolPrefix: "grok_",
};
