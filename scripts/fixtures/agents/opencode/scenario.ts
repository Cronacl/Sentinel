// Scenario contract for scripts/fixtures/agents/opencode/fake-server.ts. Steps
// are generation-neutral; the fake renders them as 1.x `/event` payloads
// (`{type, properties}`) or 2.x `/api/event` envelopes (`{id, created, type,
// durable?, location, data}`). README.md next to this file has examples.
import type { JsonObject } from "../shared/fixture-io";

export type { JsonObject };

export type OpenCodeGeneration = 1 | 2;

/** Steps keyed by outcome; `"*"` is the fallback. */
export type OpenCodeBranches = Record<string, OpenCodeStep[]>;

export type OpenCodeStep =
  /** Assistant text; an array streams one delta per entry. */
  | { type: "text"; text: string | string[] }
  | { type: "reasoning"; text: string | string[] }
  /**
   * A tool call: pending → running → completed/error parts (1.x) or
   * `session.tool.input.*` → `called` → `progress` → `success`/`failed` (2.x).
   * `permission` asks before the tool runs; a `reject` reply fails the tool.
   */
  | {
      type: "tool";
      tool: string;
      callID?: string;
      input: JsonObject;
      output?: string;
      title?: string;
      metadata?: JsonObject;
      /** Fail the tool with this message. */
      error?: string;
      durationMs?: number;
      permission?: {
        permission: string;
        patterns?: string[];
        metadata?: JsonObject;
      };
    }
  /**
   * `permission.asked`, then wait for the reply (`once` / `always` /
   * `reject`). `permission` is the 1.x permission name and the 2.x action.
   */
  | {
      type: "permission";
      permission: string;
      patterns?: string[];
      metadata?: JsonObject;
      message?: string;
      branches?: OpenCodeBranches;
    }
  /** 1.x `question.asked`; branch keys `replied`, `rejected`. */
  | { type: "question"; questions: JsonObject[]; branches?: OpenCodeBranches }
  /** 2.x `form.created`; branch keys `replied`, `cancelled`. */
  | {
      type: "form";
      title: string;
      fields: JsonObject[];
      metadata?: JsonObject;
      branches?: OpenCodeBranches;
    }
  /** Any event, already in the generation's wire shape (`{type, properties}` or `{type, data}`). */
  | { type: "event"; event: JsonObject }
  | { type: "delay"; ms: number }
  /** Fail the run: 1.x `session.error`, 2.x `session.step.failed` + `session.execution.failed`. */
  | { type: "error"; message: string; name?: string }
  /** Never finish on its own; abort/interrupt still ends the run. */
  | { type: "hang" };

export type OpenCodePromptScript = {
  /** Picks this script when the prompt text contains `match`. */
  match?: string;
  steps?: OpenCodeStep[];
  /** Step finish reason. Default `stop`. */
  finish?: string;
  tokens?: {
    input: number;
    output: number;
    reasoning?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  cost?: number;
  /** Answer the prompt request with this HTTP status and JSON body instead. */
  reject?: { status: number; body: unknown };
};

export type OpenCodeFakeScenario = {
  /** Server version. Defaults: 1.x `1.18.32`, 2.x `2.0.18`. */
  version?: string;
  /** Directory reported for sessions and `location`. Default: the server's cwd. */
  directory?: string;
  /** Raw `GET /provider` (1.x) or `GET /api/provider` (2.x) body. */
  providers?: unknown;
  /** Raw `GET /api/model` body (2.x). */
  models?: unknown;
  /** Raw `GET /agent` (1.x) or `GET /api/agent` (2.x) body. */
  agents?: unknown;
  /** Raw `GET /api/command` (2.x) or `GET /command` (1.x) body. */
  commands?: unknown;
  /** Sessions that already exist, by id. */
  sessions?: Array<{ id: string; title?: string; directory?: string }>;
  /**
   * Turn scripts, picked by `match` then in order (the last repeats). 2.x
   * prompts go through the session inbox: `delivery:"queue"` runs as a later
   * execution, `delivery:"steer"` joins the running execution at its next step
   * boundary, `resume:false` stays in the inbox.
   */
  prompts?: OpenCodePromptScript[];
  /** SSE keep-alive period. 2.x writes a `: heartbeat` comment (default 15 s); 1.x a `server.heartbeat` event (default 10 s). */
  heartbeatMs?: number;
  /** 1.x: emit `session.error` (MessageAbortedError) on abort. Default true. */
  abortEmitsSessionError?: boolean;
};

/** One request the fake received. */
export type OpenCodeFakeRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
};

export const OPENCODE_FAKE_GENERATION_ENV = "SENTINEL_OPENCODE_FAKE_GENERATION";
export const OPENCODE_FAKE_SCENARIO_ENV = "SENTINEL_OPENCODE_FAKE_SCENARIO";
export const OPENCODE_FAKE_SCENARIO_FILE_ENV =
  "SENTINEL_OPENCODE_FAKE_SCENARIO_FILE";
export const OPENCODE_FAKE_LOG_ENV = "SENTINEL_OPENCODE_FAKE_LOG";

/** Basic credentials both generations accept: user `opencode`. */
export function openCodeBasicAuth(password: string): string {
  return `Basic ${Buffer.from(`opencode:${password}`, "utf8").toString("base64")}`;
}
