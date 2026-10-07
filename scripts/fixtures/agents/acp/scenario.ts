// Scenario contract for scripts/fixtures/agents/acp/mock-agent.ts. The README
// next to this file documents every field with examples; keep both in sync.
import type * as acp from "@agentclientprotocol/sdk";

import type { JsonObject } from "../shared/fixture-io";

export type { JsonObject };

/** A JSON-RPC error the mock answers with. */
export type AcpMockError = { code: number; message: string; data?: unknown };

/**
 * Auth method as an agent advertises it. The stable 1.7 schema only knows
 * `agent` (untyped or `type:"agent"`) and `terminal`; `env_var` is the
 * registry/legacy shape (`vars`, optional `link`) that agents still send, so
 * the mock passes every entry through untouched.
 */
export type AcpMockAuthMethod =
  | (acp.AuthMethodAgent & { type?: "agent" })
  | (acp.AuthMethodTerminal & { type: "terminal" })
  | {
      type: "env_var";
      id: string;
      name: string;
      description?: string | null;
      vars: Array<{ name: string; label?: string; optional?: boolean }>;
      link?: string | null;
      _meta?: JsonObject | null;
    }
  | JsonObject;

/** The unstable, pre-config-options model picker (`session/set_model`). */
export type AcpLegacyModelState = {
  currentModelId: string;
  availableModels: Array<{
    modelId: string;
    name: string;
    description?: string | null;
    _meta?: JsonObject | null;
  }>;
};

export type AcpMockInitialize = {
  /** Defaults to the SDK's `PROTOCOL_VERSION` (1). */
  protocolVersion?: number;
  /** Defaults to {@link DEFAULT_AGENT_INFO}; `null` sends `agentInfo: null`. */
  agentInfo?: acp.Implementation | null;
  /** Replaces {@link DEFAULT_AGENT_CAPABILITIES} as a whole when set. */
  agentCapabilities?: acp.AgentCapabilities | JsonObject;
  authMethods?: AcpMockAuthMethod[];
  /** `_meta` on the initialize response. */
  meta?: JsonObject;
  /**
   * Echo the client's raw `initialize` params (`_meta`, `clientInfo`,
   * `clientCapabilities`, `protocolVersion`) under
   * `_meta["sentinel.mock/request"]` of the response.
   */
  echoMeta?: boolean;
  /** Respond with exactly this object (e.g. Antigravity's v2 legacy shape). */
  response?: JsonObject;
};

export type AcpMockAuth = {
  /** `session/new|load|resume|fork` fail with -32000 until `authenticate` succeeds. */
  requireAuth?: boolean;
  /** Method ids `authenticate` accepts. Default: any id. */
  acceptMethodIds?: string[];
  /** Error returned by `authenticate` for ids outside `acceptMethodIds`. */
  rejectError?: AcpMockError;
  /** Extra text for the -32000 "Authentication required" message. */
  message?: string;
  /** `data` of the -32000 error. */
  errorData?: unknown;
  /** Delay before `authenticate` responds (browser login stand-in). */
  delayMs?: number;
};

export type AcpMockSessionConfig = {
  /** Ids handed out by `session/new` and `session/fork`, in order; then `mock-session-<n>`. */
  ids?: string[];
  modes?: acp.SessionModeState | null;
  configOptions?: Array<acp.SessionConfigOption | JsonObject> | null;
  /** Legacy unstable `models` state on new/load/resume responses. */
  models?: AcpLegacyModelState | null;
  /** `_meta` on new/load/resume/fork responses. */
  meta?: JsonObject;
  /** Raw `session/update` payloads emitted right after `session/new` responds. */
  afterNew?: JsonObject[];
  load?: {
    /** Raw updates replayed through `session/update` before the response. */
    replay?: JsonObject[];
    replayDelayMs?: number;
    /** When set, loading any other id fails with `unknownSessionError`. */
    knownSessionIds?: string[];
    unknownSessionError?: AcpMockError;
    /** Fail every load with this error. */
    error?: AcpMockError;
  };
  resume?: {
    knownSessionIds?: string[];
    unknownSessionError?: AcpMockError;
    error?: AcpMockError;
  };
  /** `session/list` result. Default: the sessions this process created. */
  list?: acp.SessionInfo[];
  /** Emit `current_mode_update` after `session/set_mode`. */
  emitCurrentModeUpdate?: boolean;
  /** Emit `config_option_update` after `session/set_config_option`. */
  emitConfigOptionUpdate?: boolean;
  /**
   * Replaces the session's whole option list after `set_config_option`, keyed
   * by `"<configId>=<value>"` (per-model effort lists, like Cursor).
   */
  configOptionsAfterSet?: Record<
    string,
    Array<acp.SessionConfigOption | JsonObject>
  >;
};

/** One `session/prompt` turn. */
export type AcpMockPromptScript = {
  /** Picks this script when the prompt text contains `match`. */
  match?: string;
  steps?: AcpMockStep[];
  /** Default `end_turn`; `null` responds `{}` without a stopReason. */
  stopReason?: acp.StopReason | null;
  usage?: acp.Usage;
  /** `_meta` on the prompt response. */
  meta?: JsonObject;
  /** Fail the prompt request with this error (after the steps ran). */
  error?: AcpMockError;
};

/** Step lists keyed by outcome; `"*"` is the fallback. */
export type AcpMockBranches = Record<string, AcpMockStep[]>;

type StepMeta = { meta?: JsonObject };

export type AcpMockStep =
  /** Any `session/update` payload, sent as-is (unknown kinds included). */
  | ({ type: "update"; update: JsonObject; sessionId?: string } & StepMeta)
  | ({ type: "text"; text: string; messageId?: string } & StepMeta)
  | ({ type: "thought"; text: string; messageId?: string } & StepMeta)
  | ({ type: "image"; data: string; mimeType: string; uri?: string } & StepMeta)
  | ({
      type: "toolCall";
      toolCallId: string;
      title: string;
      kind?: acp.ToolKind;
      status?: acp.ToolCallStatus;
      rawInput?: unknown;
      rawOutput?: unknown;
      locations?: acp.ToolCallLocation[];
      content?: Array<acp.ToolCallContent | JsonObject>;
    } & StepMeta)
  /** Only the fields present are sent: a partial update, status optional. */
  | ({
      type: "toolCallUpdate";
      toolCallId: string;
      title?: string | null;
      kind?: acp.ToolKind | null;
      status?: acp.ToolCallStatus | null;
      rawInput?: unknown;
      rawOutput?: unknown;
      locations?: acp.ToolCallLocation[] | null;
      content?: Array<acp.ToolCallContent | JsonObject> | null;
    } & StepMeta)
  | { type: "plan"; entries: acp.PlanEntry[] }
  | ({
      type: "requestPermission";
      toolCall: JsonObject;
      /** Default {@link STANDARD_PERMISSION_OPTIONS}. */
      options?: Array<acp.PermissionOption | JsonObject>;
      /** Keyed by the selected optionId, or `cancelled`. */
      branches?: AcpMockBranches;
    } & StepMeta)
  | {
      type: "extRequest";
      method: string;
      params?: unknown;
      /** Keyed by `result.outcome` (string), else `ok`, or `error`. */
      branches?: AcpMockBranches;
      /** Emit the result (or error) as an agent_message_chunk. */
      echo?: boolean;
    }
  | { type: "extNotification"; method: string; params?: unknown }
  | {
      type: "clientFs";
      op: "read";
      path: string;
      line?: number;
      limit?: number;
      echo?: boolean;
    }
  | { type: "clientFs"; op: "write"; path: string; content: string }
  | {
      type: "clientTerminal";
      command: string;
      args?: string[];
      env?: Array<{ name: string; value: string }>;
      cwd?: string;
      outputByteLimit?: number;
      /** Attach the terminal to this tool call through a terminal content block. */
      toolCallId?: string;
      /** Send `terminal/kill` before waiting for the exit. */
      kill?: boolean;
      /** Skip `terminal/wait_for_exit`. */
      noWait?: boolean;
      /** Default true. */
      release?: boolean;
      echo?: boolean;
    }
  | {
      type: "elicitation";
      mode: "form";
      message: string;
      requestedSchema: JsonObject;
      toolCallId?: string;
      /** Keyed by the response `action`. */
      branches?: AcpMockBranches;
      echo?: boolean;
    }
  | {
      type: "elicitation";
      mode: "url";
      message: string;
      url: string;
      elicitationId?: string;
      /** Send `elicitation/complete` once the client answered. */
      complete?: boolean;
      branches?: AcpMockBranches;
      echo?: boolean;
    }
  | { type: "delay"; ms: number }
  /** Raw lines written to stdout between frames (garbage, URLs, hand-made JSON). */
  | { type: "stdout"; lines: string[] }
  | { type: "stderr"; text: string; repeat?: number }
  /** Crash: flush stdout, then exit (or kill itself with `signal`). */
  | { type: "exit"; code?: number; signal?: NodeJS.Signals; stderr?: string }
  /** Never respond. `session/cancel` still ends the turn unless `ignoreCancel`. */
  | { type: "hang"; ignoreCancel?: boolean }
  /** Block until `session/cancel` arrives (the turn then ends cancelled). */
  | { type: "waitForCancel" }
  /** End the turn now. */
  | { type: "stop"; stopReason?: acp.StopReason | null }
  /** Fail the prompt request now. */
  | { type: "fail"; error: AcpMockError };

export type AcpMockCancelConfig = {
  /** Stop reason after `session/cancel`. Default `cancelled`; `end_turn` emulates the cancel/complete race. */
  stopReason?: acp.StopReason;
  /** Raw updates emitted after the cancel arrived, before the prompt responds. */
  updates?: JsonObject[];
  /** Exit with this code on cancel instead of responding. */
  exitCode?: number;
};

export type AcpMockFaults = {
  /** Lines written to stdout before anything else (sign-in banners, garbage). */
  startupStdout?: string[];
  startupStderr?: string;
  /** Roughly this many bytes of stderr at startup. */
  stderrFloodBytes?: number;
  /** Write every outgoing frame in chunks of this many bytes. */
  splitFramesBytes?: number;
  /** Exit with `exitCode` (default 1) this long after startup. */
  exitAfterMs?: number;
  exitCode?: number;
  /** Default true. False keeps the process alive after stdin closes. */
  exitOnStdinClose?: boolean;
  /** Requests to these methods are never answered. */
  hangMethods?: string[];
  /** Delay (ms) before handling these methods, e.g. `{"initialize": 3000}`. */
  methodDelays?: Record<string, number>;
  /** Answer these methods with an error. */
  methodErrors?: Record<string, AcpMockError>;
};

export type AcpMockScenario = {
  /** SDK app name, used in SDK diagnostics only. */
  agentName?: string;
  initialize?: AcpMockInitialize;
  auth?: AcpMockAuth;
  session?: AcpMockSessionConfig;
  /**
   * Turn scripts. A prompt whose text contains a script's `match` runs that
   * script; other prompts take the unmatched scripts in order, repeating the
   * last one. No scripts: one text chunk and `end_turn`.
   */
  prompts?: AcpMockPromptScript[];
  cancel?: AcpMockCancelConfig;
  faults?: AcpMockFaults;
};

/** One line of `SENTINEL_ACP_MOCK_LOG`. Every frame the mock received, raw. */
export type AcpMockLogEntry =
  | {
      ts: number;
      kind: "request";
      id: string | number;
      method: string;
      params?: unknown;
    }
  | { ts: number; kind: "notification"; method: string; params?: unknown }
  | {
      ts: number;
      kind: "response";
      id: string | number | null;
      result?: unknown;
      error?: AcpMockError;
    }
  | { ts: number; kind: "lifecycle"; event: string; detail?: unknown };

export const ACP_MOCK_SCENARIO_ENV = "SENTINEL_ACP_MOCK_SCENARIO";
export const ACP_MOCK_SCENARIO_FILE_ENV = "SENTINEL_ACP_MOCK_SCENARIO_FILE";
export const ACP_MOCK_LOG_ENV = "SENTINEL_ACP_MOCK_LOG";

export const DEFAULT_AGENT_INFO: acp.Implementation = {
  name: "sentinel-acp-mock",
  title: "Sentinel ACP mock",
  version: "0.0.0-mock",
};

export const DEFAULT_AGENT_CAPABILITIES: acp.AgentCapabilities = {
  loadSession: true,
  promptCapabilities: { image: true, audio: false, embeddedContext: true },
  mcpCapabilities: { http: true, sse: false },
  sessionCapabilities: {
    list: {},
    resume: {},
    fork: {},
    close: {},
    delete: {},
  },
  auth: { logout: {} },
};

/** One option of each kind, with the ids most agents use. */
export const STANDARD_PERMISSION_OPTIONS: acp.PermissionOption[] = [
  { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
  { optionId: "allow-always", name: "Always allow", kind: "allow_always" },
  { optionId: "reject-once", name: "Reject", kind: "reject_once" },
  { optionId: "reject-always", name: "Always reject", kind: "reject_always" },
];

/** A `select` config option with flat options. */
export function selectConfigOption(input: {
  id: string;
  name: string;
  category?: string;
  currentValue: string;
  values: Array<string | { value: string; name: string; description?: string }>;
}): acp.SessionConfigOption {
  return {
    type: "select",
    id: input.id,
    name: input.name,
    ...(input.category ? { category: input.category } : {}),
    currentValue: input.currentValue,
    options: input.values.map((value) =>
      typeof value === "string" ? { value, name: value } : value,
    ),
  };
}
