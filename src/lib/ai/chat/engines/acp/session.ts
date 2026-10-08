import "server-only";

import type { ReasoningEffort } from "@/lib/ai/providers/models";

import { buildClientCapabilities, buildClientInfo } from "./capabilities";
import {
  findBuildModeId,
  findModeOption,
  findPlanConfigValue,
  findPlanModeId,
  isPlanModeId,
  planEffortChange,
  planModelChange,
  readConfigOptions,
  type AcpConfigOptionInfo,
} from "./config-options";
import type { AcpAgentProcess } from "./connection";
import type { AcpAgentDescriptor } from "./descriptor";
import {
  AcpAuthRequiredError,
  AcpProcessExitedError,
  AcpProtocolError,
  AcpRequestCancelledError,
  getErrorMessage,
  getRpcErrorCode,
  isAuthRequiredError,
} from "./errors";
import type { AcpMcpServer } from "./mcp-forwarding";
import {
  readAgentCapabilities,
  readAgentInfo,
  readAuthMethods,
  readLegacyModelState,
  readModeState,
  readNonEmptyString,
  readPromptUsage,
  readStopReason,
  type AcpAgentCapabilityFlags,
  type AcpAgentInfo,
  type AcpAuthMethodInfo,
  type AcpCommandInfo,
  type AcpModeState,
  type AcpPromptUsage,
  type AcpStopReason,
  type JsonRecord,
} from "./schema";

// The ACP protocol steps over one agent process (design §2.4–§2.11):
// initialize (once per process), auth (lazy: only when the agent asks),
// session selection (reuse, load or resume by capability, else new), config
// options, plan mode, prompt and cancel. Nothing here touches the thread;
// the runtime decides what to persist.

export const ACP_INITIALIZE_TIMEOUT_MS = 20_000;
export const ACP_SESSION_TIMEOUT_MS = 60_000;
export const ACP_CONFIG_TIMEOUT_MS = 15_000;
export const ACP_AUTHENTICATE_TIMEOUT_MS = 5 * 60_000;

export type AcpInitializeInfo = {
  agentInfo: AcpAgentInfo;
  authMethods: AcpAuthMethodInfo[];
  capabilities: AcpAgentCapabilityFlags;
  protocolVersion: number;
  raw: unknown;
};

const INITIALIZE_KEY = "acp.initialize";
const SESSION_KEY = "acp.session";

/** Lets inbound handler chains that precede a response finish (they are async). */
export function settleInbound() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

export function getInitializeInfo(process: AcpAgentProcess) {
  return (
    (process.state.get(INITIALIZE_KEY) as AcpInitializeInfo | undefined) ?? null
  );
}

/** Initializes the agent once per process; later calls return the cached result. */
export async function initializeAcpAgent(
  process: AcpAgentProcess,
  input: {
    clientVersion?: string | null;
    context: "probe" | "session";
    descriptor: AcpAgentDescriptor;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<AcpInitializeInfo> {
  const cached = getInitializeInfo(process);
  if (cached) {
    return cached;
  }

  const raw = await process.request(
    process.methods.initialize,
    {
      clientCapabilities: buildClientCapabilities(
        input.descriptor,
        input.context,
      ),
      clientInfo: buildClientInfo(input.clientVersion),
      protocolVersion: process.methods.protocolVersion,
      ...(input.descriptor.initializeMeta
        ? { _meta: input.descriptor.initializeMeta }
        : {}),
    },
    {
      signal: input.signal,
      timeoutMs: input.timeoutMs ?? ACP_INITIALIZE_TIMEOUT_MS,
    },
  );
  const version = (raw as { protocolVersion?: unknown } | null)
    ?.protocolVersion;
  if (version !== process.methods.protocolVersion) {
    throw new AcpProtocolError(
      `${input.descriptor.processLabel} answered ACP protocol version ${String(
        version,
      )}; Sentinel speaks version ${process.methods.protocolVersion}.`,
    );
  }

  const info: AcpInitializeInfo = {
    agentInfo: readAgentInfo(raw),
    authMethods: readAuthMethods(raw),
    capabilities: readAgentCapabilities(raw),
    protocolVersion: version,
    raw,
  };
  process.initializeResult = raw;
  process.state.set(INITIALIZE_KEY, info);
  return info;
}

/** The session a process holds for its thread. */
export type AcpLiveSession = {
  availableCommands: AcpCommandInfo[];
  configOptions: AcpConfigOptionInfo[];
  cwd: string;
  legacyModels: ReturnType<typeof readLegacyModelState>;
  modes: AcpModeState | null;
  /** How the session was opened in this process. */
  origin: "load" | "new" | "resume";
  sessionId: string;
};

export function getLiveSession(process: AcpAgentProcess) {
  return (process.state.get(SESSION_KEY) as AcpLiveSession | undefined) ?? null;
}

function setLiveSession(process: AcpAgentProcess, session: AcpLiveSession) {
  process.state.set(SESSION_KEY, session);
}

function authMethodFor(
  descriptor: AcpAgentDescriptor,
  init: AcpInitializeInfo,
) {
  const methodId = descriptor.auth.methodId(init.authMethods);
  return methodId
    ? (init.authMethods.find((method) => method.id === methodId) ?? {
        args: [],
        description: null,
        env: {},
        id: methodId,
        kind: "agent" as const,
        link: null,
        name: methodId,
        vars: [],
      })
    : null;
}

function authRequiredError(
  descriptor: AcpAgentDescriptor,
  init: AcpInitializeInfo,
  method: AcpAuthMethodInfo | null,
  options: { binaryPath: string | null; interactive: boolean },
) {
  const hint = descriptor.auth.loginHint?.(options.binaryPath);
  if (method?.kind === "env_var") {
    const names = method.vars.map((variable) => variable.name).join(", ");
    return new AcpAuthRequiredError(
      `${descriptor.label} needs ${names || "an API key"} set on this engine instance (Settings > Engines).`,
      init.authMethods,
    );
  }
  if (method?.kind === "terminal") {
    const command = [options.binaryPath, ...method.args]
      .filter(Boolean)
      .join(" ");
    return new AcpAuthRequiredError(
      `${descriptor.label} needs you to sign in${command ? `: run \`${command}\` in a terminal` : ""}, then retry.`,
      init.authMethods,
    );
  }
  return new AcpAuthRequiredError(
    options.interactive
      ? `${descriptor.label} needs you to sign in${hint ? ` (${hint})` : ""}, then retry.`
      : `${descriptor.label} is signed out, and automation runs cannot sign in${hint ? ` (${hint})` : ""}.`,
    init.authMethods,
  );
}

/**
 * `authenticate` with `method`. A sign-in that fails or never finishes (the
 * user closed the browser) is AcpAuthRequiredError, so nothing mistakes it
 * for an agent refusing the session; an exit or Stop stays as it is.
 */
async function authenticate(
  process: AcpAgentProcess,
  descriptor: AcpAgentDescriptor,
  init: AcpInitializeInfo,
  method: AcpAuthMethodInfo,
  options: AcpAuthOptions,
) {
  options.onAuthenticating?.(method);
  try {
    await process.request(
      process.methods.authenticate,
      { methodId: method.id },
      {
        signal: options.signal,
        timeoutMs: descriptor.auth.timeoutMs ?? ACP_AUTHENTICATE_TIMEOUT_MS,
      },
    );
  } catch (error) {
    if (
      error instanceof AcpProcessExitedError ||
      error instanceof AcpRequestCancelledError
    ) {
      throw error;
    }
    throw new AcpAuthRequiredError(
      `${descriptor.label} sign-in did not complete: ${getErrorMessage(error)}`,
      init.authMethods,
    );
  }
}

export type AcpAuthOptions = {
  binaryPath: string | null;
  /** False for unattended runs: never start an interactive sign-in. */
  interactive: boolean;
  /** Called before an in-run `authenticate` (a status label). */
  onAuthenticating?: (method: AcpAuthMethodInfo) => void;
  signal?: AbortSignal;
};

/**
 * Runs `operation`; when the agent says auth is required, authenticates
 * once with the descriptor's method (agent methods only, interactive runs
 * only) and retries. Everything else becomes AcpAuthRequiredError.
 */
export async function withLazyAuth<T>(
  process: AcpAgentProcess,
  descriptor: AcpAgentDescriptor,
  init: AcpInitializeInfo,
  options: AcpAuthOptions,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isAuthRequiredError(error) || descriptor.auth.strategy === "none") {
      throw error;
    }
    const method = authMethodFor(descriptor, init);
    if (!method || method.kind !== "agent" || !options.interactive) {
      throw authRequiredError(descriptor, init, method, options);
    }
    await authenticate(process, descriptor, init, method, options);
    try {
      return await operation();
    } catch (retryError) {
      if (isAuthRequiredError(retryError)) {
        throw authRequiredError(descriptor, init, method, options);
      }
      throw retryError;
    }
  }
}

export type OpenSessionResult = {
  /**
   * The session existed before this turn (reused, loaded or resumed), so
   * it holds the turns it was given; false for a session just created.
   */
  historyDelivered: boolean;
  session: AcpLiveSession;
};

function readSessionSetup(
  raw: unknown,
  sessionId: string,
  cwd: string,
  origin: AcpLiveSession["origin"],
): AcpLiveSession {
  const record = (raw ?? {}) as JsonRecord;
  return {
    availableCommands: [],
    configOptions: readConfigOptions(record.configOptions),
    cwd,
    legacyModels: readLegacyModelState(record.models),
    modes: readModeState(record.modes),
    origin,
    sessionId,
  };
}

/**
 * The agent answered a load or resume with an error of its own (an unknown
 * or unreadable session): a new session may replace it. Anything else (an
 * exit, a timeout, Stop, a sign-in that failed) ends the turn instead, so
 * the persisted session is never abandoned for it.
 */
function isSessionRefusal(error: unknown, signal: AbortSignal | undefined) {
  return (
    !signal?.aborted &&
    getRpcErrorCode(error) !== null &&
    !isAuthRequiredError(error)
  );
}

/**
 * The thread's session in this process (design §2.5):
 *   live session for the same cwd → reuse (no RPC);
 *   persisted id → resume or load per descriptor preference and agent
 *     capabilities (updates replayed by load are dropped by the caller via
 *     `onReplay`); an unknown id falls back to a new session;
 *   otherwise session/new.
 * A new session never inherits the old one's history: `historyDelivered`
 * false tells the caller to include the transcript once.
 */
export async function openAcpSession(
  process: AcpAgentProcess,
  input: {
    auth: AcpAuthOptions;
    cwd: string;
    descriptor: AcpAgentDescriptor;
    init: AcpInitializeInfo;
    mcpServers: AcpMcpServer[];
    /** Called with true before a session/load and false once its replay is over. */
    onReplay?: (replaying: boolean) => void;
    /** The persisted session could not be continued (a new one follows). */
    onSessionLost?: (error: unknown) => void;
    persistedSessionId: string | null;
    timeoutMs?: number;
  },
): Promise<OpenSessionResult> {
  const live = getLiveSession(process);
  if (live && live.cwd === input.cwd) {
    return { historyDelivered: true, session: live };
  }

  const { capabilities } = input.init;
  const timeoutMs = input.timeoutMs ?? ACP_SESSION_TIMEOUT_MS;
  const methods = process.methods;
  const sessionParams = { cwd: input.cwd, mcpServers: input.mcpServers };
  const guarded = <T>(operation: () => Promise<T>) =>
    withLazyAuth(process, input.descriptor, input.init, input.auth, operation);

  if (input.descriptor.auth.strategy === "eager" && input.auth.interactive) {
    const method = authMethodFor(input.descriptor, input.init);
    if (method?.kind === "agent") {
      await authenticate(
        process,
        input.descriptor,
        input.init,
        method,
        input.auth,
      );
    }
  }

  const persisted = input.persistedSessionId;
  if (persisted) {
    const order: Array<"load" | "resume"> =
      input.descriptor.session.prefer === "resume"
        ? ["resume", "load"]
        : ["load", "resume"];
    for (const kind of order) {
      if (kind === "resume" && !capabilities.resumeSession) continue;
      if (kind === "load" && !capabilities.loadSession) continue;
      try {
        const raw = await guarded(async () => {
          if (kind === "load") {
            input.onReplay?.(true);
            try {
              const response = await process.request(
                methods.sessionLoad,
                { ...sessionParams, sessionId: persisted },
                { signal: input.auth.signal, timeoutMs },
              );
              // Replayed updates precede the response on the wire but are
              // handled asynchronously: let them drain before replay ends.
              await settleInbound();
              return response;
            } finally {
              input.onReplay?.(false);
            }
          }
          return await process.request(
            methods.sessionResume,
            { ...sessionParams, sessionId: persisted },
            { signal: input.auth.signal, timeoutMs },
          );
        });
        const session = readSessionSetup(raw, persisted, input.cwd, kind);
        setLiveSession(process, session);
        return { historyDelivered: true, session };
      } catch (error) {
        if (!isSessionRefusal(error, input.auth.signal)) {
          throw error;
        }
        // The agent no longer knows (or cannot restore) the session: start
        // a new one, which then gets the transcript.
        input.onSessionLost?.(error);
        break;
      }
    }
  }

  const raw = await guarded(() =>
    process.request(methods.sessionNew, sessionParams, {
      signal: input.auth.signal,
      timeoutMs,
    }),
  );
  const sessionId = readNonEmptyString(raw, "sessionId");
  if (!sessionId) {
    throw new AcpProtocolError(
      `${input.descriptor.processLabel} created a session without an id.`,
    );
  }
  const session = readSessionSetup(raw, sessionId, input.cwd, "new");
  setLiveSession(process, session);
  return { historyDelivered: false, session };
}

/** Drops the process's session (its cwd changed, or it failed). */
export function forgetLiveSession(process: AcpAgentProcess) {
  process.state.delete(SESSION_KEY);
}

function readReturnedOptions(raw: unknown) {
  const options = (raw as { configOptions?: unknown } | null)?.configOptions;
  return Array.isArray(options) ? readConfigOptions(options) : null;
}

async function setConfigOption(
  process: AcpAgentProcess,
  session: AcpLiveSession,
  change: { configId: string; value: string },
  signal?: AbortSignal,
) {
  const raw = await process.request(
    process.methods.sessionSetConfigOption,
    {
      configId: change.configId,
      sessionId: session.sessionId,
      value: change.value,
    },
    { signal, timeoutMs: ACP_CONFIG_TIMEOUT_MS },
  );
  const returned = readReturnedOptions(raw);
  if (returned) {
    session.configOptions = returned;
  } else {
    session.configOptions = session.configOptions.map((option) =>
      option.id === change.configId
        ? { ...option, currentValue: change.value }
        : option,
    );
  }
}

/**
 * Model and effort before a prompt: the model first (its options can carry
 * a different effort list), then the effort, each only when it differs.
 * Without a model config option, the unstable session/set_model (raw).
 */
export async function applyAcpModelSelection(
  process: AcpAgentProcess,
  session: AcpLiveSession,
  selection: { effort?: ReasoningEffort | null; modelId?: string | null },
  signal?: AbortSignal,
) {
  const modelChange = planModelChange(session.configOptions, selection.modelId);
  if (modelChange) {
    await setConfigOption(process, session, modelChange, signal);
  } else if (
    selection.modelId &&
    session.legacyModels &&
    session.legacyModels.currentModelId !== selection.modelId &&
    session.legacyModels.availableModels.some(
      (model) => model.modelId === selection.modelId,
    )
  ) {
    await process.request(
      process.methods.sessionSetModel,
      { modelId: selection.modelId, sessionId: session.sessionId },
      { signal, timeoutMs: ACP_CONFIG_TIMEOUT_MS },
    );
    session.legacyModels.currentModelId = selection.modelId;
  }

  const effortChange = planEffortChange(
    session.configOptions,
    selection.effort,
  );
  if (effortChange) {
    await setConfigOption(process, session, effortChange, signal);
  }
}

export type PlanModeResult = {
  /** The mode to restore after plan mode (persisted). */
  buildModeId: string | null;
  /** The agent's current mode after the change. */
  modeId: string | null;
  /** The plan preamble goes into the prompt instead. */
  usePreamble: boolean;
};

function currentModeId(session: AcpLiveSession) {
  return (
    session.modes?.currentModeId ??
    (() => {
      const option = findModeOption(session.configOptions);
      return typeof option?.currentValue === "string"
        ? option.currentValue
        : null;
    })()
  );
}

async function setMode(
  process: AcpAgentProcess,
  session: AcpLiveSession,
  modeId: string,
  signal?: AbortSignal,
) {
  await process.request(
    process.methods.sessionSetMode,
    { modeId, sessionId: session.sessionId },
    { signal, timeoutMs: ACP_CONFIG_TIMEOUT_MS },
  );
  if (session.modes) {
    session.modes.currentModeId = modeId;
  }
}

/**
 * Plan mode (design §2.9). native: the agent's plan mode through
 * session/set_mode, else a mode config option, else the prompt preamble;
 * a chat turn restores the mode the thread had before plan mode.
 */
export async function applyAcpPlanMode(
  process: AcpAgentProcess,
  session: AcpLiveSession,
  input: {
    descriptor: Pick<AcpAgentDescriptor, "planMode">;
    rememberedBuildModeId: string | null;
    signal?: AbortSignal;
    threadMode: "chat" | "plan";
  },
): Promise<PlanModeResult> {
  const signal = input.signal;
  const current = currentModeId(session);
  if (input.descriptor.planMode !== "native") {
    return {
      buildModeId: input.rememberedBuildModeId,
      modeId: current,
      usePreamble:
        input.descriptor.planMode === "preamble" && input.threadMode === "plan",
    };
  }

  const planModeId = findPlanModeId(session.modes);
  const modeOption = findModeOption(session.configOptions);

  if (input.threadMode === "plan") {
    if (isPlanModeId(current)) {
      return {
        buildModeId: input.rememberedBuildModeId,
        modeId: current,
        usePreamble: false,
      };
    }
    const buildModeId = current ?? input.rememberedBuildModeId;
    if (planModeId) {
      await setMode(process, session, planModeId, signal);
      return { buildModeId, modeId: planModeId, usePreamble: false };
    }
    const planValue = findPlanConfigValue(modeOption);
    if (modeOption && planValue) {
      await setConfigOption(
        process,
        session,
        { configId: modeOption.id, value: planValue },
        signal,
      );
      return { buildModeId, modeId: planValue, usePreamble: false };
    }
    return { buildModeId, modeId: current, usePreamble: true };
  }

  if (!isPlanModeId(current)) {
    return {
      buildModeId: input.rememberedBuildModeId,
      modeId: current,
      usePreamble: false,
    };
  }
  const target =
    findBuildModeId(session.modes, input.rememberedBuildModeId) ??
    modeOption?.values.find((entry) => !isPlanModeId(entry.value))?.value ??
    null;
  if (!target) {
    return {
      buildModeId: input.rememberedBuildModeId,
      modeId: current,
      usePreamble: false,
    };
  }
  if (session.modes?.availableModes.some((mode) => mode.id === target)) {
    await setMode(process, session, target, signal);
  } else if (modeOption) {
    await setConfigOption(
      process,
      session,
      { configId: modeOption.id, value: target },
      signal,
    );
  }
  return { buildModeId: null, modeId: target, usePreamble: false };
}

export type AcpPromptResult = {
  raw: unknown;
  stopReason: AcpStopReason | null;
  usage: AcpPromptUsage | null;
};

/** session/prompt; resolves when the turn ends (no timeout: turns run long). */
export async function promptAcpSession(
  process: AcpAgentProcess,
  input: {
    meta?: JsonRecord;
    prompt: unknown[];
    sessionId: string;
  },
): Promise<AcpPromptResult> {
  const raw = await process.request(process.methods.sessionPrompt, {
    prompt: input.prompt,
    sessionId: input.sessionId,
    ...(input.meta ? { _meta: input.meta } : {}),
  });
  await settleInbound();
  return {
    raw,
    stopReason: readStopReason(raw),
    usage: readPromptUsage(raw),
  };
}

/** session/cancel is a notification: never awaited for an answer. */
export async function cancelAcpSession(
  process: AcpAgentProcess,
  input: { meta?: JsonRecord; sessionId: string },
) {
  await process.notify(process.methods.sessionCancel, {
    sessionId: input.sessionId,
    ...(input.meta ? { _meta: input.meta } : {}),
  });
}

export function describeAuthMethods(methods: readonly AcpAuthMethodInfo[]) {
  return methods.map((method) => `${method.name} (${method.kind})`).join(", ");
}
