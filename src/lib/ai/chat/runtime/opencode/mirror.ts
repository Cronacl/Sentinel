import type {
  OpenCodeMessageRole,
  OpenCodeRunEvent,
  OpenCodeTextField,
  OpenCodeUsage,
} from "@/lib/ai/chat/engines/opencode-sdk/events";
import type {
  ThreadMessageMetadata,
  ThreadUIMessage,
} from "@/lib/ai/messages/types";

// The assistant message of one OpenCode turn, rebuilt per message and part
// (P9 follow-up). OpenCode reports text, reasoning and tool calls as parts
// of one or more assistant messages (1.x) or steps (2.x), and updates a part
// in place: a part's full text can arrive after later parts started.
// - Every part keeps the place it was first seen in, across messages and
//   steps, and renders as its own UI part, so text of two steps never runs
//   together and a late full-text update lands where the part is.
// - Only parts of assistant messages are shown (user echoes and compaction
//   summaries are not). 2.x only streams assistant content.
// - A permission request attaches to the tool call that asked (1.x
//   `tool.callID`, 2.x `source.id`); without one it is its own part.
// - Tool parts keep OpenCode's tool names (`opencode_bash`…) for the
//   OpenCode renderers. Pure: no I/O.

export type OpenCodeToolState =
  | "approval-requested"
  | "approval-responded"
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-denied"
  | "output-error";

type Approval = {
  approved?: boolean;
  decision?: string;
  id: string;
  reason?: string;
};

type TextEntry = {
  field: OpenCodeTextField;
  key: string;
  kind: "text";
  messageId: string | null;
  text: string;
};

export type OpenCodeToolEntry = {
  approval?: Approval;
  errorText?: string;
  input?: unknown;
  key: string;
  kind: "tool";
  name: string;
  output?: unknown;
  state: OpenCodeToolState;
  title?: string;
  /** A question card: tool updates no longer replace its name and input. */
  userInput?: boolean;
};

type Entry = OpenCodeToolEntry | TextEntry;

const FINAL_STATES = new Set<OpenCodeToolState>([
  "output-available",
  "output-denied",
  "output-error",
]);

export function normalizeOpenCodeToolName(toolName: string) {
  return `opencode_${toolName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")}`;
}

export const OPENCODE_USER_INPUT_TOOL = "opencode_ask_question";

export type OpenCodeMirror = ReturnType<typeof createOpenCodeMirror>;

export function createOpenCodeMirror(options: {
  /** 2.x streams only assistant content: unknown messages are assistant. */
  assumeAssistant: boolean;
}) {
  const entries = new Map<string, Entry>();
  const roles = new Map<string, OpenCodeMessageRole>();
  const partFields = new Map<string, OpenCodeTextField>();
  let responseModelId: string | null = null;
  let usage: OpenCodeUsage | null = null;

  const isAssistant = (messageId: string | null) => {
    if (!messageId) return options.assumeAssistant;
    const role = roles.get(messageId);
    return role ? role === "assistant" : options.assumeAssistant;
  };

  function textEntry(
    key: string,
    field: OpenCodeTextField,
    messageId: string | null,
  ): TextEntry {
    const existing = entries.get(key);
    if (existing?.kind === "text") return existing;
    const entry: TextEntry = { field, key, kind: "text", messageId, text: "" };
    entries.set(key, entry);
    return entry;
  }

  function toolEntry(key: string, name: string): OpenCodeToolEntry {
    const existing = entries.get(key);
    if (existing?.kind === "tool") return existing;
    const entry: OpenCodeToolEntry = {
      key,
      kind: "tool",
      name,
      state: "input-streaming",
    };
    entries.set(key, entry);
    return entry;
  }

  function stateForStatus(
    current: OpenCodeToolState | null,
    status: "completed" | "error" | "pending" | "running",
  ): OpenCodeToolState {
    if (current === "output-denied") return current;
    if (status === "completed") return "output-available";
    if (status === "error") return "output-error";
    // A call waiting on (or just past) its approval keeps that state until
    // it finishes.
    if (current === "approval-requested" || current === "approval-responded") {
      return current;
    }
    return status === "running" ? "input-available" : "input-streaming";
  }

  const mirror = {
    /**
     * Applies a content event. Returns "structural" for changes that
     * should be flushed at once, "delta" for streamed text, null when the
     * event changed nothing.
     */
    apply(event: OpenCodeRunEvent): "delta" | "structural" | null {
      switch (event.type) {
        case "message":
          roles.set(event.messageId, event.role);
          if (event.role === "assistant" && event.modelId) {
            responseModelId = event.modelId;
          }
          return "structural";
        case "message.removed":
          roles.delete(event.messageId);
          for (const [key, entry] of entries) {
            if (entry.kind === "text" && entry.messageId === event.messageId) {
              entries.delete(key);
            }
          }
          return "structural";
        case "part.text": {
          partFields.set(event.partId, event.field);
          const entry = textEntry(event.partId, event.field, event.messageId);
          entry.messageId = event.messageId;
          // A stale full-text update never shortens what deltas built.
          if (event.text.length >= entry.text.length) entry.text = event.text;
          return isAssistant(event.messageId) ? "delta" : null;
        }
        case "part.delta": {
          const field =
            event.field ?? partFields.get(event.partId) ?? ("text" as const);
          const known = entries.get(event.partId);
          const messageId =
            event.messageId ??
            (known?.kind === "text" ? known.messageId : null);
          const entry = textEntry(event.partId, field, messageId);
          entry.text += event.delta;
          return isAssistant(messageId) ? "delta" : null;
        }
        case "tool": {
          const entry = toolEntry(
            event.callId,
            normalizeOpenCodeToolName(event.tool ?? "tool"),
          );
          if (!entry.userInput) {
            if (event.tool) entry.name = normalizeOpenCodeToolName(event.tool);
            if (event.input !== undefined) entry.input = event.input;
          }
          if (event.title) entry.title = event.title;
          const next = stateForStatus(entry.state, event.status);
          if (next === "output-available" && !entry.userInput) {
            entry.output = event.output ?? entry.output ?? "";
          }
          if (next === "output-error") {
            entry.errorText = event.error || entry.errorText || "Tool failed";
          }
          entry.state = next;
          return "structural";
        }
        case "usage":
          usage = {
            cachedInputTokens:
              (usage?.cachedInputTokens ?? 0) +
              (event.usage.cachedInputTokens ?? 0),
            costUsd: (usage?.costUsd ?? 0) + (event.usage.costUsd ?? 0),
            inputTokens:
              (usage?.inputTokens ?? 0) + (event.usage.inputTokens ?? 0),
            outputTokens:
              (usage?.outputTokens ?? 0) + (event.usage.outputTokens ?? 0),
            reasoningTokens:
              (usage?.reasoningTokens ?? 0) +
              (event.usage.reasoningTokens ?? 0),
          };
          return null;
        default:
          return null;
      }
    },

    /**
     * A permission request, on the tool call that asked when known.
     * Returns the entry key the request belongs to.
     */
    requestApproval(input: {
      input: unknown;
      name: string;
      requestId: string;
      toolCallId: string | null;
    }) {
      const key = input.toolCallId ?? input.requestId;
      const entry = toolEntry(key, input.name);
      if (!input.toolCallId) entry.input = input.input;
      else if (entry.input === undefined) entry.input = input.input;
      entry.approval = { id: input.requestId };
      entry.state = "approval-requested";
      return key;
    },

    respondToApproval(
      key: string,
      approval: Omit<Approval, "id"> & { approved: boolean },
    ) {
      const entry = entries.get(key);
      if (entry?.kind !== "tool") return;
      entry.approval = {
        ...approval,
        id: entry.approval?.id ?? key,
      };
      if (FINAL_STATES.has(entry.state) && entry.state !== "output-denied") {
        // The call finished before the reply was mirrored.
        return;
      }
      entry.state = approval.approved ? "approval-responded" : "output-denied";
    },

    /** A question card (on the asking tool call when known). */
    askQuestion(input: {
      input: unknown;
      requestId: string;
      toolCallId: string | null;
    }) {
      const key = input.toolCallId ?? input.requestId;
      const entry = toolEntry(key, OPENCODE_USER_INPUT_TOOL);
      entry.name = OPENCODE_USER_INPUT_TOOL;
      entry.userInput = true;
      entry.input = input.input;
      entry.approval = { id: input.requestId };
      entry.state = "approval-requested";
      return key;
    },

    answerQuestion(key: string, output: unknown) {
      const entry = entries.get(key);
      if (entry?.kind !== "tool") return;
      entry.output = output;
      entry.state = "output-available";
    },

    declineQuestion(key: string, reason: string) {
      const entry = entries.get(key);
      if (entry?.kind !== "tool") return;
      entry.approval = {
        approved: false,
        id: entry.approval?.id ?? key,
        reason,
      };
      entry.state = "output-denied";
    },

    getTool(key: string) {
      const entry = entries.get(key);
      return entry?.kind === "tool" ? entry : null;
    },

    /** Turn end: calls that never finished become errors. */
    finishDanglingTools(reason: string) {
      for (const entry of entries.values()) {
        if (entry.kind === "tool" && !FINAL_STATES.has(entry.state)) {
          entry.state = "output-error";
          entry.errorText = reason;
        }
      }
    },

    hasAssistantContent() {
      return [...entries.values()].some(
        (entry) =>
          entry.kind === "tool" ||
          (entry.text.trim().length > 0 && isAssistant(entry.messageId)),
      );
    },

    getResponseModelId() {
      return responseModelId;
    },

    usageMetadata(): ThreadMessageMetadata["usage"] | undefined {
      if (!usage) return undefined;
      return {
        ...(usage.cachedInputTokens
          ? { cachedInputTokens: usage.cachedInputTokens }
          : {}),
        ...(usage.costUsd
          ? { cost: { amount: usage.costUsd, currency: "USD" } }
          : {}),
        ...(usage.inputTokens ? { inputTokens: usage.inputTokens } : {}),
        ...(usage.outputTokens ? { outputTokens: usage.outputTokens } : {}),
        ...(usage.reasoningTokens
          ? { reasoningTokens: usage.reasoningTokens }
          : {}),
        ...(usage.inputTokens || usage.outputTokens
          ? {
              totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
            }
          : {}),
      };
    },

    toParts(options: { streaming?: boolean } = {}): ThreadUIMessage["parts"] {
      const parts: ThreadUIMessage["parts"] = [];
      const visible = [...entries.values()].filter(
        (entry) =>
          entry.kind === "tool" ||
          (entry.text.trim().length > 0 && isAssistant(entry.messageId)),
      );
      const last = visible.at(-1);
      for (const entry of visible) {
        if (entry.kind === "text") {
          const state =
            options.streaming && entry === last ? "streaming" : "done";
          parts.push(
            entry.field === "reasoning"
              ? { state, text: entry.text.trim(), type: "reasoning" }
              : { state, text: entry.text.trim(), type: "text" },
          );
          continue;
        }
        parts.push(toolPart(entry));
      }
      return parts.length > 0 ? parts : [{ text: " ", type: "text" }];
    },
  };

  return mirror;
}

function toolPart(entry: OpenCodeToolEntry): ThreadUIMessage["parts"][number] {
  const base = {
    input: entry.input ?? {},
    ...(entry.title ? { title: entry.title } : {}),
    toolCallId: entry.key,
    toolName: entry.name,
    type: "dynamic-tool" as const,
  };
  const approval = entry.approval;
  switch (entry.state) {
    case "approval-requested":
      return {
        ...base,
        approval: { id: approval?.id ?? entry.key },
        state: "approval-requested",
      } as ThreadUIMessage["parts"][number];
    case "approval-responded":
      return {
        ...base,
        approval: {
          approved: approval?.approved ?? true,
          id: approval?.id ?? entry.key,
          ...(approval?.decision ? { decision: approval.decision } : {}),
          ...(approval?.reason ? { reason: approval.reason } : {}),
        },
        state: "approval-responded",
      } as ThreadUIMessage["parts"][number];
    case "output-denied":
      return {
        ...base,
        approval: {
          approved: false,
          id: approval?.id ?? entry.key,
          ...(approval?.decision ? { decision: approval.decision } : {}),
          ...(approval?.reason ? { reason: approval.reason } : {}),
        },
        state: "output-denied",
      } as ThreadUIMessage["parts"][number];
    case "output-available":
      return {
        ...base,
        output: entry.output ?? "",
        state: "output-available",
      } as ThreadUIMessage["parts"][number];
    case "output-error":
      return {
        ...base,
        errorText: entry.errorText ?? "Tool failed",
        state: "output-error",
      } as ThreadUIMessage["parts"][number];
    default:
      return {
        ...base,
        state: entry.state,
      } as ThreadUIMessage["parts"][number];
  }
}
