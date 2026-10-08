import type {
  ThreadMessageMetadata,
  ThreadUIMessage,
} from "@/lib/ai/messages/types";

// The assistant message an external agent run builds, entry by entry, in
// arrival order (design acp-and-agents §1.5). Shared by every external
// runtime that streams text, thoughts and tool calls (ACP today).
//
// - Text and reasoning append to the open segment only while it is the last
//   entry and has the same messageId; anything in between (a tool call)
//   starts a new segment, so text interleaves with tools exactly as it
//   arrived. (The Cursor mirror this replaces kept one text part at order 0.)
// - Tool calls merge partially: fields an update carries overwrite, absent
//   ones keep their value, `content` replaces wholesale, and an absent
//   status keeps the current state (it never means "completed").
// - Tool parts carry their display data in callProviderMetadata.sentinel:
//   kind (the renderer discriminator), the agent's label, its raw tool name
//   and title, file locations, permission options and a live preview of the
//   content while the call runs. Parts always match the AI SDK's per-state
//   shapes (no output before output-available, approvals only where allowed).
//
// Pure: no I/O, the clock is injected.

export type ExternalToolKind =
  | "auth_link"
  | "compaction"
  | "delete"
  | "edit"
  | "execute"
  | "fetch"
  | "move"
  | "notice"
  | "other"
  /** A plan card (update_plan / create_plan): rendered by name, no metadata. */
  | "plan"
  | "read"
  | "search"
  | "subagent"
  | "switch_mode"
  | "think"
  | "user_input";

export const ACP_TOOL_KINDS = [
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
] as const satisfies readonly ExternalToolKind[];

export function toExternalToolKind(value: unknown): ExternalToolKind {
  return typeof value === "string" &&
    (ACP_TOOL_KINDS as readonly string[]).includes(value)
    ? (value as ExternalToolKind)
    : "other";
}

export type MirrorToolState =
  | "approval-requested"
  | "approval-responded"
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-denied"
  | "output-error";

/** ACP tool-call status → part state (absent: keep the current state). */
export type ExternalToolStatus =
  "completed" | "failed" | "in_progress" | "pending";

export type ExternalToolDiff = {
  newText: string;
  oldText: string | null;
  path: string;
};

export type ExternalToolTerminal = {
  exitStatus?: { exitCode: number | null; signal: string | null } | null;
  output?: string;
  terminalId: string;
  truncated?: boolean;
};

export type ExternalToolContent = {
  diffs?: ExternalToolDiff[];
  images?: Array<{ mediaType: string; url: string }>;
  terminals?: ExternalToolTerminal[];
  text?: string;
};

export type ExternalToolLocation = { line?: number; path: string };

export type ExternalPermissionOption = {
  kind: string | null;
  name: string;
  optionId: string;
};

export type ExternalToolApproval = {
  approved?: boolean;
  decision?: string;
  id: string;
  reason?: string;
  response?: string;
};

type BaseEntry = { order: number };

type TextEntry = BaseEntry & {
  messageId: string | null;
  text: string;
  type: "text";
};

type ReasoningEntry = BaseEntry & {
  endedAt: number | null;
  messageId: string | null;
  startedAt: number;
  text: string;
  type: "reasoning";
};

type FileEntry = BaseEntry & {
  filename?: string;
  mediaType: string;
  type: "file";
  url: string;
};

export type MirrorToolEntry = BaseEntry & {
  approval?: ExternalToolApproval;
  content: ExternalToolContent;
  errorText?: string;
  id: string;
  input: unknown;
  kind: ExternalToolKind;
  locations: ExternalToolLocation[];
  /** Agent-defined extras kept for the renderer (subagent ids, notice severity…). */
  meta?: Record<string, unknown>;
  /** Explicit output (plan cards, answers) instead of one built from content. */
  output?: unknown;
  permissionOptions?: ExternalPermissionOption[];
  rawName: string | null;
  rawOutput?: unknown;
  state: MirrorToolState;
  title: string | null;
  /** A fixed tool name (update_plan, create_plan); else prefix + kind. */
  toolName?: string;
  type: "tool";
};

type MirrorEntry = FileEntry | MirrorToolEntry | ReasoningEntry | TextEntry;

export type ToolPatch = {
  content?: ExternalToolContent;
  errorText?: string;
  id: string;
  input?: unknown;
  kind?: ExternalToolKind;
  locations?: ExternalToolLocation[];
  meta?: Record<string, unknown>;
  output?: unknown;
  rawName?: string | null;
  rawOutput?: unknown;
  /** ACP status; absent keeps the current state. */
  status?: ExternalToolStatus | null;
  title?: string | null;
  toolName?: string;
};

export type MirrorUsage = NonNullable<ThreadMessageMetadata["usage"]>;

export type ExternalAssistantMirror = ReturnType<typeof createAssistantMirror>;

const FINAL_STATES = new Set<MirrorToolState>([
  "output-available",
  "output-denied",
  "output-error",
]);

function stateFromStatus(
  status: ExternalToolStatus | null | undefined,
  current: MirrorToolState | null,
): MirrorToolState {
  switch (status) {
    case "pending":
      return current && current !== "input-streaming"
        ? current
        : "input-streaming";
    case "in_progress":
      return current === "approval-requested" ||
        current === "approval-responded"
        ? current
        : "input-available";
    case "completed":
      return "output-available";
    case "failed":
      return "output-error";
    default:
      return current ?? "input-available";
  }
}

function contentText(content: ExternalToolContent) {
  return content.text?.trim() || null;
}

function errorTextFrom(rawOutput: unknown) {
  if (typeof rawOutput === "string" && rawOutput.trim()) {
    return rawOutput.trim();
  }
  if (rawOutput && typeof rawOutput === "object") {
    const record = rawOutput as Record<string, unknown>;
    for (const key of ["error", "message", "stderr"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return null;
}

function hasContent(content: ExternalToolContent) {
  return Boolean(
    content.text ||
    content.diffs?.length ||
    content.terminals?.length ||
    content.images?.length,
  );
}

function buildToolOutput(entry: MirrorToolEntry) {
  if (entry.output !== undefined) {
    return entry.output;
  }
  return {
    ...(entry.content.text ? { text: entry.content.text } : {}),
    ...(entry.content.diffs?.length ? { diffs: entry.content.diffs } : {}),
    ...(entry.content.terminals?.length
      ? { terminals: entry.content.terminals }
      : {}),
    ...(entry.content.images?.length ? { images: entry.content.images } : {}),
    ...(entry.rawOutput !== undefined ? { rawOutput: entry.rawOutput } : {}),
  };
}

export type AssistantMirrorOptions = {
  agentLabel: string;
  now?: () => number;
  /** Tool-name prefix of the driver ("cursor_"). */
  toolPrefix: string;
};

export function createAssistantMirror(options: AssistantMirrorOptions) {
  const now = options.now ?? (() => Date.now());
  const entries: MirrorEntry[] = [];
  const tools = new Map<string, MirrorToolEntry>();
  let nextOrder = 0;
  let usage: MirrorUsage | null = null;

  const last = () => entries[entries.length - 1] ?? null;

  function closeReasoning(at = now()) {
    for (const entry of entries) {
      if (entry.type === "reasoning" && entry.endedAt === null) {
        entry.endedAt = Math.max(entry.startedAt, at);
      }
    }
  }

  function push<T extends MirrorEntry>(entry: Omit<T, "order">): T {
    const full = { ...entry, order: nextOrder++ } as T;
    if (full.type !== "reasoning") {
      closeReasoning();
    }
    entries.push(full);
    return full;
  }

  function toolName(entry: MirrorToolEntry) {
    return entry.toolName ?? `${options.toolPrefix}${entry.kind}`;
  }

  function toolPart(entry: MirrorToolEntry): ThreadUIMessage["parts"][number] {
    const final = FINAL_STATES.has(entry.state);
    const preview =
      !final && hasContent(entry.content)
        ? {
            ...(entry.content.text ? { text: entry.content.text } : {}),
            ...(entry.content.diffs?.length
              ? { diffs: entry.content.diffs }
              : {}),
            ...(entry.content.terminals?.length
              ? { terminals: entry.content.terminals }
              : {}),
          }
        : null;
    const sentinel = {
      agentLabel: options.agentLabel,
      kind: entry.kind,
      ...(entry.rawName ? { rawName: entry.rawName } : {}),
      ...(entry.title ? { title: entry.title } : {}),
      ...(entry.locations.length > 0 ? { locations: entry.locations } : {}),
      ...(entry.permissionOptions?.length
        ? { permissionOptions: entry.permissionOptions }
        : {}),
      ...(preview ? { preview } : {}),
      ...(entry.meta ? { meta: entry.meta } : {}),
    };
    const approval = entry.approval;
    const base = {
      // Plan cards render by name (update_plan / create_plan) like every
      // other engine's; the external family is chosen by this metadata.
      ...(entry.kind === "plan" ? {} : { callProviderMetadata: { sentinel } }),
      input: entry.input ?? {},
      ...(entry.title ? { title: entry.title } : {}),
      toolCallId: entry.id,
      toolName: toolName(entry),
      type: "dynamic-tool" as const,
    };

    switch (entry.state) {
      case "approval-requested":
        return {
          ...base,
          approval: { id: approval?.id ?? entry.id },
          state: "approval-requested",
        } as ThreadUIMessage["parts"][number];
      case "approval-responded":
        return {
          ...base,
          approval: {
            approved: approval?.approved ?? true,
            id: approval?.id ?? entry.id,
            ...(approval?.decision ? { decision: approval.decision } : {}),
            ...(approval?.reason ? { reason: approval.reason } : {}),
            ...(approval?.response ? { response: approval.response } : {}),
          },
          state: "approval-responded",
        } as ThreadUIMessage["parts"][number];
      case "output-denied":
        return {
          ...base,
          approval: {
            approved: false,
            id: approval?.id ?? entry.id,
            ...(approval?.decision ? { decision: approval.decision } : {}),
            ...(approval?.reason ? { reason: approval.reason } : {}),
          },
          state: "output-denied",
        } as ThreadUIMessage["parts"][number];
      case "output-available":
        return {
          ...base,
          output: buildToolOutput(entry),
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

  const mirror = {
    /** Appends assistant text (a new segment unless the open one continues). */
    appendText(text: string, messageId: string | null = null) {
      if (!text) {
        return;
      }
      const tail = last();
      if (tail?.type === "text" && tail.messageId === messageId) {
        tail.text += text;
        return;
      }
      push<TextEntry>({ messageId, text, type: "text" });
    },

    /** Appends a thought (agent_thought_chunk) as reasoning. */
    appendReasoning(text: string, messageId: string | null = null) {
      if (!text) {
        return;
      }
      const tail = last();
      if (
        tail?.type === "reasoning" &&
        tail.endedAt === null &&
        tail.messageId === messageId
      ) {
        tail.text += text;
        return;
      }
      closeReasoning();
      push<ReasoningEntry>({
        endedAt: null,
        messageId,
        startedAt: now(),
        text,
        type: "reasoning",
      });
    },

    appendFile(file: { filename?: string; mediaType: string; url: string }) {
      push<FileEntry>({ ...file, type: "file" });
    },

    getTool(id: string) {
      return tools.get(id) ?? null;
    },

    /**
     * Creates or merges a tool call. Present fields overwrite, absent ones
     * are kept; `content` replaces wholesale; an absent status keeps the
     * state; a denied call stays denied.
     */
    upsertTool(patch: ToolPatch) {
      const existing = tools.get(patch.id);
      if (!existing) {
        const state = stateFromStatus(patch.status, null);
        const entry = push<MirrorToolEntry>({
          content: patch.content ?? {},
          id: patch.id,
          input: patch.input,
          kind: patch.kind ?? "other",
          locations: patch.locations ?? [],
          ...(patch.meta ? { meta: patch.meta } : {}),
          ...(patch.output !== undefined ? { output: patch.output } : {}),
          rawName: patch.rawName ?? null,
          ...(patch.rawOutput !== undefined
            ? { rawOutput: patch.rawOutput }
            : {}),
          state,
          title: patch.title ?? null,
          ...(patch.toolName ? { toolName: patch.toolName } : {}),
          type: "tool",
        });
        if (state === "output-error") {
          entry.errorText =
            patch.errorText ??
            contentText(entry.content) ??
            errorTextFrom(patch.rawOutput) ??
            "Tool failed";
        }
        tools.set(patch.id, entry);
        return entry;
      }

      if (patch.kind) existing.kind = patch.kind;
      if (patch.title !== undefined && patch.title !== null) {
        existing.title = patch.title;
      }
      if (patch.rawName) existing.rawName = patch.rawName;
      if (patch.input !== undefined) existing.input = patch.input;
      if (patch.content) existing.content = patch.content;
      if (patch.locations) existing.locations = patch.locations;
      if (patch.rawOutput !== undefined) existing.rawOutput = patch.rawOutput;
      if (patch.output !== undefined) existing.output = patch.output;
      if (patch.meta) existing.meta = { ...existing.meta, ...patch.meta };
      if (patch.toolName) existing.toolName = patch.toolName;

      if (existing.state !== "output-denied") {
        const next = stateFromStatus(patch.status, existing.state);
        if (
          next === "output-error" &&
          (existing.state !== "output-error" || patch.errorText)
        ) {
          existing.errorText =
            patch.errorText ??
            contentText(existing.content) ??
            errorTextFrom(existing.rawOutput) ??
            "Tool failed";
        }
        existing.state = next;
      }
      return existing;
    },

    /** Puts a tool in approval-requested with the agent's options. */
    requestApproval(input: {
      approvalId: string;
      options?: ExternalPermissionOption[];
      patch: ToolPatch;
    }) {
      const entry = mirror.upsertTool(input.patch);
      entry.approval = { id: input.approvalId };
      entry.state = "approval-requested";
      if (input.options) {
        entry.permissionOptions = input.options;
      }
      return entry;
    },

    /** Records the user's answer to an approval request. */
    respondToApproval(
      id: string,
      approval: Omit<ExternalToolApproval, "id"> & { approved: boolean },
    ) {
      const entry = tools.get(id);
      if (!entry) {
        return null;
      }
      entry.approval = {
        ...entry.approval,
        id: entry.approval?.id ?? id,
        ...approval,
      };
      entry.state = approval.approved ? "approval-responded" : "output-denied";
      return entry;
    },

    /** Settles a tool by hand (answers, plan cards, denials). */
    setToolState(
      id: string,
      state: MirrorToolState,
      extra: { errorText?: string; output?: unknown } = {},
    ) {
      const entry = tools.get(id);
      if (!entry) {
        return null;
      }
      entry.state = state;
      if (extra.output !== undefined) entry.output = extra.output;
      if (extra.errorText !== undefined) entry.errorText = extra.errorText;
      return entry;
    },

    removeTool(id: string) {
      const entry = tools.get(id);
      if (!entry) {
        return false;
      }
      tools.delete(id);
      entries.splice(entries.indexOf(entry), 1);
      return true;
    },

    setUsage(next: MirrorUsage) {
      usage = { ...usage, ...next };
    },

    getUsage() {
      return usage;
    },

    /** Ends the open reasoning segment (a turn ended or text started). */
    closeOpenSegments() {
      closeReasoning();
    },

    /**
     * Turn end: calls that never reported completion become errors (with
     * `reason`) instead of spinning forever.
     */
    finishDanglingTools(reason: string) {
      for (const entry of tools.values()) {
        if (!FINAL_STATES.has(entry.state)) {
          entry.state = "output-error";
          entry.errorText = reason;
        }
      }
    },

    hasPendingApprovals() {
      return [...tools.values()].some(
        (entry) => entry.state === "approval-requested",
      );
    },

    isEmpty() {
      return entries.length === 0;
    },

    /** Reasoning timing for the message metadata. */
    reasoningMetadata(): ThreadMessageMetadata["reasoning"] | undefined {
      const segments = entries.filter(
        (entry): entry is ReasoningEntry => entry.type === "reasoning",
      );
      if (segments.length === 0) {
        return undefined;
      }
      const open = segments.find((segment) => segment.endedAt === null);
      const durations = segments
        .filter((segment) => segment.endedAt !== null)
        .map((segment) => (segment.endedAt ?? 0) - segment.startedAt);
      return {
        activeSinceMs: open ? open.startedAt : null,
        durationMs: durations.reduce((sum, value) => sum + value, 0),
        isActive: Boolean(open),
        segmentDurationsMs: durations,
      };
    },

    /** The message parts, in arrival order. */
    toParts(options: { streaming?: boolean } = {}): ThreadUIMessage["parts"] {
      const tail = last();
      const parts = entries.flatMap((entry): ThreadUIMessage["parts"] => {
        switch (entry.type) {
          case "text":
            return entry.text.length > 0
              ? [
                  {
                    state:
                      options.streaming && entry === tail
                        ? "streaming"
                        : "done",
                    text: entry.text,
                    type: "text",
                  },
                ]
              : [];
          case "reasoning":
            return entry.text.length > 0
              ? [
                  {
                    state:
                      options.streaming && entry.endedAt === null
                        ? "streaming"
                        : "done",
                    text: entry.text,
                    type: "reasoning",
                  },
                ]
              : [];
          case "file":
            return [
              {
                ...(entry.filename ? { filename: entry.filename } : {}),
                mediaType: entry.mediaType,
                type: "file",
                url: entry.url,
              },
            ];
          case "tool":
            return [toolPart(entry)];
        }
      });
      return parts.length > 0 ? parts : [{ text: " ", type: "text" }];
    },
  };

  return mirror;
}
