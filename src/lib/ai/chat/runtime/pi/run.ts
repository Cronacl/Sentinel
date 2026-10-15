import "server-only";

import { fileURLToPath } from "node:url";

import { generateId } from "ai";

import { DRIVER_CATALOG } from "@/lib/ai/chat/engines/catalog";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import { resolvePiBinary } from "@/lib/ai/chat/engines/pi/binary";
import {
  parsePiCompactCommand,
  readPiCommands,
} from "@/lib/ai/chat/engines/pi/commands";
import { ensurePiExtension } from "@/lib/ai/chat/engines/pi/extension";
import {
  buildPiLaunch,
  getPiProcessPool,
  piLaunchFingerprint,
  piPoolKey,
  startPiProcess,
  type PiLaunch,
} from "@/lib/ai/chat/engines/pi/launch";
import {
  clampPiThinkingLevel,
  parsePiModelSlug,
  piLevelFromEffort,
  piModelSlug,
  readPiModels,
  supportedPiThinkingLevels,
} from "@/lib/ai/chat/engines/pi/models";
import { PI_LOGIN_HINT } from "@/lib/ai/chat/engines/pi/probe";
import {
  cancelUnclaimedPiDialog,
  PiRpcCancelledError,
  PiRpcError,
  PiRpcTimeoutError,
  type PiRpcEvent,
  type PiRpcProcess,
} from "@/lib/ai/chat/engines/pi/rpc";
import type { LoadedEngineThread } from "@/lib/ai/chat/engines/platform/driver";
import type { PiThreadState } from "@/lib/ai/chat/engines/state/pi";
import { getDriverThreadState } from "@/lib/ai/chat/engines/state/registry";
import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import { createLogger } from "@/lib/logger";
import { normalizeThreadMode } from "@/lib/plan";
import { resolveSupportedPermissionMode } from "@/lib/security";
import { streamContext } from "@/lib/streams";
import type { PermissionMode } from "@/server/db/enums";

import { ThreadChatConflictError } from "../../errors";
import * as persist from "../../persistence";
import { getThreadCheckpointAnchorMessageId } from "../../repo/checkpoints";
import type { ThreadChatRequest } from "../../types";
import { MISSED_TURNS_HEADING, planAcpHistory } from "../acp/history";
import { buildAcpPromptBlocks } from "../acp/prompt";
import { resolveThreadEngineInstance } from "../engine-instance";
import { createMirrorEmitter } from "../external/emitter";
import { finishExternalRun } from "../external/lifecycle";
import { createAssistantMirror } from "../external/mirror";
import {
  beginExternalRuntimeRepoCheckpoint,
  buildExternalRuntimePromptText,
} from "../external-runtime";
import {
  createThreadEventChannel,
  emitLatestThreadSnapshot,
} from "../thread-chat/run-state";
import {
  buildActiveThreadMessages,
  buildFirstUserMessageTitle,
  buildModelTranscript,
  getFirstUserText,
  getUserParentMessageId,
  truncateTranscriptAtMessage,
} from "../transcript";
import { getToolPermissionMode, getWorkspaceRootPath } from "../workspace";
import {
  cancelPendingInteractions,
  persistAssistantMessage,
  setStatusLabel,
  type PiRunControl,
} from "./control";
import { applyPiEvent, createPiTurnTracker, piTurnOutcome } from "./events";
import {
  handlePiUiRequest,
  sessionGrants,
  toPiInteractionAnswer,
} from "./interactions";
import {
  cancelPiIdleCheck,
  PI_SETTLE_TIMINGS,
  settleWhenPiIdle,
} from "./settle";
import { activePiRunControls, resolveActivePiRunControl } from "./state";

// One thread turn on Pi (`pi --mode rpc`, design acp-and-agents §4). The
// process lives per (instance, thread) in the process pool and keeps its
// session between turns; a new process resumes the thread's session by its
// file (`switch_session`), else starts a new one that gets the transcript.
// Turns the session missed (another engine answered, a failed turn) are sent
// with the prompt, and a thread that no longer holds the session's last turn
// (an edit, a checkpoint restore) gets a new session (runtime/acp/
// history.ts). Events stream into the shared mirror; Sentinel's extension
// asks before every tool call (interactions.ts); the turn ends when Pi says
// it settled and is idle (settle.ts). Stop sends `abort`.

const log = createLogger("ThreadChatPi");

const LABEL = "Pi";
const COMPACT_TIMEOUT_MS = 5 * 60 * 1_000;
const INTERRUPTED_TOOL_MESSAGE = "Interrupted";
const DANGLING_TOOL_MESSAGE = "Tool did not report completion";
const LIVE_SESSION_KEY = "sentinel.sessionPath";
const MODELS_KEY = "sentinel.models";
const GATE_KEY = "sentinel.gateLoaded";
/** Pi's own model and thinking level in this session, before Sentinel set any. */
const BASELINE_KEY = "sentinel.baseline";
const APPLIED_MODEL_KEY = "sentinel.appliedModel";
const APPLIED_THINKING_KEY = "sentinel.appliedThinking";

type PiBaseline = {
  model: { modelId: string; provider: string } | null;
  thinkingLevel: string | null;
};

export const PI_GATE_MISSING_MESSAGE =
  "Sentinel's Pi extension did not load, so Pi cannot ask before it runs tools. Check that the instance's launch arguments do not disable extensions, or switch this thread to full access.";

function readThreadState(
  thread: LoadedEngineThread,
  instance: ResolvedEngineInstance,
): PiThreadState | null {
  return getDriverThreadState("pi", thread?.chatEngineState, instance);
}

function writeThreadState(control: PiRunControl, state: PiThreadState) {
  persist.updateDriverThreadState(
    control.threadId,
    "pi",
    state,
    control.instance,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function messageText(message: ThreadUIMessage | null) {
  return (message?.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

function addNotice(
  control: PiRunControl,
  id: string,
  title: string,
  severity: "error" | "info" | "warning" = "warning",
  description: string | null = null,
) {
  control.mirror.upsertTool({
    id: `notice-${id}`,
    input: {},
    kind: "notice",
    meta: { severity },
    output: { description, severity, title },
    status: "completed",
    title,
  });
}

/** Errors that end the turn even during best-effort setup steps. */
function rethrowIfFatal(control: PiRunControl, error: unknown) {
  if (
    control.process?.exitError() ||
    control.abort.signal.aborted ||
    error instanceof PiRpcCancelledError ||
    error instanceof PiRpcTimeoutError
  ) {
    throw error;
  }
}

async function finishRun(
  control: PiRunControl,
  input: {
    errorMessage?: string | null;
    finishReason?: string | null;
    status: "cancelled" | "completed" | "error";
  },
) {
  if (control.finished) {
    return;
  }
  // The final message is persisted below; nothing may flush after it.
  control.emitter.close();
  cancelPendingInteractions(control);
  control.mirror.closeOpenSegments();
  control.mirror.finishDanglingTools(
    input.status === "completed"
      ? DANGLING_TOOL_MESSAGE
      : INTERRUPTED_TOOL_MESSAGE,
  );
  await finishExternalRun(control, {
    errorMessage: input.errorMessage,
    failureMessage: `${LABEL} run failed.`,
    finishReason: input.finishReason,
    persistMessage: (metadata) =>
      persistAssistantMessage(control, metadata.status, {
        errorMessage: metadata.errorMessage,
        finishReason: metadata.finishReason,
        repoCheckpointId: metadata.repoCheckpointId,
        statusLabel: metadata.statusLabel,
      }),
    status: input.status,
    statusLabel: null,
  });
  activePiRunControls.delete(control.runId);
  // Nothing waits on Pi any more (a Stop that ended the process).
  control.settle.resolve();
  control.detach?.();
  control.detach = null;
  control.lease?.release();
  control.lease = null;
}

/** The process died or broke: drop it so the next turn starts a fresh one. */
async function evictProcess(control: PiRunControl) {
  if (!control.process) {
    return;
  }
  control.lease?.release();
  control.lease = null;
  await getPiProcessPool()
    .dispose(control.poolKey)
    .catch(() => undefined);
}

async function acquireProcess(control: PiRunControl, launch: PiLaunch) {
  const pool = getPiProcessPool();
  const fingerprint = piLaunchFingerprint(launch);
  const create = async () =>
    startPiProcess(launch, { instanceId: control.instance.id });
  let lease = await pool.acquire(control.poolKey, fingerprint, create);
  if (!lease.resource.isAlive()) {
    // It died while idle: replace it.
    lease.release();
    await pool.dispose(control.poolKey);
    lease = await pool.acquire(control.poolKey, fingerprint, create);
  }
  return lease;
}

function handleEvent(
  control: PiRunControl,
  process: PiRpcProcess,
  event: PiRpcEvent,
) {
  if (control.finished) {
    // A dialog after the turn ended: nobody will answer it.
    cancelUnclaimedPiDialog(process, event);
    return;
  }
  if (event.type === "extension_ui_request") {
    void handlePiUiRequest(control, process, event).catch((error: unknown) =>
      log.warn("pi_ui_request_failed", { error, runId: control.runId }),
    );
    return;
  }
  const effect = applyPiEvent(control.mirror, control.tracker, event);
  switch (effect.type) {
    case "flush":
      control.emitter.flush();
      break;
    case "schedule":
      control.emitter.schedule();
      break;
    case "started":
      cancelPiIdleCheck(control);
      break;
    case "ended":
      // Pi 0.80.x never sends agent_settled.
      void settleWhenPiIdle(control, process, {
        delayMs: PI_SETTLE_TIMINGS.afterEndMs,
        onBroken: () => evictProcess(control),
      });
      break;
    case "settled":
      void settleWhenPiIdle(control, process, {
        delayMs: 0,
        onBroken: () => evictProcess(control),
      });
      break;
    default:
      break;
  }
}

/** The models Pi lists, asked once per process. */
async function listModels(control: PiRunControl, process: PiRpcProcess) {
  const cached = process.state.get(MODELS_KEY) as unknown[] | undefined;
  if (cached) {
    return cached;
  }
  const models = readPiModels(
    await process.request(
      "get_available_models",
      {},
      { signal: control.abort.signal },
    ),
  );
  process.state.set(MODELS_KEY, models);
  return models;
}

/** Continues the thread's session, or starts one; true when it holds the history. */
async function openSession(
  control: PiRunControl,
  process: PiRpcProcess,
  input: { diverged: boolean; state: PiThreadState | null },
) {
  const signal = control.abort.signal;
  const live = process.state.get(LIVE_SESSION_KEY) as string | undefined;
  const wanted = input.diverged ? null : (input.state?.sessionPath ?? null);

  if (wanted && live === wanted) {
    return true;
  }
  // Another session brings its own model: nothing set before applies.
  for (const key of [BASELINE_KEY, APPLIED_MODEL_KEY, APPLIED_THINKING_KEY]) {
    process.state.delete(key);
  }
  if (wanted) {
    try {
      const result = await process.request<{ cancelled?: boolean }>(
        "switch_session",
        { sessionPath: wanted },
        { signal },
      );
      if (result?.cancelled !== true) {
        return true;
      }
      log.info("pi_session_switch_cancelled", { runId: control.runId });
    } catch (error) {
      rethrowIfFatal(control, error);
      log.info("pi_session_not_continued", {
        error: errorMessage(error),
        runId: control.runId,
      });
    }
  }
  // A fresh process already runs a new session; a reused one (or one whose
  // switch failed after loading something) starts another.
  if (live !== undefined || wanted) {
    const result = await process.request<{ cancelled?: boolean }>(
      "new_session",
      {},
      { signal },
    );
    if (result?.cancelled === true) {
      throw new Error("A Pi extension refused to start a new session.");
    }
  }
  return false;
}

/** The session's model and thinking level, kept until Sentinel sets either. */
function captureBaseline(
  process: PiRpcProcess,
  session: Record<string, unknown> | null | undefined,
): PiBaseline {
  const known = process.state.get(BASELINE_KEY) as PiBaseline | undefined;
  const baseline: PiBaseline = {
    model: known?.model ?? null,
    thinkingLevel: known?.thinkingLevel ?? null,
  };
  if (!baseline.model && process.state.get(APPLIED_MODEL_KEY) !== true) {
    baseline.model = parsePiModelSlug(piModelSlug(session?.model));
  }
  if (
    !baseline.thinkingLevel &&
    process.state.get(APPLIED_THINKING_KEY) !== true &&
    typeof session?.thinkingLevel === "string"
  ) {
    baseline.thinkingLevel = session.thinkingLevel;
  }
  process.state.set(BASELINE_KEY, baseline);
  return baseline;
}

type PreparedTurn = {
  baseState: PiThreadState;
  compact: { customInstructions?: string } | null;
  images: Array<{ data: string; mimeType: string; type: "image" }>;
  process: PiRpcProcess;
  text: string;
};

async function startTurn(
  control: PiRunControl,
  input: {
    message: ThreadUIMessage | null;
    modelTranscript: ThreadUIMessage[];
    request: ThreadChatRequest;
    state: PiThreadState | null;
  },
): Promise<PreparedTurn> {
  const { instance } = control;
  const signal = control.abort.signal;
  const resolution = await resolvePiBinary(instance);
  if (!resolution.binary) {
    throw new Error(resolution.error);
  }
  const extensionPath = await ensurePiExtension(instance.stateDir);
  const launch = buildPiLaunch({
    binary: resolution.binary,
    cwd: control.workspaceRoot,
    extensionPath,
    instance,
  });
  control.lease = await acquireProcess(control, launch);
  const process = control.lease.resource;
  control.process = process;
  control.detach = process.attach({
    onEvent: (event) => handleEvent(control, process, event),
    // A crash rejects the request in flight; a crash mid-run ends the wait.
    onExit: () => control.settle.resolve(),
  });

  setStatusLabel(control, `Starting ${LABEL} session...`);
  const history = planAcpHistory({
    currentMessageId: input.message?.id ?? null,
    state: input.state
      ? {
          historyDelivered: input.state.historyDelivered,
          sessionId: input.state.sessionPath,
          syncedMessageId: input.state.syncedMessageId,
        }
      : null,
    transcript: input.modelTranscript,
  });
  const continued = await openSession(control, process, {
    diverged: history.type === "diverged",
    state: input.state,
  });

  const session = await process.request<Record<string, unknown>>(
    "get_state",
    {},
    { signal },
  );
  const sessionPath =
    (typeof session?.sessionFile === "string" && session.sessionFile) ||
    `pi-session:${String(session?.sessionId ?? control.runId)}`;
  if (process.state.get(LIVE_SESSION_KEY) !== sessionPath) {
    // Approvals "for this session" end with it.
    sessionGrants(process).clear();
  }
  process.state.set(LIVE_SESSION_KEY, sessionPath);

  // Without Sentinel's extension Pi would run every tool unasked.
  if (control.permissionMode !== "full" || !control.toolsEnabled) {
    if (process.state.get(GATE_KEY) !== true) {
      const commands = readPiCommands(
        await process.request("get_commands", {}, { signal }),
      );
      if (!commands.gateLoaded) {
        throw new Error(PI_GATE_MISSING_MESSAGE);
      }
      process.state.set(GATE_KEY, true);
    }
  }

  // Model and thinking level are best effort: a value Pi refuses leaves the
  // turn on Pi's current setting instead of failing it. Going back to "Pi
  // default" replays what the session had before Sentinel set anything
  // (t3code adapter.ts applySelection, MIT).
  const baseline = captureBaseline(process, session);
  const requestedSlug = input.request.modelId ?? null;
  let model: unknown = session?.model ?? null;
  const target = parsePiModelSlug(requestedSlug);
  const restoreModel =
    !target && process.state.get(APPLIED_MODEL_KEY) === true
      ? baseline.model
      : null;
  if ((target && piModelSlug(model) !== requestedSlug) || restoreModel) {
    try {
      model = await process.request("set_model", target ?? restoreModel!, {
        signal,
      });
      process.state.set(APPLIED_MODEL_KEY, target !== null);
    } catch (error) {
      rethrowIfFatal(control, error);
      addNotice(
        control,
        "model",
        `${LABEL} kept its current model: ${errorMessage(error)}`,
      );
    }
  }
  let thinkingLevel =
    typeof session?.thinkingLevel === "string" ? session.thinkingLevel : null;
  const requestedLevel = piLevelFromEffort(input.request.reasoningEffort);
  const restoreLevel =
    !target &&
    !requestedLevel &&
    process.state.get(APPLIED_THINKING_KEY) === true
      ? baseline.thinkingLevel
      : null;
  if (requestedLevel || restoreLevel) {
    try {
      let level = restoreLevel;
      if (requestedLevel) {
        const known =
          (await listModels(control, process)).find(
            (entry) => piModelSlug(entry) === piModelSlug(model),
          ) ?? model;
        level = clampPiThinkingLevel(
          requestedLevel,
          supportedPiThinkingLevels(known),
        );
      }
      if (level && level !== thinkingLevel) {
        await process.request("set_thinking_level", { level }, { signal });
        thinkingLevel = level;
      }
      process.state.set(APPLIED_THINKING_KEY, requestedLevel !== null);
    } catch (error) {
      rethrowIfFatal(control, error);
      addNotice(
        control,
        "thinking",
        `${LABEL} kept its thinking level: ${errorMessage(error)}`,
      );
    }
  }

  // What the session lacks: everything for a new session, else the turns
  // the history plan found.
  const historyMessages = !continued
    ? input.modelTranscript
    : history.type === "full"
      ? input.modelTranscript
      : history.type === "since"
        ? history.messages
        : [];
  const sendsMissedTurns = continued && history.type === "since";
  const baseState: PiThreadState = {
    cwd: control.workspaceRoot,
    historyDelivered: continued
      ? (input.state?.historyDelivered ?? null)
      : false,
    modelId: requestedSlug,
    sessionPath,
    syncedMessageId: continued ? (input.state?.syncedMessageId ?? null) : null,
    thinkingLevel,
  };
  writeThreadState(control, baseState);

  const compact = parsePiCompactCommand(messageText(input.message));
  const promptMessage =
    input.message ??
    ({
      id: control.threadId,
      metadata: {},
      parts: [{ text: "", type: "text" }],
      role: "user",
    } satisfies ThreadUIMessage);
  const blocks = await buildAcpPromptBlocks({
    capabilities: { embeddedContext: true, imagePrompts: true },
    message: input.message,
    text: buildExternalRuntimePromptText({
      ...(sendsMissedTurns ? { historyHeading: MISSED_TURNS_HEADING } : {}),
      includeHistory: historyMessages.length > 0,
      message: promptMessage,
      planPreamble: false,
      threadMode: control.threadMode,
      transcript: historyMessages,
      workspaceRoot: control.workspaceRoot,
    }),
  });
  const texts: string[] = [];
  const images: PreparedTurn["images"] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      texts.push(block.text);
    } else if ("data" in block) {
      // Pi's RPC takes images only, so audio attachments are left out.
      if (block.type === "image") {
        images.push({
          data: block.data,
          mimeType: block.mimeType,
          type: "image",
        });
      }
    } else if (block.type === "resource") {
      texts.push(
        `Attached file ${block.resource.uri}:\n\n${block.resource.text}`,
      );
    } else {
      const file = block.uri.startsWith("file:")
        ? fileURLToPath(block.uri)
        : block.uri;
      texts.push(`Attached file: ${file}`);
    }
  }

  setStatusLabel(control, null);
  return { baseState, compact, images, process, text: texts.join("\n\n") };
}

function markSynced(control: PiRunControl, turn: PreparedTurn) {
  // The session now holds this turn and everything before it.
  writeThreadState(control, {
    ...turn.baseState,
    historyDelivered: true,
    syncedMessageId: control.assistantId,
  });
}

async function runCompact(control: PiRunControl, turn: PreparedTurn) {
  persist.setThreadStatus(control.threadId, "streaming");
  try {
    await turn.process.request("compact", turn.compact ?? {}, {
      signal: control.abort.signal,
      timeoutMs: COMPACT_TIMEOUT_MS,
    });
    markSynced(control, turn);
    await finishRun(control, { finishReason: "stop", status: "completed" });
  } catch (error) {
    if (control.cancelRequested) {
      await finishRun(control, {
        errorMessage: "Generation stopped.",
        status: "cancelled",
      });
      return;
    }
    await finishRun(control, {
      errorMessage: errorMessage(turn.process.exitError() ?? error),
      status: "error",
    });
  }
}

async function runPrompt(control: PiRunControl, turn: PreparedTurn) {
  const { process } = turn;
  try {
    persist.setThreadStatus(control.threadId, "streaming");
    // Pi answers only after its preflight (templates, skills, extension
    // input hooks and commands, which may open a dialog), so no timeout:
    // Stop aborts it. "steer" joins a run Pi still has going (a queued
    // continuation, detached compaction) instead of being refused.
    const answer = await process.request<{ disposition?: string }>(
      "prompt",
      {
        message: turn.text,
        streamingBehavior: "steer",
        ...(turn.images.length > 0 ? { images: turn.images } : {}),
      },
      { signal: control.abort.signal, timeoutMs: 0 },
    );
    if (answer?.disposition !== "handled") {
      // The run's events follow a "started" or "queued" answer; an answer
      // that started nothing (older builds say neither) is checked.
      if (!control.tracker.started) {
        void settleWhenPiIdle(control, process, {
          delayMs: PI_SETTLE_TIMINGS.afterPromptMs,
          onBroken: () => evictProcess(control),
        });
      }
      await control.settle.promise;
    }
    if (control.finished) {
      return;
    }
    const exited = process.exitError();
    if (exited && !control.tracker.settled) {
      throw exited;
    }
    if (
      control.tracker.started ||
      control.tracker.settled ||
      answer?.disposition === "handled"
    ) {
      markSynced(control, turn);
    }
    const outcome = piTurnOutcome(control.tracker, control.cancelRequested);
    await finishRun(control, outcome);
  } catch (error) {
    if (control.finished) {
      return;
    }
    if (control.cancelRequested) {
      await finishRun(control, {
        errorMessage: "Generation stopped.",
        status: "cancelled",
      });
      return;
    }
    const exited = process.exitError();
    if (exited || !(error instanceof PiRpcError)) {
      // Pi may still run something this turn no longer listens to.
      await evictProcess(control);
    }
    let message = errorMessage(exited ?? error);
    if (
      error instanceof PiRpcError &&
      /api key|no model|credential|login/i.test(message)
    ) {
      message = `${message}\n\n${PI_LOGIN_HINT}`;
    }
    await finishRun(control, { errorMessage: message, status: "error" });
  }
}

async function submitApproval(
  request: ThreadChatRequest,
  existingThread: LoadedEngineThread,
) {
  const latestAssistant = request.messages
    ? [...request.messages]
        .reverse()
        .find((message) => message.role === "assistant")
    : null;
  const control = resolveActivePiRunControl({
    activeRunId: existingThread?.activeStreamId ?? null,
    threadId: request.threadId,
  });
  const response = request.toolApprovalResponse;
  const interaction = response ? control?.pending.get(response.id) : undefined;
  const answer =
    interaction && response
      ? toPiInteractionAnswer(interaction.kind, response)
      : null;

  if (!control || !interaction || !answer) {
    if (latestAssistant) {
      persist.upsertMessage(request.threadId, latestAssistant);
    }
    if (
      !control &&
      (existingThread?.activeStreamId ||
        existingThread?.status === "awaiting_approval")
    ) {
      persist.clearActiveStream(request.threadId);
      persist.setThreadStatus(request.threadId, "idle");
    }
    throw new ThreadChatConflictError(
      `That ${LABEL} request is no longer active.`,
    );
  }
  interaction.settle(answer);
  return new Response(null, { status: 204 });
}

export async function runPiThreadChat(
  request: ThreadChatRequest,
  existingThread: LoadedEngineThread,
  /** The thread's engine instance (the dispatcher resolves it). */
  instanceInput?: ResolvedEngineInstance | null,
): Promise<Response> {
  if (request.trigger === "submit-tool-approval") {
    return await submitApproval(request, existingThread);
  }
  if (
    request.trigger !== "submit-user-message" &&
    request.trigger !== "edit-user-message"
  ) {
    throw new Error(
      `The ${LABEL} engine does not support "${request.trigger}".`,
    );
  }

  const instance =
    instanceInput ??
    (await resolveThreadEngineInstance(request.userId, {
      chatEngine: "pi",
      chatEngineInstanceId: existingThread?.chatEngineInstanceId ?? null,
    }));
  const workspaceRoot =
    (await getWorkspaceRootPath(
      request.workspaceId,
      request.userId,
      request.threadId,
    )) ?? process.cwd();
  const allRecords = await persist.loadThreadMessages(request.threadId);
  const transcript = truncateTranscriptAtMessage(
    buildActiveThreadMessages(allRecords),
    getThreadCheckpointAnchorMessageId(existingThread),
  );
  // Pi has no plan mode (the catalog hides it): every turn runs as chat.
  const threadMode = normalizeThreadMode(
    request.threadMode ?? existingThread?.mode,
  );
  const userParentMessageId = getUserParentMessageId(
    request,
    transcript,
    allRecords,
  );
  const fallbackTitle = buildFirstUserMessageTitle(
    getFirstUserText(request.message ? [request.message] : []),
  );
  const modelTranscript = buildModelTranscript(request, transcript, allRecords);

  await persist.ensureThread(
    request.threadId,
    request.userId,
    request.workspaceId,
    fallbackTitle,
    threadMode,
    "pi",
    undefined,
    instance.id,
  );
  if (request.message) {
    persist.upsertMessage(request.threadId, {
      ...request.message,
      metadata: mergeThreadMessageMetadata(request.message.metadata, {
        branchId: request.message.id,
        isActive: true,
        parentMessageId: userParentMessageId,
        status: "completed",
      }),
    });
  }

  const runId = generateId();
  const assistantId = generateId();
  const eventChannel = await createThreadEventChannel(runId);
  const placeholder: ThreadUIMessage = {
    id: assistantId,
    metadata: {
      branchId: assistantId,
      isActive: true,
      parentMessageId: request.message?.id ?? userParentMessageId,
      runId,
      status: "pending",
      statusLabel: `Starting ${LABEL} session...`,
    },
    parts: [{ text: " ", type: "text" }],
    role: "assistant",
  };
  persist.upsertMessage(request.threadId, placeholder);
  persist.setActiveStream(request.threadId, runId);
  persist.setThreadStatus(request.threadId, "streaming");
  await persist.updateThreadChatSettings(request.threadId, {
    engine: "pi",
    modelId: request.modelId ?? null,
    mode: threadMode,
    ...(request.modelOptions ? { modelOptions: request.modelOptions } : {}),
    reasoningEffort: request.reasoningEffort ?? null,
  });
  void beginExternalRuntimeRepoCheckpoint({
    projectPath: workspaceRoot,
    runId,
    thread: existingThread,
  });
  await emitLatestThreadSnapshot(request.threadId, eventChannel, runId);
  eventChannel.emit({ message: placeholder, runId, type: "message.upsert" });
  eventChannel.emit({ runId, type: "run.started" });

  const toolsEnabled = request.toolsEnabled !== false;
  let permissionMode: PermissionMode = "default";
  try {
    permissionMode = resolveSupportedPermissionMode(
      await getToolPermissionMode(
        request.userId,
        request.workspaceId,
        request.threadId,
      ),
      [...DRIVER_CATALOG.pi.capabilities.permissionModes] as [
        PermissionMode,
        ...PermissionMode[],
      ],
    );
  } catch (error) {
    log.warn("pi_permission_mode_failed", { error, runId });
  }

  let resolveSettle: () => void = () => {};
  const settlePromise = new Promise<void>((resolve) => {
    resolveSettle = resolve;
  });
  const control: PiRunControl = {
    abort: new AbortController(),
    assistantId,
    cancelRequested: false,
    detach: null,
    emitter: null as unknown as PiRunControl["emitter"],
    eventChannel,
    finished: false,
    instance,
    interactive: toolsEnabled && request.interactive !== false,
    lease: null,
    mirror: createAssistantMirror({
      agentLabel: instance.label || LABEL,
      toolPrefix: "pi_",
    }),
    nextInteractionId: 0,
    pending: new Map(),
    permissionMode,
    poolKey: piPoolKey(instance.id, request.threadId),
    process: null,
    promptPromise: null,
    requestedModelId: request.modelId ?? null,
    runId,
    settle: { promise: settlePromise, resolve: () => resolveSettle() },
    settleGeneration: 0,
    statusLabel: `Starting ${LABEL} session...`,
    threadId: request.threadId,
    threadMode,
    toolsEnabled,
    tracker: createPiTurnTracker(),
    userId: request.userId,
    workspaceId: request.workspaceId,
    workspaceRoot,
  };
  control.emitter = createMirrorEmitter({
    emit: (message) =>
      eventChannel.emit({ message, runId, type: "message.upsert" }),
    persist: () =>
      persistAssistantMessage(
        control,
        control.finished ? "completed" : "streaming",
      ),
  });
  activePiRunControls.set(runId, control);

  control.promptPromise = (async () => {
    let turn: PreparedTurn;
    try {
      turn = await startTurn(control, {
        message: request.message ?? null,
        modelTranscript,
        request,
        state: readThreadState(existingThread, instance),
      });
    } catch (error) {
      if (control.cancelRequested) {
        await finishRun(control, {
          errorMessage: "Generation stopped.",
          status: "cancelled",
        });
        return;
      }
      const exited = control.process?.exitError() ?? null;
      // A broken or half-started process is not reused.
      await evictProcess(control);
      await finishRun(control, {
        errorMessage: errorMessage(exited ?? error),
        status: "error",
      });
      return;
    }
    if (control.cancelRequested) {
      await finishRun(control, {
        errorMessage: "Generation stopped.",
        status: "cancelled",
      });
      return;
    }
    await (turn.compact ? runCompact(control, turn) : runPrompt(control, turn));
  })().catch((error: unknown) => {
    log.error("pi_run_crashed", { error, runId });
  });

  return new Response(await streamContext.resumeExistingStream(runId), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function waitWithTimeout(promise: Promise<unknown>, ms: number) {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    void promise.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(true);
      },
    );
  });
}

/** Stopping never needs the instance (it may no longer resolve). */
export async function stopPiThreadRun(
  request: ThreadChatRequest,
  existingThread: LoadedEngineThread,
  _instance?: ResolvedEngineInstance | null,
): Promise<Response> {
  const control = resolveActivePiRunControl({
    activeRunId: existingThread?.activeStreamId ?? null,
    threadId: request.threadId,
  });
  if (!control || control.finished) {
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    return new Response(null, { status: 204 });
  }

  control.cancelRequested = true;
  // Setup requests stop at once; a running prompt keeps its wait for Pi's
  // settle, which `abort` brings.
  control.abort.abort(new Error("Generation stopped."));
  cancelPendingInteractions(control);
  const aborted = control.process?.isAlive()
    ? control.process
        .request("abort", {}, { timeoutMs: PI_SETTLE_TIMINGS.stopGraceMs })
        .catch(() => undefined)
    : Promise.resolve();

  const settled = control.promptPromise
    ? await waitWithTimeout(
        Promise.all([aborted, control.promptPromise]),
        PI_SETTLE_TIMINGS.stopGraceMs,
      )
    : false;
  if (!settled || !control.finished) {
    // Pi ignored the abort: end the process and the turn.
    await evictProcess(control);
    await finishRun(control, {
      errorMessage: "Generation stopped.",
      status: "cancelled",
    });
  }
  return new Response(null, { status: 204 });
}
