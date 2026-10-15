import os from "node:os";
import path from "node:path";

import {
  asRecord,
  readArray,
  readBoolean,
  readNumber,
  readRecord,
  readString,
} from "@/lib/ai/chat/engines/acp/schema";

import type {
  ExternalAssistantMirror,
  ExternalToolContent,
  ExternalToolDiff,
  ExternalToolKind,
  ExternalToolLocation,
  MirrorUsage,
  ToolPatch,
} from "../external/mirror";

// Pi RPC events onto the shared assistant mirror (design §4 table; t3code
// packages/provider-pi/src/server/adapter.ts, MIT):
// - message_update text_delta / thinking_delta → text / reasoning, one
//   segment per assistant message (Pi messages carry no id: a counter);
// - tool_execution_start / update / end → a tool card by Pi's tool name;
// - compaction_start / end → a compaction card, auto_retry_* → a notice,
//   extension_error → a warning notice;
// - assistant message_end → usage and the stop reason the turn ends with;
// - agent_settled → the turn is over (agent_end only closes one low-level
//   run: retries, compaction and queued messages may follow it).
// Pure apart from the mirror it writes to.

export type PiTurnTracker = {
  /** Assistant messages seen this turn (segment ids). */
  assistantCount: number;
  /** Compactions seen this turn (card ids). */
  compactions: number;
  /** The stop reason and error of the latest assistant message. */
  lastStop: { errorMessage: string | null; stopReason: string | null };
  /** agent_end arrived without a retry pending. */
  ended: boolean;
  settled: boolean;
  /** Pi started an agent run (a handled command never does). */
  started: boolean;
  usage: {
    cacheRead: number;
    cost: number;
    input: number;
    output: number;
    seen: boolean;
    total: number;
  };
};

export function createPiTurnTracker(): PiTurnTracker {
  return {
    assistantCount: 0,
    compactions: 0,
    ended: false,
    lastStop: { errorMessage: null, stopReason: null },
    settled: false,
    started: false,
    usage: {
      cacheRead: 0,
      cost: 0,
      input: 0,
      output: 0,
      seen: false,
      total: 0,
    },
  };
}

export type PiEventEffect =
  | { type: "flush" }
  | { type: "schedule" }
  | { type: "settled" }
  | { type: "ended" }
  | { type: "none" };

const KIND_BY_TOOL: Record<string, ExternalToolKind> = {
  bash: "execute",
  edit: "edit",
  find: "search",
  grep: "search",
  ls: "read",
  read: "read",
  write: "edit",
};

export function piToolKind(toolName: string): ExternalToolKind {
  return KIND_BY_TOOL[toolName] ?? "other";
}

/** A path as Pi's tools read it (a leading "@" dropped, "~" expanded). */
export function normalizePiPath(raw: string) {
  const trimmed = raw.startsWith("@") ? raw.slice(1) : raw;
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/"))
    return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
}

function pathArg(args: unknown) {
  const value = readString(args, "path") ?? readString(args, "file_path");
  return value ? normalizePiPath(value) : null;
}

function editDiffs(toolName: string, args: unknown): ExternalToolDiff[] {
  const file = pathArg(args);
  if (!file) {
    return [];
  }
  if (toolName === "write") {
    const content = readString(args, "content");
    return content === null
      ? []
      : [{ newText: content, oldText: null, path: file }];
  }
  const edits = readArray(args, "edits") ?? [args];
  return edits.flatMap((edit) => {
    const oldText =
      readString(edit, "oldText") ?? readString(edit, "old_string");
    const newText =
      readString(edit, "newText") ?? readString(edit, "new_string");
    return newText === null ? [] : [{ newText, oldText, path: file }];
  });
}

/** Title, kind, locations and content of a Pi tool call from its arguments. */
export function piToolPatch(
  id: string,
  toolName: string,
  args: unknown,
): ToolPatch {
  const kind = piToolKind(toolName);
  const file = pathArg(args);
  const locations: ExternalToolLocation[] = file
    ? [
        {
          path: file,
          ...(readNumber(args, "offset")
            ? { line: readNumber(args, "offset")! }
            : {}),
        },
      ]
    : [];
  const command = readString(args, "command");
  const pattern = readString(args, "pattern");
  const title =
    toolName === "bash" && command
      ? command
      : file
        ? `${toolName} ${file}`
        : pattern
          ? `${toolName} ${pattern}`
          : toolName;
  const diffs = kind === "edit" ? editDiffs(toolName, args) : [];
  return {
    ...(diffs.length > 0 ? { content: { diffs } } : {}),
    id,
    input: args ?? {},
    kind,
    locations,
    rawName: toolName,
    title,
  };
}

/** The text and images of a Pi tool result or partial result. */
export function readPiToolResult(result: unknown) {
  const texts: string[] = [];
  const images: NonNullable<ExternalToolContent["images"]> = [];
  for (const block of readArray(result, "content") ?? []) {
    const type = readString(block, "type");
    if (type === "text") {
      const text = readString(block, "text");
      if (text) texts.push(text);
    } else if (type === "image") {
      const data = readString(block, "data");
      const mimeType = readString(block, "mimeType") ?? "image/png";
      if (data)
        images.push({
          mediaType: mimeType,
          url: `data:${mimeType};base64,${data}`,
        });
    }
  }
  return { images, text: texts.join("\n") };
}

function resultContent(
  toolName: string,
  id: string,
  existing: ExternalToolContent | undefined,
  result: unknown,
  final: boolean,
  isError: boolean,
): ExternalToolContent {
  const { images, text } = readPiToolResult(result);
  if (toolName === "bash" && !isError) {
    const exitCode = readNumber(readRecord(result, "details"), "exitCode");
    return {
      ...existing,
      terminals: [
        {
          ...(final
            ? { exitStatus: { exitCode: exitCode ?? 0, signal: null } }
            : {}),
          output: text,
          terminalId: id,
        },
      ],
    };
  }
  if (piToolKind(toolName) === "edit" && !isError) {
    // The diffs from the arguments say more than Pi's "Successfully …".
    return existing?.diffs?.length
      ? existing
      : { ...existing, ...(text ? { text } : {}) };
  }
  return {
    ...existing,
    ...(text ? { text } : {}),
    ...(images.length > 0 ? { images } : {}),
  };
}

function messageRole(event: unknown) {
  return readString(readRecord(event, "message"), "role");
}

function noticeId(kind: string, detail: unknown) {
  return `${kind}:${typeof detail === "number" || typeof detail === "string" ? detail : "1"}`;
}

/** Applies one Pi event; returns what the emitter should do. */
export function applyPiEvent(
  mirror: ExternalAssistantMirror,
  tracker: PiTurnTracker,
  event: Record<string, unknown> & { type: string },
): PiEventEffect {
  switch (event.type) {
    case "agent_start":
      tracker.started = true;
      tracker.ended = false;
      return { type: "none" };
    case "message_start":
      if (messageRole(event) === "assistant") {
        tracker.assistantCount += 1;
      }
      return { type: "none" };
    case "message_update": {
      const update = readRecord(event, "assistantMessageEvent");
      const segment = `pi-message-${tracker.assistantCount}`;
      switch (readString(update, "type")) {
        case "text_delta":
          mirror.appendText(readString(update, "delta") ?? "", segment);
          return { type: "schedule" };
        case "thinking_delta":
          mirror.appendReasoning(readString(update, "delta") ?? "", segment);
          return { type: "schedule" };
        case "thinking_end":
        case "text_end":
          mirror.closeOpenSegments();
          return { type: "schedule" };
        default:
          return { type: "none" };
      }
    }
    case "message_end": {
      const message = readRecord(event, "message");
      if (readString(message, "role") !== "assistant") {
        return { type: "none" };
      }
      tracker.lastStop = {
        errorMessage: readString(message, "errorMessage"),
        stopReason: readString(message, "stopReason"),
      };
      const usage = readRecord(message, "usage");
      if (usage) {
        tracker.usage.seen = true;
        tracker.usage.input += readNumber(usage, "input") ?? 0;
        tracker.usage.output += readNumber(usage, "output") ?? 0;
        tracker.usage.cacheRead += readNumber(usage, "cacheRead") ?? 0;
        tracker.usage.total += readNumber(usage, "totalTokens") ?? 0;
        tracker.usage.cost +=
          readNumber(readRecord(usage, "cost"), "total") ?? 0;
        mirror.setUsage(trackerUsage(tracker));
      }
      mirror.closeOpenSegments();
      return { type: "schedule" };
    }
    case "tool_execution_start": {
      const id = readString(event, "toolCallId");
      if (!id) return { type: "none" };
      const toolName = readString(event, "toolName") ?? "tool";
      const existing = mirror.getTool(id);
      mirror.upsertTool({
        ...piToolPatch(id, toolName, event.args),
        ...(existing ? { content: existing.content } : {}),
        status: "in_progress",
      });
      return { type: "flush" };
    }
    case "tool_execution_update": {
      const id = readString(event, "toolCallId");
      if (!id) return { type: "none" };
      const toolName =
        readString(event, "toolName") ?? mirror.getTool(id)?.rawName ?? "tool";
      if (!mirror.getTool(id)) {
        mirror.upsertTool({
          ...piToolPatch(id, toolName, event.args),
          status: "in_progress",
        });
      }
      mirror.upsertTool({
        content: resultContent(
          toolName,
          id,
          mirror.getTool(id)?.content,
          event.partialResult,
          false,
          false,
        ),
        id,
      });
      return { type: "schedule" };
    }
    case "tool_execution_end": {
      const id = readString(event, "toolCallId");
      if (!id) return { type: "none" };
      const toolName =
        readString(event, "toolName") ?? mirror.getTool(id)?.rawName ?? "tool";
      if (!mirror.getTool(id)) {
        mirror.upsertTool(piToolPatch(id, toolName, event.args));
      }
      const isError = readBoolean(event, "isError") === true;
      const content = resultContent(
        toolName,
        id,
        mirror.getTool(id)?.content,
        event.result,
        true,
        isError,
      );
      mirror.upsertTool({
        content,
        id,
        rawOutput: asRecord(event.result) ?? undefined,
        status: isError ? "failed" : "completed",
        ...(isError
          ? { errorText: readPiToolResult(event.result).text || "Tool failed" }
          : {}),
      });
      return { type: "flush" };
    }
    case "compaction_start": {
      const reason = readString(event, "reason");
      tracker.compactions += 1;
      mirror.upsertTool({
        id: `compaction:${tracker.compactions}`,
        input: reason ? { reason } : {},
        kind: "compaction",
        status: "in_progress",
        title: "Compacting context",
      });
      return { type: "flush" };
    }
    case "compaction_end": {
      const id = `compaction:${Math.max(1, tracker.compactions)}`;
      const result = readRecord(event, "result");
      const summary = readString(result, "summary");
      const error = readString(event, "errorMessage");
      const aborted = readBoolean(event, "aborted") === true;
      mirror.upsertTool({
        ...(summary ? { content: { text: summary } } : {}),
        id,
        input: {},
        kind: "compaction",
        status: error || aborted ? "failed" : "completed",
        title: "Compacting context",
        ...(error || aborted
          ? { errorText: error ?? "Compaction was cancelled." }
          : {}),
      });
      return { type: "flush" };
    }
    case "auto_retry_start": {
      const attempt = readNumber(event, "attempt");
      const max = readNumber(event, "maxAttempts");
      const error = readString(event, "errorMessage");
      const title = `Retrying${attempt ? ` (attempt ${attempt}${max ? ` of ${max}` : ""})` : ""}`;
      mirror.upsertTool({
        id: noticeId("retry", attempt),
        input: {},
        kind: "notice",
        meta: { severity: "warning" },
        output: { description: error, severity: "warning", title },
        status: "completed",
        title,
      });
      return { type: "flush" };
    }
    case "auto_retry_end": {
      if (readBoolean(event, "success") === false) {
        const title = "Pi gave up retrying";
        mirror.upsertTool({
          id: "retry:failed",
          input: {},
          kind: "notice",
          meta: { severity: "error" },
          output: {
            description: readString(event, "finalError"),
            severity: "error",
            title,
          },
          status: "completed",
          title,
        });
        return { type: "flush" };
      }
      return { type: "none" };
    }
    case "extension_error": {
      const extension = readString(event, "extensionPath");
      const title = "A Pi extension failed";
      mirror.upsertTool({
        id: noticeId(
          "extension-error",
          `${extension ?? ""}:${readString(event, "error") ?? ""}`,
        ),
        input: {},
        kind: "notice",
        meta: { severity: "warning" },
        output: {
          description: [readString(event, "error"), extension]
            .filter(Boolean)
            .join("\n"),
          severity: "warning",
          title,
        },
        status: "completed",
        title,
      });
      return { type: "flush" };
    }
    case "agent_end":
      if (readBoolean(event, "willRetry") !== true) {
        tracker.ended = true;
        return { type: "ended" };
      }
      return { type: "none" };
    case "agent_settled":
      tracker.settled = true;
      return { type: "settled" };
    default:
      return { type: "none" };
  }
}

export function trackerUsage(tracker: PiTurnTracker): MirrorUsage {
  const { usage } = tracker;
  return {
    ...(usage.cacheRead > 0 ? { cachedInputTokens: usage.cacheRead } : {}),
    ...(usage.cost > 0
      ? { cost: { amount: usage.cost, currency: "USD" } }
      : {}),
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.total,
  };
}

/** How the turn ended, from the last assistant message and Stop. */
export function piTurnOutcome(
  tracker: PiTurnTracker,
  cancelRequested: boolean,
): {
  errorMessage: string | null;
  finishReason: string;
  status: "cancelled" | "completed" | "error";
} {
  if (cancelRequested || tracker.lastStop.stopReason === "aborted") {
    return {
      errorMessage: "Generation stopped.",
      finishReason: "stop",
      status: "cancelled",
    };
  }
  if (tracker.lastStop.stopReason === "error") {
    return {
      errorMessage: tracker.lastStop.errorMessage ?? "Pi run failed.",
      finishReason: "error",
      status: "error",
    };
  }
  return {
    errorMessage: null,
    finishReason: tracker.lastStop.stopReason === "length" ? "length" : "stop",
    status: "completed",
  };
}
