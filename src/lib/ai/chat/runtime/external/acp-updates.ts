import {
  readConfigOptions,
  type AcpConfigOptionInfo,
} from "@/lib/ai/chat/engines/acp/config-options";
import {
  asRecord,
  readArray,
  readAvailableCommands,
  readNonEmptyString,
  readNumber,
  readRecord,
  readString,
  type AcpCommandInfo,
  type AcpRawUpdate,
} from "@/lib/ai/chat/engines/acp/schema";

import {
  toExternalToolKind,
  type ExternalAssistantMirror,
  type ExternalToolContent,
  type ExternalToolLocation,
  type ExternalToolStatus,
  type ToolPatch,
} from "./mirror";

// `session/update` → assistant mirror (design acp-and-agents §2.7, critique
// G21). Pure: transcript updates change the mirror; session-state updates
// (mode, commands, config options, title) come back as effects for the run
// to apply. While a `session/load` replays history, transcript updates are
// dropped: the thread already shows that history.

export type AcpUpdateEffect =
  | { commands: AcpCommandInfo[]; type: "commands" }
  | { configOptions: AcpConfigOptionInfo[]; type: "config" }
  | { modeId: string; type: "mode" }
  | { title: string; type: "title" }
  | { kind: string; type: "unknown"; update: AcpRawUpdate };

export type AcpUpdateContext = {
  /** A session/load is replaying history: drop transcript updates. */
  replaying?: boolean;
};

const TRANSCRIPT_KINDS = new Set([
  "agent_message_chunk",
  "agent_thought_chunk",
  "compaction_summary_chunk",
  "compaction_update",
  "notice",
  "plan",
  "plan_removed",
  "plan_update",
  "session_message",
  "session_message_chunk",
  "subagent_update",
  "tool_call",
  "tool_call_update",
  "usage_update",
  "user_message_chunk",
]);

const TOOL_STATUSES = new Set([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

function readToolStatus(update: unknown): ExternalToolStatus | null {
  const status = readString(update, "status");
  return status && TOOL_STATUSES.has(status)
    ? (status as ExternalToolStatus)
    : null;
}

function dataUrl(mediaType: string, data: string) {
  return `data:${mediaType};base64,${data}`;
}

/** A content block's text, or a markdown link for a resource link. */
export function contentBlockText(block: unknown): string | null {
  switch (readString(block, "type")) {
    case "text":
      return readString(block, "text");
    case "resource_link": {
      const uri = readString(block, "uri");
      if (!uri) {
        return null;
      }
      const name =
        readString(block, "title") ?? readString(block, "name") ?? uri;
      return `[${name}](${uri})`;
    }
    case "resource": {
      const resource = readRecord(block, "resource");
      return readString(resource, "text") ?? readString(resource, "uri");
    }
    default:
      return null;
  }
}

function contentBlockImage(block: unknown) {
  if (readString(block, "type") !== "image") {
    return null;
  }
  const data = readString(block, "data");
  const mediaType = readString(block, "mimeType") ?? "image/png";
  if (data) {
    return { mediaType, url: dataUrl(mediaType, data) };
  }
  const uri = readString(block, "uri");
  return uri ? { mediaType, url: uri } : null;
}

/** ACP ToolCallContent[] → the mirror's content (text joined, diffs, terminals, images). */
export function readToolContent(value: unknown): ExternalToolContent {
  const items = Array.isArray(value) ? value : [];
  const texts: string[] = [];
  const content: ExternalToolContent = {};

  for (const item of items) {
    switch (readString(item, "type")) {
      case "content": {
        const block = readRecord(item, "content");
        const text = contentBlockText(block);
        if (text) {
          texts.push(text);
        }
        const image = contentBlockImage(block);
        if (image) {
          (content.images ??= []).push(image);
        }
        break;
      }
      case "diff": {
        const path = readString(item, "path");
        const newText = readString(item, "newText");
        if (path && newText != null) {
          (content.diffs ??= []).push({
            newText,
            oldText: readString(item, "oldText"),
            path,
          });
        }
        break;
      }
      case "terminal": {
        const terminalId = readNonEmptyString(item, "terminalId");
        if (terminalId) {
          (content.terminals ??= []).push({ terminalId });
        }
        break;
      }
      default:
        break;
    }
  }

  if (texts.length > 0) {
    content.text = texts.join("\n");
  }
  return content;
}

function readLocations(value: unknown): ExternalToolLocation[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((location) => {
    const path = readNonEmptyString(location, "path");
    if (!path) {
      return [];
    }
    const line = readNumber(location, "line");
    return [{ path, ...(line != null ? { line } : {}) }];
  });
}

/** The agent's own tool name, when its _meta carries one. */
function readRawToolName(meta: Record<string, unknown> | null) {
  if (!meta) {
    return null;
  }
  for (const value of Object.values(meta)) {
    const nested = asRecord(value);
    const name =
      readNonEmptyString(nested, "toolName") ??
      readNonEmptyString(nested, "tool");
    if (name) {
      return name;
    }
  }
  return (
    readNonEmptyString(meta, "toolName") ?? readNonEmptyString(meta, "tool")
  );
}

/** tool_call / tool_call_update as a partial patch: only fields present change. */
export function toToolPatch(update: AcpRawUpdate): ToolPatch | null {
  const id = readNonEmptyString(update, "toolCallId");
  if (!id) {
    return null;
  }
  const meta = readRecord(update, "_meta");
  const patch: ToolPatch = { id };
  if (typeof update.kind === "string") {
    patch.kind = toExternalToolKind(update.kind);
  } else if (update.sessionUpdate === "tool_call") {
    patch.kind = "other";
  }
  if (typeof update.title === "string") {
    patch.title = update.title;
  }
  const status = readToolStatus(update);
  if (status) {
    patch.status = status;
  }
  if ("rawInput" in update && update.rawInput !== undefined) {
    patch.input = update.rawInput;
  }
  if ("rawOutput" in update && update.rawOutput !== undefined) {
    patch.rawOutput = update.rawOutput;
  }
  if (Array.isArray(update.content)) {
    patch.content = readToolContent(update.content);
  }
  const locations = readLocations(update.locations);
  if (locations) {
    patch.locations = locations;
  }
  const rawName = readRawToolName(meta);
  if (rawName) {
    patch.rawName = rawName;
  }
  return patch;
}

const PLAN_STATUS_LABELS: Record<string, string> = {
  cancelled: "Cancelled",
  completed: "Completed",
  in_progress: "In progress",
};

export type PlanTask = {
  description: string | null;
  priority?: string;
  status: string;
  title: string;
};

/** ACP plan entries (and Cursor todos) as plan-card tasks; statuses kept. */
export function toPlanTasks(entries: unknown): PlanTask[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.flatMap((entry) => {
    const title =
      readNonEmptyString(entry, "content") ??
      readNonEmptyString(entry, "title");
    if (!title) {
      return [];
    }
    const status = readString(entry, "status") ?? "pending";
    const priority = readString(entry, "priority");
    return [
      {
        description: PLAN_STATUS_LABELS[status] ?? null,
        ...(priority ? { priority } : {}),
        status,
        title,
      },
    ];
  });
}

export function buildPlanOutput(input: {
  document?: string;
  goal?: string;
  summary?: string;
  tasks: PlanTask[];
  title: string;
}) {
  return {
    audience: "technical" as const,
    document: input.document ?? "",
    goal: input.goal ?? "Active plan",
    summary: input.summary ?? "",
    taskCount: input.tasks.length,
    tasks: input.tasks,
    title: input.title,
  };
}

function upsertPlanCard(
  mirror: ExternalAssistantMirror,
  id: string,
  toolName: "create_plan" | "update_plan",
  output: ReturnType<typeof buildPlanOutput>,
) {
  mirror.upsertTool({
    id,
    input: {},
    kind: "plan",
    output,
    status: "completed",
    toolName,
  });
}

function appendToolText(
  mirror: ExternalAssistantMirror,
  patch: ToolPatch & { kind: ToolPatch["kind"] },
  text: string,
) {
  const existing = mirror.getTool(patch.id);
  const previous = existing?.content.text ?? "";
  mirror.upsertTool({
    ...patch,
    content: { ...existing?.content, text: previous + text },
  });
}

/**
 * Applies one update to the mirror. Returns the session-state effects the
 * caller applies (mode, commands, config options, title, unknown kinds).
 */
export function applyAcpUpdate(
  mirror: ExternalAssistantMirror,
  update: AcpRawUpdate,
  context: AcpUpdateContext = {},
): AcpUpdateEffect[] {
  const kind = update.sessionUpdate;
  if (context.replaying && TRANSCRIPT_KINDS.has(kind)) {
    return [];
  }
  const messageId = readString(update, "messageId");

  switch (kind) {
    case "agent_message_chunk": {
      const block = readRecord(update, "content");
      const image = contentBlockImage(block);
      if (image) {
        mirror.appendFile(image);
        return [];
      }
      const text = contentBlockText(block);
      if (text) {
        mirror.appendText(text, messageId);
      }
      return [];
    }
    case "agent_thought_chunk": {
      const text = contentBlockText(readRecord(update, "content"));
      if (text) {
        mirror.appendReasoning(text, messageId);
      }
      return [];
    }
    case "user_message_chunk":
      // The agent echoing (or replaying) the user's own message.
      return [];
    case "tool_call":
    case "tool_call_update": {
      const patch = toToolPatch(update);
      if (patch) {
        mirror.upsertTool(patch);
      }
      return [];
    }
    case "plan":
      upsertPlanCard(
        mirror,
        "plan",
        "update_plan",
        buildPlanOutput({
          tasks: toPlanTasks(update.entries),
          title: "Active plan",
        }),
      );
      return [];
    case "plan_update": {
      const plan = readRecord(update, "plan");
      const planId = readNonEmptyString(plan, "planId") ?? "plan";
      const type = readString(plan, "type");
      if (type === "markdown" || type === "file") {
        const document =
          type === "markdown"
            ? (readString(plan, "content") ?? "")
            : `[Plan](${readString(plan, "uri") ?? ""})`;
        upsertPlanCard(
          mirror,
          `plan:${planId}`,
          "create_plan",
          buildPlanOutput({
            document,
            goal: "The agent proposed a plan.",
            tasks: [],
            title: "Plan",
          }),
        );
        return [];
      }
      upsertPlanCard(
        mirror,
        `plan:${planId}`,
        "update_plan",
        buildPlanOutput({
          tasks: toPlanTasks(readArray(plan, "entries")),
          title: "Active plan",
        }),
      );
      return [];
    }
    case "plan_removed": {
      const planId = readNonEmptyString(update, "planId") ?? "plan";
      mirror.removeTool(`plan:${planId}`);
      return [];
    }
    case "usage_update": {
      const used = readNumber(update, "used");
      const size = readNumber(update, "size");
      const cost = readRecord(update, "cost");
      const amount = readNumber(cost, "amount");
      mirror.setUsage({
        ...(size != null ? { contextWindow: size } : {}),
        // Tokens currently in the context: what the context meter reads.
        ...(used != null ? { inputTokens: used } : {}),
        ...(amount != null
          ? {
              cost: {
                amount,
                currency: readString(cost, "currency") ?? "USD",
              },
            }
          : {}),
      });
      return [];
    }
    case "notice": {
      const title = readString(update, "title") ?? "Notice";
      mirror.upsertTool({
        id: `notice:${messageId ?? title}:${readString(update, "description") ?? ""}`,
        input: {},
        kind: "notice",
        meta: { severity: readString(update, "severity") ?? "info" },
        output: {
          description: readString(update, "description"),
          severity: readString(update, "severity") ?? "info",
          title,
        },
        status: "completed",
        title,
      });
      return [];
    }
    case "compaction_update": {
      const compactionId =
        readNonEmptyString(update, "compactionId") ?? "compaction";
      const status = readString(update, "status");
      const summary = (readArray(update, "summary") ?? [])
        .map(contentBlockText)
        .filter(Boolean)
        .join("\n");
      const id = `compaction:${compactionId}`;
      const existing = mirror.getTool(id);
      mirror.upsertTool({
        content: {
          ...existing?.content,
          ...(summary ? { text: summary } : {}),
        },
        id,
        input: {},
        kind: "compaction",
        status:
          status === "completed"
            ? "completed"
            : status === "failed" || status === "cancelled"
              ? "failed"
              : "in_progress",
        title: "Compacting context",
        ...(readString(update, "error")
          ? { errorText: readString(update, "error")! }
          : {}),
      });
      return [];
    }
    case "compaction_summary_chunk": {
      const compactionId =
        readNonEmptyString(update, "compactionId") ?? "compaction";
      const text = contentBlockText(readRecord(update, "content"));
      if (text) {
        appendToolText(
          mirror,
          {
            id: `compaction:${compactionId}`,
            input: {},
            kind: "compaction",
            title: "Compacting context",
          },
          text,
        );
      }
      return [];
    }
    case "subagent_update": {
      const sessionId = readNonEmptyString(update, "sessionId");
      if (!sessionId) {
        return [];
      }
      const state = readRecord(update, "state");
      const stateKind =
        readString(state, "state") ?? readString(state, "status") ?? null;
      mirror.upsertTool({
        id: `subagent:${sessionId}`,
        input: {
          description: readString(update, "description"),
          sessionId,
        },
        kind: "subagent",
        meta: { sessionId, ...(stateKind ? { state: stateKind } : {}) },
        status:
          stateKind === "idle" || stateKind === "completed"
            ? "completed"
            : stateKind === "failed"
              ? "failed"
              : "in_progress",
        title: readString(update, "title") ?? "Subagent",
      });
      return [];
    }
    case "session_message":
    case "session_message_chunk": {
      // Messages between the agent's sessions (subagents talking to the
      // root): shown as a subagent card, never as the assistant's text.
      const id = `session-message:${readNonEmptyString(update, "messageId") ?? "message"}`;
      const sender = readString(update, "senderSessionId");
      const text =
        kind === "session_message"
          ? (readArray(update, "content") ?? [])
              .map(contentBlockText)
              .filter(Boolean)
              .join("\n")
          : (contentBlockText(readRecord(update, "content")) ?? "");
      if (!text) {
        return [];
      }
      const patch = {
        id,
        input: {
          recipientSessionId: readString(update, "recipientSessionId"),
          senderSessionId: sender,
        },
        kind: "subagent" as const,
        status: "completed" as const,
        title: sender ? `Message from ${sender}` : "Session message",
      };
      if (kind === "session_message") {
        mirror.upsertTool({ ...patch, content: { text } });
      } else {
        appendToolText(mirror, patch, text);
      }
      return [];
    }
    case "available_commands_update":
      return [
        {
          commands: readAvailableCommands(update.availableCommands),
          type: "commands",
        },
      ];
    case "current_mode_update": {
      const modeId = readNonEmptyString(update, "currentModeId");
      return modeId ? [{ modeId, type: "mode" }] : [];
    }
    case "config_option_update":
      return [
        {
          configOptions: readConfigOptions(update.configOptions),
          type: "config",
        },
      ];
    case "session_info_update": {
      const title = readNonEmptyString(update, "title");
      return title ? [{ title, type: "title" }] : [];
    }
    default:
      return [{ kind, type: "unknown", update }];
  }
}
