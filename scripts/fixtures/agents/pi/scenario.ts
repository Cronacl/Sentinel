// Scenario contract for scripts/fixtures/agents/pi/mock-rpc.ts, a stand-in for
// `pi --mode rpc`. README.md next to this file documents it with examples.
// Wire shapes follow @earendil-works/pi-coding-agent 1.0.4 (docs/rpc*.md,
// docs/json.md, dist/modes/rpc/rpc-types.d.ts and rpc-mode.js).
import type { JsonObject } from "../shared/fixture-io";

export type { JsonObject };

export type PiThinkingLevel =
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** A Pi `Model` object as `get_available_models` returns it. */
export type PiModel = {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl?: string;
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<PiThinkingLevel, string | null>>;
  input?: Array<"text" | "image">;
  contextWindow?: number;
  maxTokens?: number;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
} & JsonObject;

export type PiUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
};

export type PiSlashCommand = {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo: JsonObject;
};

/** Steps keyed by outcome; `"*"` is the fallback. */
export type PiBranches = Record<string, PiStep[]>;

export type PiStep =
  /** Assistant text; an array streams one `text_delta` per entry. */
  | { type: "text"; text: string | string[] }
  | { type: "thinking"; text: string | string[] }
  /**
   * A tool call: `toolcall_*` deltas, the assistant `message_end` (stopReason
   * `toolUse`), `tool_execution_start/update/end`, the `toolResult` message and
   * `turn_end`. The next content opens a new turn.
   */
  | {
      type: "toolCall";
      id?: string;
      name: string;
      args: JsonObject;
      /** `partialResult` values, one `tool_execution_update` each. */
      updates?: JsonObject[];
      /** Delay before the tool finishes (abortable). */
      durationMs?: number;
      /** Default `{content:[{type:"text",text:"ok"}],details:{}}`. */
      result?: JsonObject;
      isError?: boolean;
    }
  /**
   * An `extension_ui_request` (fields after `method` are sent as-is). Dialogs
   * (`confirm`, `select`, `input`, `editor`) wait for the matching
   * `extension_ui_response`; branch keys are `confirmed` / `declined` for
   * confirm, the value for the others, `cancelled`, and `timeout`.
   */
  | { type: "ui"; method: string; fields?: JsonObject; branches?: PiBranches }
  | {
      type: "compaction";
      reason?: "manual" | "threshold" | "overflow";
      result?: JsonObject;
      aborted?: boolean;
      willRetry?: boolean;
      errorMessage?: string;
      durationMs?: number;
    }
  | {
      type: "retry";
      attempt?: number;
      maxAttempts?: number;
      delayMs?: number;
      errorMessage?: string;
      /** Default true; false ends with `finalError`. */
      success?: boolean;
      finalError?: string;
      /** How long the mock actually waits between start and end. */
      waitMs?: number;
    }
  /** Any stdout record, written as-is. */
  | { type: "event"; event: JsonObject }
  | {
      type: "extensionError";
      extensionPath?: string;
      event?: string;
      error: string;
    }
  | { type: "delay"; ms: number }
  /** Raw lines on stdout (non-JSON noise). */
  | { type: "stdout"; lines: string[] }
  | { type: "stderr"; text: string; repeat?: number }
  | { type: "exit"; code?: number; signal?: NodeJS.Signals }
  /** Never settle on its own; `abort` still ends the run. */
  | { type: "hang" };

/** One accepted `prompt` (or steer/follow-up delivery). */
export type PiPromptScript = {
  /** Picks this script when the message contains `match`. */
  match?: string;
  /** `success:false` with this error instead of accepting the prompt. */
  reject?: string;
  /** `handled` answers like an extension command: no run. */
  disposition?: "started" | "handled";
  steps?: PiStep[];
  /** Final assistant stopReason. Default `stop`. */
  stopReason?: "stop" | "length" | "error";
  errorMessage?: string;
  /** Usage on the final assistant message. */
  usage?: PiUsage;
};

export type PiMockFaults = {
  startupStdout?: string[];
  startupStderr?: string;
  stderrFloodBytes?: number;
  /** End records with CRLF instead of LF (clients must strip the CR). */
  crlf?: boolean;
  /** Write every record in chunks of this many bytes. */
  splitFramesBytes?: number;
  exitAfterMs?: number;
  exitCode?: number;
  /** Default true. */
  exitOnStdinClose?: boolean;
};

export type PiMockScenario = {
  state?: {
    sessionId?: string;
    /** `null` behaves like `--no-session` (no `sessionFile`). */
    sessionFile?: string | null;
    sessionName?: string;
    thinkingLevel?: PiThinkingLevel;
    /** `provider/id` of the selected model; `null` for none. Default: the first model. */
    model?: string | null;
    autoCompactionEnabled?: boolean;
  };
  models?: PiModel[];
  thinkingLevels?: PiThinkingLevel[];
  commands?: PiSlashCommand[];
  /** Initial conversation (`get_messages`). */
  messages?: JsonObject[];
  /** Initial session entries (`get_entries`, `get_tree`, `fork`). */
  entries?: JsonObject[];
  /** `switch_session` targets keyed by session path. */
  sessions?: Record<
    string,
    {
      sessionId?: string;
      sessionName?: string;
      messages?: JsonObject[];
      entries?: JsonObject[];
    }
  >;
  /** Overrides merged into the `get_session_stats` data. */
  sessionStats?: JsonObject;
  /** `compact` result. */
  compaction?: JsonObject;
  /**
   * Make `compact` fail like Pi 1.0 with nothing to compact:
   * `compaction_start`, `compaction_end` with `errorMessage: "Compaction
   * failed: <this>"` and no result, then `success:false` with this error
   * (e.g. `"Nothing to compact (session too small)"`).
   */
  compactFailure?: string;
  /**
   * Open a session's first run with its leading system message
   * (`message_start`/`message_end`, role `system`) after `turn_start`, as
   * Pi 1.0 does. `true` sends a default one; an object is merged over
   * `{role:"system", content:""}`. Sessions whose messages already hold a
   * system message get none.
   */
  systemMessage?: boolean | JsonObject;
  /** Output per `bash` command; default echoes the command. */
  bash?: Record<string, { output: string; exitCode?: number }>;
  /** Extension-cancelled session operations. */
  cancelled?: {
    new_session?: boolean;
    switch_session?: boolean;
    fork?: boolean;
    clone?: boolean;
  };
  prompts?: PiPromptScript[];
  /** Answer these command types with `success:false` and this error. */
  commandErrors?: Record<string, string>;
  /** Delay (ms) before answering these command types. */
  commandDelays?: Record<string, number>;
  /** Never answer these command types. */
  hangCommands?: string[];
  /** `errorMessage` on the aborted assistant message. */
  abortErrorMessage?: string;
  faults?: PiMockFaults;
};

/** One line of `SENTINEL_PI_MOCK_LOG`: every record received on stdin. */
export type PiMockLogEntry =
  | { ts: number; kind: "command"; record: JsonObject }
  | { ts: number; kind: "ui_response"; record: JsonObject }
  | { ts: number; kind: "unparsable"; line: string }
  | { ts: number; kind: "lifecycle"; event: string; detail?: unknown };

export const PI_MOCK_SCENARIO_ENV = "SENTINEL_PI_MOCK_SCENARIO";
export const PI_MOCK_SCENARIO_FILE_ENV = "SENTINEL_PI_MOCK_SCENARIO_FILE";
export const PI_MOCK_LOG_ENV = "SENTINEL_PI_MOCK_LOG";

export const DEFAULT_PI_MODELS: PiModel[] = [
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    api: "anthropic-messages",
    provider: "anthropic",
    baseUrl: "https://api.anthropic.com",
    reasoning: true,
    thinkingLevelMap: { xhigh: null, max: null },
    input: ["text", "image"],
    contextWindow: 200000,
    maxTokens: 16384,
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  },
  {
    id: "gpt-5.6",
    name: "GPT-5.6",
    api: "openai-responses",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 400000,
    maxTokens: 128000,
    cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
  },
];

export const ZERO_PI_USAGE: PiUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
