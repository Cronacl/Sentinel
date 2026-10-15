import type { ExternalQuestion } from "@/lib/ai/chat/runtime/external/user-input";

// What the OpenCode runtime consumes from either server generation (design
// acp-and-agents §5). v1/events.ts and v2/events.ts translate their wire
// events into this union; the runtime never sees a generation's shapes.
// Pure types.

export type OpenCodeMessageRole = "assistant" | "summary" | "user";

export type OpenCodeTextField = "reasoning" | "text";

export type OpenCodeToolStatus = "completed" | "error" | "pending" | "running";

export type OpenCodeUsage = {
  cachedInputTokens?: number;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
};

export type OpenCodeRunEvent =
  /** A message's role (1.x message.updated; 2.x a step's assistant message). */
  | {
      messageId: string;
      modelId: string | null;
      role: OpenCodeMessageRole;
      sessionId: string;
      type: "message";
    }
  | { messageId: string; sessionId: string; type: "message.removed" }
  /** A text or reasoning part's whole text so far. */
  | {
      field: OpenCodeTextField;
      messageId: string;
      partId: string;
      sessionId: string;
      text: string;
      type: "part.text";
    }
  /** Appended text; `field` is null when only the part's id is known (1.x). */
  | {
      delta: string;
      field: OpenCodeTextField | null;
      messageId: string | null;
      partId: string;
      sessionId: string;
      type: "part.delta";
    }
  | {
      callId: string;
      error?: string;
      input?: unknown;
      messageId: string | null;
      metadata?: Record<string, unknown>;
      output?: unknown;
      sessionId: string;
      status: OpenCodeToolStatus;
      title?: string;
      /** The tool's name (bash, edit…); null when an update omits it. */
      tool: string | null;
      type: "tool";
    }
  | {
      metadata: Record<string, unknown>;
      /** 1.x permission name / 2.x action (bash, edit, shell…). */
      permission: string;
      patterns: string[];
      requestId: string;
      sessionId: string;
      /** The tool call that asked, when the request came from one. */
      toolCallId: string | null;
      type: "permission.asked";
    }
  | {
      reply: string;
      requestId: string;
      sessionId: string;
      type: "permission.replied";
    }
  /** 1.x question.asked or 2.x form.created, as user-input questions. */
  | {
      questions: ExternalQuestion[];
      requestId: string;
      sessionId: string;
      source: "form" | "question";
      title: string | null;
      toolCallId: string | null;
      type: "question.asked";
    }
  | {
      outcome: "rejected" | "replied";
      requestId: string;
      response: string | null;
      sessionId: string;
      type: "question.settled";
    }
  /** A subagent session (task tool) under `parentId`. */
  | { parentId: string; sessionId: string; type: "session.child" }
  /** 1.x: the session finished everything it was asked. */
  | { sessionId: string; type: "session.idle" }
  /** 1.x session.error. */
  | {
      aborted: boolean;
      contextOverflow: boolean;
      message: string;
      sessionId: string;
      type: "session.error";
    }
  /** 2.x: an execution (one or more steps) started. */
  | { sessionId: string; type: "execution.started" }
  /**
   * 2.x: the execution ended; ends the turn. Any `session.execution.*`
   * other than `started` counts, decodable or not.
   */
  | {
      error: string | null;
      outcome: "failed" | "interrupted" | "succeeded";
      sessionId: string;
      type: "execution.ended";
    }
  /** 2.x session.step.failed; `aborted` is an interruption. */
  | {
      aborted: boolean;
      message: string | null;
      sessionId: string;
      type: "step.failed";
    }
  /** One finished step's token use and cost (summed per turn). */
  | { sessionId: string; type: "usage"; usage: OpenCodeUsage };

export function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `{input, output, reasoning, cache: {read}}` and a cost, as OpenCodeUsage. */
export function readOpenCodeUsage(
  tokens: unknown,
  cost: unknown,
): OpenCodeUsage | null {
  const record = readRecord(tokens);
  const cache = readRecord(record?.cache);
  const usage: OpenCodeUsage = {};
  const input = readNumber(record?.input);
  const output = readNumber(record?.output);
  const reasoning = readNumber(record?.reasoning);
  const cachedInput = readNumber(cache?.read);
  const costUsd = readNumber(cost);
  if (input !== null) usage.inputTokens = input;
  if (output !== null) usage.outputTokens = output;
  if (reasoning !== null && reasoning > 0) usage.reasoningTokens = reasoning;
  if (cachedInput !== null && cachedInput > 0) {
    usage.cachedInputTokens = cachedInput;
  }
  if (costUsd !== null) usage.costUsd = costUsd;
  return Object.keys(usage).length > 0 ? usage : null;
}
