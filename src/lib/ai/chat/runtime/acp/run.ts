import "server-only";

import { generateId } from "ai";

import { updateAcpCatalog } from "@/lib/ai/chat/engines/acp/catalog-cache";
import {
  catalogFromConfigOptions,
  isPlanModeId,
} from "@/lib/ai/chat/engines/acp/config-options";
import type { AcpAgentProcess } from "@/lib/ai/chat/engines/acp/connection";
import type { AcpAgentDescriptor } from "@/lib/ai/chat/engines/acp/descriptor";
import {
  AcpAuthRequiredError,
  AcpRequestCancelledError,
  AcpRequestTimeoutError,
  getErrorMessage,
} from "@/lib/ai/chat/engines/acp/errors";
import {
  acpLaunchFingerprint,
  acpPoolKey,
  buildAcpLaunch,
  getAcpProcessPool,
  startAcpProcess,
} from "@/lib/ai/chat/engines/acp/launch";
import { buildAcpMcpServers } from "@/lib/ai/chat/engines/acp/mcp-forwarding";
import type { AcpSessionUpdateEnvelope } from "@/lib/ai/chat/engines/acp/schema";
import {
  applyAcpModelSelection,
  applyAcpPlanMode,
  cancelAcpSession,
  forgetLiveSession,
  getLiveSession,
  initializeAcpAgent,
  openAcpSession,
  promptAcpSession,
  type AcpLiveSession,
} from "@/lib/ai/chat/engines/acp/session";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import type { LoadedEngineThread } from "@/lib/ai/chat/engines/platform/driver";
import type { AcpThreadState } from "@/lib/ai/chat/engines/state/acp";
import {
  getDriverThreadState,
  type ThreadStateDriverKind,
} from "@/lib/ai/chat/engines/state/registry";
import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import { createLogger } from "@/lib/logger";
import { createMcpOAuthProvider, requiresMcpOAuth } from "@/lib/mcp/oauth";
import { normalizeThreadMode } from "@/lib/plan";
import { resolveSupportedPermissionMode } from "@/lib/security";
import { streamContext } from "@/lib/streams";
import type { PermissionMode } from "@/server/db/enums";

import { ThreadChatConflictError } from "../../errors";
import * as persist from "../../persistence";
import { getThreadCheckpointAnchorMessageId } from "../../repo/checkpoints";
import type { ThreadChatRequest } from "../../types";
import { resolveThreadEngineInstance } from "../engine-instance";
import { applyAcpUpdate } from "../external/acp-updates";
import { createMirrorEmitter } from "../external/emitter";
import {
  finishExternalRun,
  outcomeFromStopReason,
} from "../external/lifecycle";
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
import {
  getMcpServerRuntime,
  getToolPermissionMode,
  getWorkspaceRootPath,
} from "../workspace";
import {
  cancelPendingInteractions,
  persistAssistantMessage,
  setStatusLabel,
  type AcpRunControl,
} from "./control";
import { createRunHandlers, toInteractionAnswer } from "./interactions";
import { buildAcpPromptBlocks } from "./prompt";
import { activeAcpRunControls, resolveActiveAcpRunControl } from "./state";

// One thread turn on an ACP agent (design acp-and-agents §2.3–§2.12), for
// every ACP descriptor (Cursor today). The agent process lives per
// (instance, thread) in the process pool and is reused across turns; the
// session is reused while the process lives, else loaded or resumed by its
// persisted id, else created — and only a new session gets the transcript,
// so a resumed agent never sees the history twice. Updates stream into the
// shared mirror; approvals and questions park until the user answers; Stop
// sends session/cancel (a notification) and the turn ends as cancelled.

const log = createLogger("ThreadChatAcp");

const DEFAULT_CANCEL_GRACE_MS = 5_000;
const INTERRUPTED_TOOL_MESSAGE = "Interrupted";
const DANGLING_TOOL_MESSAGE = "Tool did not report completion";

type AcpStateKind = Extract<
  ThreadStateDriverKind,
  "acp" | "antigravity" | "cursor" | "grok"
>;

function stateKindOf(descriptor: AcpAgentDescriptor): AcpStateKind {
  switch (descriptor.driver) {
    case "antigravity":
      return "antigravity";
    case "cursor":
      return "cursor";
    case "grok":
      return "grok";
    default:
      return "acp";
  }
}

function readThreadState(
  descriptor: AcpAgentDescriptor,
  thread: LoadedEngineThread,
  instance: ResolvedEngineInstance,
): AcpThreadState | null {
  return getDriverThreadState(
    stateKindOf(descriptor),
    thread?.chatEngineState,
    instance,
  );
}

function writeThreadState(control: AcpRunControl, state: AcpThreadState) {
  persist.updateDriverThreadState(
    control.threadId,
    stateKindOf(control.descriptor),
    state,
    control.instance,
  );
}

async function resolveOAuthToken(
  userId: string,
  entry: Parameters<typeof requiresMcpOAuth>[0] & { id: string },
) {
  const provider = createMcpOAuthProvider({
    redirectUrl: "http://127.0.0.1/",
    serverId: entry.id,
    userId,
  });
  const tokens = await Promise.resolve()
    .then(() => provider.tokens())
    .catch(() => undefined);
  return tokens?.access_token ?? null;
}

function learnCatalog(control: AcpRunControl, session: AcpLiveSession) {
  const models = catalogFromConfigOptions(session.configOptions);
  if (models.length === 0 && session.availableCommands.length === 0) {
    return;
  }
  void updateAcpCatalog(control.instance.stateDir, {
    ...(models.length > 0 ? { models } : {}),
    ...(session.availableCommands.length > 0
      ? { commands: session.availableCommands }
      : {}),
  }).catch((error: unknown) =>
    log.debug("acp_catalog_write_failed", {
      error,
      instanceId: control.instance.id,
    }),
  );
}

function handleSessionUpdate(
  control: AcpRunControl,
  envelope: AcpSessionUpdateEnvelope,
) {
  if (control.finished) {
    return;
  }
  if (
    control.sessionId &&
    envelope.sessionId &&
    envelope.sessionId !== control.sessionId
  ) {
    return;
  }

  const kind = envelope.update.sessionUpdate;
  const effects = applyAcpUpdate(control.mirror, envelope.update, {
    replaying: control.replaying,
  });
  const session = control.process ? getLiveSession(control.process) : null;

  for (const effect of effects) {
    switch (effect.type) {
      case "commands":
        if (session) {
          session.availableCommands = effect.commands;
        }
        void updateAcpCatalog(control.instance.stateDir, {
          commands: effect.commands,
        }).catch(() => undefined);
        break;
      case "config":
        if (session) {
          session.configOptions = effect.configOptions;
          learnCatalog(control, session);
        }
        break;
      case "mode":
        if (session?.modes) {
          session.modes.currentModeId = effect.modeId;
        }
        // The agent left plan mode on its own (an approved plan): the
        // thread follows, like Claude's ExitPlanMode.
        if (control.threadMode === "plan" && !isPlanModeId(effect.modeId)) {
          control.threadMode = "chat";
          void persist.updateThreadChatSettings(control.threadId, {
            mode: "chat",
          });
        }
        break;
      case "title":
        if (control.allowTitleUpdate) {
          persist.updateThreadTitle(control.threadId, effect.title);
        }
        break;
      case "unknown":
        log.debug("acp_unknown_session_update", {
          kind: effect.kind,
          runId: control.runId,
        });
        break;
    }
  }

  if (
    kind === "tool_call" ||
    (kind === "tool_call_update" && "status" in envelope.update) ||
    kind === "plan" ||
    kind === "plan_update"
  ) {
    control.emitter.flush();
  } else if (effects.length === 0 && !control.replaying) {
    control.emitter.schedule();
  }
}

async function finishRun(
  control: AcpRunControl,
  input: {
    errorMessage?: string | null;
    finishReason?: string | null;
    status: "cancelled" | "completed" | "error";
    statusLabel?: string | null;
  },
) {
  if (control.finished) {
    return;
  }
  control.emitter.cancel();
  cancelPendingInteractions(control);
  control.mirror.closeOpenSegments();
  control.mirror.finishDanglingTools(
    input.status === "completed"
      ? DANGLING_TOOL_MESSAGE
      : INTERRUPTED_TOOL_MESSAGE,
  );

  await finishExternalRun(control, {
    errorMessage: input.errorMessage,
    failureMessage: `${control.descriptor.label} run failed.`,
    finishReason: input.finishReason,
    persistMessage: (metadata) =>
      persistAssistantMessage(control, metadata.status, {
        errorMessage: metadata.errorMessage,
        finishReason: metadata.finishReason,
        repoCheckpointId: metadata.repoCheckpointId,
        statusLabel: metadata.statusLabel,
      }),
    status: input.status,
    statusLabel: input.statusLabel ?? null,
  });

  activeAcpRunControls.delete(control.runId);
  control.detach?.();
  control.detach = null;
  const terminals = control.terminals;
  control.terminals = null;
  void terminals?.disposeAll();
  control.lease?.release();
  control.lease = null;
}

/** The process died or broke: drop it so the next turn starts a fresh one. */
async function evictProcess(control: AcpRunControl) {
  const process = control.process;
  if (!process) {
    return;
  }
  forgetLiveSession(process);
  control.lease?.release();
  control.lease = null;
  await getAcpProcessPool()
    .dispose(control.poolKey)
    .catch(() => undefined);
}

async function acquireProcess(
  control: AcpRunControl,
  launch: ReturnType<typeof buildAcpLaunch>,
) {
  const pool = getAcpProcessPool();
  const fingerprint = acpLaunchFingerprint(launch);
  const create = async () =>
    startAcpProcess(control.descriptor, launch, {
      instanceId: control.instance.id,
    });
  let lease = await pool.acquire(control.poolKey, fingerprint, create);
  if (!lease.resource.isAlive()) {
    // It died while idle: replace it.
    lease.release();
    await pool.dispose(control.poolKey);
    lease = await pool.acquire(control.poolKey, fingerprint, create);
  }
  return lease;
}

/** Errors that end the turn even during best-effort setup steps. */
function rethrowIfFatal(process: AcpAgentProcess, error: unknown) {
  if (
    process.exitError() ||
    error instanceof AcpRequestCancelledError ||
    error instanceof AcpRequestTimeoutError
  ) {
    throw error;
  }
}

function addSetupNotice(control: AcpRunControl, id: string, message: string) {
  log.warn("acp_setup_step_failed", { message, runId: control.runId });
  control.mirror.upsertTool({
    id: `setup-${id}`,
    input: {},
    kind: "notice",
    meta: { severity: "warning" },
    output: { description: null, severity: "warning", title: message },
    status: "completed",
    title: message,
  });
}

/** The user's MCP servers for session/new|load, with a notice for skipped ones. */
async function forwardMcpServers(
  control: AcpRunControl,
  init: Awaited<ReturnType<typeof initializeAcpAgent>>,
) {
  const mcp = await buildAcpMcpServers(
    await getMcpServerRuntime(control.userId).catch(() => []),
    {
      capabilities: init.capabilities,
      env: control.instance.env,
      requiresOAuth: requiresMcpOAuth,
      resolveOAuthToken: (entry) => resolveOAuthToken(control.userId, entry),
    },
  );
  if (mcp.skipped.length > 0) {
    const title = "Some MCP servers were not passed to the agent";
    control.mirror.upsertTool({
      id: "mcp-forwarding",
      input: {},
      kind: "notice",
      meta: { severity: "warning" },
      output: {
        description: mcp.skipped
          .map((server) => `${server.name}: ${server.reason}`)
          .join("\n"),
        severity: "warning",
        title,
      },
      status: "completed",
      title,
    });
  }
  return mcp.servers;
}

async function startTurn(
  control: AcpRunControl,
  input: {
    message: ThreadUIMessage | null;
    modelTranscript: ThreadUIMessage[];
    request: ThreadChatRequest;
    state: AcpThreadState | null;
  },
) {
  const { descriptor, instance } = control;
  const signal = control.abort.signal;

  const resolution = await descriptor.resolveBinary(instance);
  if (!resolution.binary) {
    throw new Error(
      resolution.error ?? `${descriptor.processLabel} was not found.`,
    );
  }
  const binary = resolution.binary;
  const launch = buildAcpLaunch(
    descriptor,
    instance,
    binary,
    control.workspaceRoot,
  );
  control.lease = await acquireProcess(control, launch);
  const process: AcpAgentProcess = control.lease.resource;
  control.process = process;
  control.detach = process.attach(
    createRunHandlers(control, (envelope) =>
      handleSessionUpdate(control, envelope),
    ),
  );
  // A process that dies mid-turn rejects the request in flight (requests
  // race the process exit), which fails the turn with its stderr tail.

  const init = await initializeAcpAgent(process, {
    context: "session",
    descriptor,
    signal,
  });

  // MCP servers only matter when a session is opened; a live session keeps
  // the ones it was opened with.
  const live = getLiveSession(process);
  const mcpServers =
    live && live.cwd === control.workspaceRoot
      ? []
      : await forwardMcpServers(control, init);

  setStatusLabel(control, `Starting ${descriptor.label} session...`);
  const opened = await openAcpSession(process, {
    auth: {
      binaryPath: binary.path,
      interactive: control.interactive,
      onAuthenticating: () =>
        setStatusLabel(control, `Waiting for ${descriptor.label} sign-in...`),
      signal,
    },
    cwd: control.workspaceRoot,
    descriptor,
    init,
    mcpServers,
    onReplay: (replaying) => {
      control.replaying = replaying;
    },
    onSessionLost: (error) =>
      log.info("acp_session_not_continued", {
        error: getErrorMessage(error),
        runId: control.runId,
      }),
    persistedSessionId: input.state?.sessionId ?? null,
  });
  const session = opened.session;
  control.sessionId = session.sessionId;

  // The model, effort and mode are best effort: a value the agent refuses
  // leaves the turn on the agent's current setting instead of failing it.
  try {
    await applyAcpModelSelection(
      process,
      session,
      {
        effort: input.request.reasoningEffort ?? null,
        modelId: input.request.modelId ?? null,
      },
      signal,
    );
  } catch (error) {
    rethrowIfFatal(process, error);
    addSetupNotice(
      control,
      "model",
      `${descriptor.label} kept its current model: ${getErrorMessage(error)}`,
    );
  }
  let plan: Awaited<ReturnType<typeof applyAcpPlanMode>>;
  try {
    plan = await applyAcpPlanMode(process, session, {
      descriptor,
      rememberedBuildModeId: input.state?.buildModeId ?? null,
      signal,
      threadMode: control.threadMode,
    });
  } catch (error) {
    rethrowIfFatal(process, error);
    plan = {
      buildModeId: input.state?.buildModeId ?? null,
      modeId: input.state?.modeId ?? null,
      usePreamble: control.threadMode === "plan",
    };
  }
  learnCatalog(control, session);

  const baseState: AcpThreadState = {
    agentId: descriptor.id,
    agentVersion: init.agentInfo.version ?? binary.version ?? null,
    buildModeId: plan.buildModeId,
    cwd: control.workspaceRoot,
    historyDelivered: opened.historyDelivered,
    modeId: plan.modeId,
    modelId: input.request.modelId ?? null,
    protocolVersion: init.protocolVersion,
    reasoningEffort: input.request.reasoningEffort ?? null,
    sessionId: session.sessionId,
  };
  writeThreadState(control, baseState);

  const promptMessage =
    input.message ??
    ({
      id: control.threadId,
      metadata: {},
      parts: [{ text: "", type: "text" }],
      role: "user",
    } satisfies ThreadUIMessage);
  const prompt = await buildAcpPromptBlocks({
    capabilities: init.capabilities,
    forceImagePrompts: descriptor.forceImagePrompts,
    message: input.message,
    text: buildExternalRuntimePromptText({
      includeHistory: !opened.historyDelivered,
      message: promptMessage,
      planPreamble: plan.usePreamble,
      threadMode: control.threadMode,
      transcript: input.modelTranscript,
      workspaceRoot: control.workspaceRoot,
    }),
  });

  setStatusLabel(control, null);
  return { baseState, process, prompt, session };
}

async function runPrompt(
  control: AcpRunControl,
  turn: Awaited<ReturnType<typeof startTurn>>,
) {
  try {
    persist.setThreadStatus(control.threadId, "streaming");
    const result = await promptAcpSession(turn.process, {
      meta: control.descriptor.promptMeta?.({ promptId: control.runId }),
      prompt: turn.prompt,
      sessionId: turn.session.sessionId,
    });
    // The session now holds this turn.
    writeThreadState(control, { ...turn.baseState, historyDelivered: true });
    if (result.usage) {
      control.mirror.setUsage({
        ...(result.usage.cachedReadTokens != null
          ? { cachedInputTokens: result.usage.cachedReadTokens }
          : {}),
        ...(result.usage.outputTokens != null
          ? { outputTokens: result.usage.outputTokens }
          : {}),
        ...(result.usage.thoughtTokens != null
          ? { reasoningTokens: result.usage.thoughtTokens }
          : {}),
        ...(result.usage.totalTokens != null
          ? { totalTokens: result.usage.totalTokens }
          : {}),
      });
    }
    const outcome = control.cancelRequested
      ? outcomeFromStopReason("cancelled")
      : outcomeFromStopReason(result.stopReason);
    await finishRun(control, {
      errorMessage:
        outcome.status === "cancelled" ? "Generation stopped." : null,
      finishReason: outcome.finishReason,
      status: outcome.status,
      statusLabel: outcome.statusLabel,
    });
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
    const exited = turn.process.exitError();
    if (exited) {
      await evictProcess(control);
    }
    await finishRun(control, {
      errorMessage:
        (exited ?? error) instanceof Error
          ? getErrorMessage(exited ?? error)
          : String(error),
      status: "error",
    });
  }
}

async function submitApproval(
  descriptor: AcpAgentDescriptor,
  request: ThreadChatRequest,
  existingThread: LoadedEngineThread,
) {
  const latestAssistant = request.messages
    ? [...request.messages]
        .reverse()
        .find((message) => message.role === "assistant")
    : null;
  const control = resolveActiveAcpRunControl({
    activeRunId: existingThread?.activeStreamId ?? null,
    threadId: request.threadId,
  });
  const response = request.toolApprovalResponse;
  const interaction = response ? control?.pending.get(response.id) : undefined;
  const answer =
    interaction && response
      ? toInteractionAnswer(interaction.kind, response)
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
      `That ${descriptor.label} request is no longer active.`,
    );
  }

  interaction.settle(answer);
  return new Response(null, { status: 204 });
}

export async function runAcpThreadChat(
  descriptor: AcpAgentDescriptor,
  request: ThreadChatRequest,
  existingThread: LoadedEngineThread,
  /** The thread's engine instance (the dispatcher resolves it). */
  instanceInput?: ResolvedEngineInstance | null,
): Promise<Response> {
  if (request.trigger === "submit-tool-approval") {
    return await submitApproval(descriptor, request, existingThread);
  }
  if (
    request.trigger !== "submit-user-message" &&
    request.trigger !== "edit-user-message"
  ) {
    throw new Error(
      `The ${descriptor.label} engine does not support "${request.trigger}".`,
    );
  }

  const instance =
    instanceInput ??
    (await resolveThreadEngineInstance(request.userId, {
      chatEngine: descriptor.driver,
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
    descriptor.driver as Parameters<typeof persist.ensureThread>[5],
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
      statusLabel: `Starting ${descriptor.label} session...`,
    },
    parts: [{ text: " ", type: "text" }],
    role: "assistant",
  };
  persist.upsertMessage(request.threadId, placeholder);
  persist.setActiveStream(request.threadId, runId);
  persist.setThreadStatus(request.threadId, "streaming");
  await persist.updateThreadChatSettings(request.threadId, {
    engine: descriptor.driver as Parameters<
      typeof persist.updateThreadChatSettings
    >[1]["engine"],
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
      descriptor.permissionModes as [PermissionMode, ...PermissionMode[]],
    );
  } catch (error) {
    log.warn("acp_permission_mode_failed", { error, runId });
  }

  const control: AcpRunControl = {
    abort: new AbortController(),
    allowTitleUpdate: allRecords.length === 0,
    assistantId,
    cancelRequested: false,
    descriptor,
    detach: null,
    emitter: null as unknown as AcpRunControl["emitter"],
    eventChannel,
    finished: false,
    grants: { editPaths: new Set(), execute: "none" },
    instance,
    interactive: toolsEnabled && request.interactive !== false,
    lease: null,
    mirror: createAssistantMirror({
      agentLabel: instance.label || descriptor.label,
      toolPrefix: descriptor.toolPrefix,
    }),
    nextInteractionId: 0,
    pending: new Map(),
    permissionMode,
    poolKey: acpPoolKey(instance.id, request.threadId),
    process: null,
    promptPromise: null,
    replaying: false,
    requestedModelId: request.modelId ?? null,
    runId,
    sessionId: null,
    statusLabel: `Starting ${descriptor.label} session...`,
    terminals: null,
    threadId: request.threadId,
    threadMode,
    toolsEnabled,
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
  activeAcpRunControls.set(runId, control);

  control.promptPromise = (async () => {
    let turn: Awaited<ReturnType<typeof startTurn>>;
    try {
      turn = await startTurn(control, {
        message: request.message ?? null,
        modelTranscript,
        request,
        state: readThreadState(descriptor, existingThread, instance),
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
      if (exited || !(error instanceof AcpAuthRequiredError)) {
        // A broken or half-started process is not reused.
        await evictProcess(control);
      }
      await finishRun(control, {
        errorMessage: getErrorMessage(exited ?? error),
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
    await runPrompt(control, turn);
  })().catch((error: unknown) => {
    log.error("acp_run_crashed", { error, runId });
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

export async function stopAcpThreadRun(
  descriptor: AcpAgentDescriptor,
  request: ThreadChatRequest,
  existingThread: LoadedEngineThread,
): Promise<Response> {
  const control = resolveActiveAcpRunControl({
    activeRunId: existingThread?.activeStreamId ?? null,
    threadId: request.threadId,
  });

  if (!control || control.finished) {
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    return new Response(null, { status: 204 });
  }

  control.cancelRequested = true;
  control.abort.abort(new Error("Generation stopped."));
  if (control.process && control.sessionId) {
    // A notification: Stop never waits for the agent to answer it.
    await cancelAcpSession(control.process, {
      meta: descriptor.cancelMeta,
      sessionId: control.sessionId,
    });
  }
  // ACP requires answering what the agent still waits on as cancelled.
  cancelPendingInteractions(control);

  const settled = control.promptPromise
    ? await waitWithTimeout(
        control.promptPromise,
        descriptor.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS,
      )
    : false;
  if (!settled || !control.finished) {
    // The agent ignored the cancel: end the process and the turn.
    await evictProcess(control);
    await finishRun(control, {
      errorMessage: "Generation stopped.",
      status: "cancelled",
    });
  }

  return new Response(null, { status: 204 });
}
