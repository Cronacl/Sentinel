import {
  parseQuestionResponse,
  type ExternalQuestion,
} from "@/lib/ai/chat/runtime/external/user-input";

import {
  readOpenCodeUsage,
  readRecord,
  readString,
  type OpenCodeRunEvent,
  type OpenCodeTextField,
} from "../events";

// OpenCode 2.x `/api/event` envelopes (`{id, created, type, durable?,
// location, data}`, @opencode/client 2.0.24) as OpenCodeRunEvent. Event
// names follow t3code OpenCode2AdapterV2.ts (MIT). Decoding is per field
// and tolerant: an event a newer server extended still maps, and any
// `session.execution.*` other than `started` ends the turn even when this
// build does not know it. Pure.

export type OpenCodeFormField = Record<string, unknown> & {
  key: string;
  type: string;
};

function isOpenCodeFormField(value: unknown): value is OpenCodeFormField {
  const record = readRecord(value);
  return (
    typeof record?.key === "string" &&
    typeof record.type === "string" &&
    record.hidden !== true
  );
}

/** A form's visible fields (hidden ones are never asked). */
export function readFormFields(fields: unknown): OpenCodeFormField[] {
  return Array.isArray(fields) ? fields.filter(isOpenCodeFormField) : [];
}

const BOOLEAN_OPTIONS = [
  { id: "true", label: "Yes" },
  { id: "false", label: "No" },
];

function fieldOptions(field: OpenCodeFormField) {
  if (field.type === "boolean") return BOOLEAN_OPTIONS;
  if (!Array.isArray(field.options)) return [];
  return field.options.flatMap((option) => {
    const record = readRecord(option);
    const value = readString(record?.value);
    if (!value) return [];
    const description = readString(record?.description);
    return [
      {
        ...(description ? { description } : {}),
        id: value,
        label: readString(record?.label) ?? value,
      },
    ];
  });
}

/** A form's fields as user-input questions (one per field). */
export function toFormQuestions(fields: unknown): ExternalQuestion[] {
  return readFormFields(fields).map((field) => {
    const title = readString(field.title);
    const description = readString(field.description);
    const url = field.type === "external" ? readString(field.url) : null;
    const question = [title ?? description ?? field.key, url]
      .filter(Boolean)
      .join(": ");
    return {
      ...(title && description ? { header: title } : {}),
      id: field.key,
      multiSelect: field.type === "multiselect",
      options: fieldOptions(field),
      question: title && description ? description : question,
    };
  });
}

/**
 * The user-input card's answer as a FormAnswer (`{[key]: value}`): option
 * values for choice fields, booleans and numbers typed as the field says,
 * free text otherwise. Unanswered fields are left out.
 */
export function toFormAnswer(
  fields: unknown,
  response: string,
): Record<string, boolean | number | string | string[]> {
  const visible = readFormFields(fields);
  const questions = toFormQuestions(fields);
  const parsed = parseQuestionResponse(questions, response);
  const answer: Record<string, boolean | number | string | string[]> = {};
  for (const item of parsed.answers) {
    const field = visible.find(
      (candidate) => candidate.key === item.questionId,
    );
    if (!field) continue;
    const text = item.text?.trim() ?? "";
    switch (field.type) {
      case "boolean": {
        const selected = item.selectedOptionIds[0];
        if (selected) answer[field.key] = selected === "true";
        else if (/^(y|yes|true)$/i.test(text)) answer[field.key] = true;
        else if (/^(n|no|false)$/i.test(text)) answer[field.key] = false;
        break;
      }
      case "multiselect": {
        const values = [...item.selectedOptionIds];
        if (text && field.custom === true) values.push(text);
        if (values.length > 0) answer[field.key] = values;
        break;
      }
      case "number":
      case "integer": {
        const value = Number(text);
        if (text && Number.isFinite(value)) {
          answer[field.key] =
            field.type === "integer" ? Math.trunc(value) : value;
        }
        break;
      }
      case "external":
        break;
      default: {
        const value = item.selectedOptionIds[0] ?? text;
        if (value) answer[field.key] = value;
      }
    }
  }
  return answer;
}

function summarizeFormAnswer(answer: unknown) {
  const record = readRecord(answer);
  if (!record) return null;
  const values = Object.values(record).map((value) =>
    Array.isArray(value) ? value.join(", ") : String(value),
  );
  return values.length > 0 ? values.join(", ") : null;
}

function textPartId(
  messageId: string,
  field: OpenCodeTextField,
  ordinal: unknown,
) {
  return `${messageId}:${field}:${typeof ordinal === "number" ? ordinal : 0}`;
}

function toolOutputText(content: unknown) {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((block) => {
      const record = readRecord(block);
      return record?.type === "text" ? (readString(record.text) ?? "") : "";
    })
    .filter(Boolean)
    .join("\n");
  return text;
}

const EXECUTION_PREFIX = "session.execution.";

export function normalizeV2Event(event: unknown): OpenCodeRunEvent | null {
  const record = readRecord(event);
  const type = readString(record?.type);
  const data = readRecord(record?.data);
  if (!type || !data) return null;
  const sessionId = readString(data.sessionID);

  if (type.startsWith(EXECUTION_PREFIX)) {
    if (!sessionId) return null;
    const kind = type.slice(EXECUTION_PREFIX.length);
    if (kind === "started") return { sessionId, type: "execution.started" };
    const error = readRecord(data.error);
    return {
      error:
        kind === "failed"
          ? (readString(error?.message) ?? "OpenCode run failed.")
          : null,
      outcome:
        kind === "interrupted"
          ? "interrupted"
          : kind === "succeeded"
            ? "succeeded"
            : "failed",
      sessionId,
      type: "execution.ended",
    };
  }

  switch (type) {
    case "session.created": {
      const parentId = readString(data.parentID);
      return sessionId && parentId
        ? { parentId, sessionId, type: "session.child" }
        : null;
    }
    case "session.step.started": {
      const messageId = readString(data.assistantMessageID);
      if (!sessionId || !messageId) return null;
      const model = readRecord(data.model);
      const providerId = readString(model?.providerID);
      const modelId = readString(model?.id);
      return {
        messageId,
        modelId: providerId && modelId ? `${providerId}/${modelId}` : null,
        role: "assistant",
        sessionId,
        type: "message",
      };
    }
    case "session.step.ended": {
      const usage = readOpenCodeUsage(data.tokens, data.cost);
      return sessionId && usage ? { sessionId, type: "usage", usage } : null;
    }
    case "session.step.failed": {
      if (!sessionId) return null;
      const error = readRecord(data.error);
      return {
        aborted: error?.type === "aborted",
        message: readString(error?.message),
        sessionId,
        type: "step.failed",
      };
    }
    case "session.text.started":
    case "session.text.delta":
    case "session.text.ended":
    case "session.reasoning.started":
    case "session.reasoning.delta":
    case "session.reasoning.ended": {
      const messageId = readString(data.assistantMessageID);
      if (!sessionId || !messageId) return null;
      const field: OpenCodeTextField = type.startsWith("session.text.")
        ? "text"
        : "reasoning";
      const partId = textPartId(messageId, field, data.ordinal);
      if (type.endsWith(".delta")) {
        const delta = readString(data.delta);
        return delta
          ? { delta, field, messageId, partId, sessionId, type: "part.delta" }
          : null;
      }
      const text = type.endsWith(".ended") ? readString(data.text) : "";
      return text === null
        ? null
        : { field, messageId, partId, sessionId, text, type: "part.text" };
    }
    case "session.tool.input.started":
    case "session.tool.called":
    case "session.tool.progress":
    case "session.tool.success":
    case "session.tool.failed": {
      const callId = readString(data.id);
      if (!sessionId || !callId) return null;
      const metadata = readRecord(data.metadata);
      const base = {
        callId,
        messageId: readString(data.assistantMessageID),
        ...(metadata ? { metadata } : {}),
        sessionId,
        tool: readString(data.name),
        type: "tool" as const,
      };
      switch (type) {
        case "session.tool.input.started":
          return { ...base, status: "pending" };
        case "session.tool.called":
          return { ...base, input: data.input, status: "running" };
        case "session.tool.progress":
          return { ...base, status: "running" };
        case "session.tool.success":
          return {
            ...base,
            output: toolOutputText(data.content) ?? data.content,
            status: "completed",
          };
        default:
          return {
            ...base,
            error: readString(readRecord(data.error)?.message) ?? "Tool failed",
            status: "error",
          };
      }
    }
    case "permission.asked": {
      const requestId = readString(data.id);
      if (!sessionId || !requestId) return null;
      const source = readRecord(data.source);
      const patterns = Array.isArray(data.resources)
        ? data.resources.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      return {
        metadata: {
          ...readRecord(data.metadata),
          ...(readString(data.message) ? { message: data.message } : {}),
        },
        permission: readString(data.action) ?? "permission",
        patterns,
        requestId,
        sessionId,
        toolCallId: source?.type === "tool" ? readString(source.id) : null,
        type: "permission.asked",
      };
    }
    case "permission.replied": {
      const requestId = readString(data.requestID);
      return sessionId && requestId
        ? {
            reply:
              readString(data.reply) ?? readString(data.decision) ?? "reject",
            requestId,
            sessionId,
            type: "permission.replied",
          }
        : null;
    }
    case "form.created": {
      const form = readRecord(data.form);
      const requestId = readString(form?.id);
      const formSession = readString(form?.sessionID) ?? sessionId;
      if (!form || !requestId || !formSession) return null;
      return {
        questions: toFormQuestions(form.fields),
        requestId,
        sessionId: formSession,
        source: "form",
        title: readString(form.title),
        toolCallId: null,
        type: "question.asked",
      };
    }
    case "form.replied":
    case "form.cancelled": {
      const requestId = readString(data.id);
      if (!sessionId || !requestId) return null;
      return {
        outcome: type === "form.replied" ? "replied" : "rejected",
        requestId,
        response:
          type === "form.replied" ? summarizeFormAnswer(data.answer) : null,
        sessionId,
        type: "question.settled",
      };
    }
    default:
      return null;
  }
}
