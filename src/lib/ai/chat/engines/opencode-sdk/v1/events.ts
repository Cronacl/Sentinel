import type { ExternalQuestion } from "@/lib/ai/chat/runtime/external/user-input";

import {
  readOpenCodeUsage,
  readRecord,
  readString,
  type OpenCodeMessageRole,
  type OpenCodeRunEvent,
  type OpenCodeToolStatus,
} from "../events";

// OpenCode 1.x `/event` payloads (`{type, properties}`, @opencode-ai/sdk
// v2 typings) as OpenCodeRunEvent. Unknown or malformed events map to
// nothing. Pure.

export type OpenCodeSessionErrorOutcome = {
  aborted: boolean;
  // Not terminal on its own: with the default `compaction.auto` the server
  // publishes this error, compacts the session and keeps going; only with
  // auto-compaction off does session.idle follow without a new assistant
  // message (opencode 1.18.35 session/processor.ts `halt`).
  contextOverflow: boolean;
  message: string;
};

// `session.error` carries `{error?: {name, data: {message}}}` (the SDK's
// ProviderAuthError | UnknownError | APIError | … union); the readable text
// is `data.message`, not `error.message`. Mirrors t3code's
// openCodeErrorMessage.
export function resolveOpenCodeSessionError(
  properties: unknown,
): OpenCodeSessionErrorOutcome {
  const record = readRecord(properties) ?? {};
  const error = readRecord(record.error);
  const data = readRecord(error?.data);
  const name = readString(error?.name);
  const message = [data?.message, error?.message, record.message, name].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  return {
    aborted: name === "MessageAbortedError",
    contextOverflow: name === "ContextOverflowError",
    message: message ?? "OpenCode run failed.",
  };
}

function resolveRole(info: Record<string, unknown>): OpenCodeMessageRole {
  if (info.role !== "assistant") return "user";
  // A compaction summary (assistant, `summary: true`) is internal context
  // for OpenCode, never part of the visible answer.
  return info.summary === true ? "summary" : "assistant";
}

function headerId(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
}

export function openCodeQuestionId(index: number, header: string) {
  const slug = headerId(header);
  return slug.length > 0 ? `question-${index}-${slug}` : `question-${index}`;
}

/** 1.x QuestionRequest.questions as user-input questions. */
export function toV1Questions(questions: unknown): ExternalQuestion[] {
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((value, index) => {
    const question = readRecord(value);
    const text = readString(question?.question);
    if (!question || !text) return [];
    const header = readString(question.header) ?? "";
    const options = Array.isArray(question.options) ? question.options : [];
    return [
      {
        ...(header ? { header } : {}),
        id: openCodeQuestionId(index, header),
        multiSelect: question.multiple === true,
        options: options.flatMap((option, optionIndex) => {
          const record = readRecord(option);
          const label = readString(record?.label);
          if (!label) return [];
          const description = readString(record?.description);
          return [
            {
              ...(description ? { description } : {}),
              id: `option-${optionIndex}`,
              label,
            },
          ];
        }),
        question: text,
      },
    ];
  });
}

function toolEvent(
  sessionId: string,
  part: Record<string, unknown>,
): OpenCodeRunEvent | null {
  const state = readRecord(part.state);
  const status = readString(state?.status) as OpenCodeToolStatus | null;
  const callId = readString(part.callID) || readString(part.id);
  if (!state || !status || !callId) return null;
  return {
    callId,
    ...(status === "error" ? { error: readString(state.error) ?? "" } : {}),
    ...("input" in state ? { input: state.input } : {}),
    messageId: readString(part.messageID),
    ...(readRecord(state.metadata)
      ? { metadata: readRecord(state.metadata)! }
      : {}),
    ...(status === "completed" ? { output: state.output } : {}),
    sessionId,
    status,
    ...(readString(state.title) ? { title: readString(state.title)! } : {}),
    tool: readString(part.tool),
    type: "tool",
  };
}

export function normalizeV1Event(event: unknown): OpenCodeRunEvent | null {
  const record = readRecord(event);
  const type = readString(record?.type);
  const properties = readRecord(record?.properties);
  if (!type || !properties) return null;
  const sessionId = readString(properties.sessionID);

  switch (type) {
    case "session.created":
    case "session.updated": {
      const info = readRecord(properties.info);
      const id = readString(info?.id);
      const parentId = readString(info?.parentID);
      return id && parentId
        ? { parentId, sessionId: id, type: "session.child" }
        : null;
    }
    case "message.updated": {
      const info = readRecord(properties.info);
      const messageId = readString(info?.id);
      const messageSession = sessionId ?? readString(info?.sessionID);
      if (!info || !messageId || !messageSession) return null;
      const providerId = readString(info.providerID);
      const modelId = readString(info.modelID);
      return {
        messageId,
        modelId: providerId && modelId ? `${providerId}/${modelId}` : null,
        role: resolveRole(info),
        sessionId: messageSession,
        type: "message",
      };
    }
    case "message.removed": {
      const messageId = readString(properties.messageID);
      return sessionId && messageId
        ? { messageId, sessionId, type: "message.removed" }
        : null;
    }
    case "message.part.delta": {
      const partId = readString(properties.partID);
      const delta = readString(properties.delta);
      const field = readString(properties.field);
      if (!sessionId || !partId || !delta) return null;
      if (field !== null && field !== "text") return null;
      return {
        delta,
        field: null,
        messageId: readString(properties.messageID),
        partId,
        sessionId,
        type: "part.delta",
      };
    }
    case "message.part.updated": {
      const part = readRecord(properties.part);
      const partSession = sessionId ?? readString(part?.sessionID);
      const partId = readString(part?.id);
      const messageId = readString(part?.messageID);
      if (!part || !partSession || !partId || !messageId) return null;
      if (part.type === "text" || part.type === "reasoning") {
        return {
          field: part.type,
          messageId,
          partId,
          sessionId: partSession,
          text: readString(part.text) ?? "",
          type: "part.text",
        };
      }
      if (part.type === "tool") return toolEvent(partSession, part);
      if (part.type === "step-finish") {
        const usage = readOpenCodeUsage(part.tokens, part.cost);
        return usage ? { sessionId: partSession, type: "usage", usage } : null;
      }
      return null;
    }
    case "permission.asked": {
      const requestId = readString(properties.id);
      if (!sessionId || !requestId) return null;
      const patterns = Array.isArray(properties.patterns)
        ? properties.patterns.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      return {
        metadata: readRecord(properties.metadata) ?? {},
        permission: readString(properties.permission) ?? "permission",
        patterns,
        requestId,
        sessionId,
        toolCallId: readString(readRecord(properties.tool)?.callID),
        type: "permission.asked",
      };
    }
    case "permission.replied": {
      const requestId = readString(properties.requestID);
      return sessionId && requestId
        ? {
            reply: readString(properties.reply) ?? "reject",
            requestId,
            sessionId,
            type: "permission.replied",
          }
        : null;
    }
    case "question.asked": {
      const requestId = readString(properties.id);
      if (!sessionId || !requestId) return null;
      return {
        questions: toV1Questions(properties.questions),
        requestId,
        sessionId,
        source: "question",
        title: null,
        toolCallId: readString(readRecord(properties.tool)?.callID),
        type: "question.asked",
      };
    }
    case "question.replied":
    case "question.rejected": {
      const requestId = readString(properties.requestID);
      if (!sessionId || !requestId) return null;
      const answers = Array.isArray(properties.answers)
        ? properties.answers.flat().filter((v) => typeof v === "string")
        : [];
      return {
        outcome: type === "question.replied" ? "replied" : "rejected",
        requestId,
        response: type === "question.replied" ? answers.join(", ") : null,
        sessionId,
        type: "question.settled",
      };
    }
    case "session.idle":
      return sessionId ? { sessionId, type: "session.idle" } : null;
    case "session.error":
      return sessionId
        ? {
            ...resolveOpenCodeSessionError(properties),
            sessionId,
            type: "session.error",
          }
        : null;
    default:
      return null;
  }
}
