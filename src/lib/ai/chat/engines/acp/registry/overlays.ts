import type * as acp from "@agentclientprotocol/sdk";

import type {
  AcpAgentDescriptor,
  AcpExtNotificationHandler,
} from "../descriptor";
import {
  asRecord,
  readNonEmptyString,
  readString,
  type JsonRecord,
} from "../schema";

// Per-agent exceptions for registry agents, keyed by registry id (design
// acp-and-agents §3.4; t3code packages/provider-acp-registry adapter.ts and
// devinAcp.ts, MIT). Everything else about a registry agent is generic.
// Keep this list short: an agent that needs more gets a driver of its own.

export type AcpRegistryOverlay = Partial<
  Pick<
    AcpAgentDescriptor,
    | "clientCapabilitiesMeta"
    | "clientFs"
    | "clientTerminals"
    | "extNotifications"
    | "normalizeInbound"
    | "routeUnknownSessionsToRoot"
  >
>;

// ─── Devin ──────────────────────────────────────────────────────────────
// Devin streams subagents on the root connection with Cognition `_meta`:
// - `cognition.ai/subagent_context.parentAgentId`: an update from a
//   subagent, routed to its parent session ("root" stays as sent; the
//   descriptor accepts other session ids as the root's). Its text becomes
//   a subagent message rather than the assistant's own; its thoughts are
//   dropped;
// - `cognition.ai/streamingMessageId` → `messageId` on message and thought
//   chunks;
// - `cognition.ai/inferenceToolName` → the tool title when it is empty or
//   "Tool";
// - `cognition.ai/subagent_started` / `subagent_completed` on a tool call →
//   a subagent card (`subagent_update`), as are later updates of that call.
// Devin has no ACP ask mode and runs commands through client terminals,
// which the shared runtime gates with the execute approval policy.

const DEVIN_META = {
  context: "cognition.ai/subagent_context",
  inferenceToolName: "cognition.ai/inferenceToolName",
  streamingMessageId: "cognition.ai/streamingMessageId",
  subagentCompleted: "cognition.ai/subagent_completed",
  subagentStarted: "cognition.ai/subagent_started",
} as const;

type DevinSubagent = { agentId: string; task: string | null; title: string };

const MAX_TRACKED_SUBAGENT_CALLS = 500;

function subagentUpdate(
  subagent: DevinSubagent,
  state: "completed" | "failed" | "running",
  summary: string | null,
) {
  return {
    description: summary ?? subagent.task,
    sessionId: subagent.agentId,
    sessionUpdate: "subagent_update",
    state: { state },
    title: subagent.title,
  };
}

/** A Devin normalizer with its own record of subagent tool calls. */
export function createDevinNormalizer() {
  const subagentCalls = new Map<string, DevinSubagent>();

  function track(toolCallId: string, subagent: DevinSubagent) {
    subagentCalls.delete(toolCallId);
    subagentCalls.set(toolCallId, subagent);
    if (subagentCalls.size > MAX_TRACKED_SUBAGENT_CALLS) {
      subagentCalls.delete(subagentCalls.keys().next().value!);
    }
  }

  function normalizeUpdate(
    update: JsonRecord,
    sessionId: string | null,
  ): { sessionId: string | null; update: JsonRecord } | null {
    const meta = asRecord(update._meta);
    const kind = update.sessionUpdate;
    const context = asRecord(meta?.[DEVIN_META.context]);
    const parent = readNonEmptyString(context, "parentAgentId");
    const routed = parent && parent !== "root" ? parent : sessionId;
    const streamingId = readNonEmptyString(meta, DEVIN_META.streamingMessageId);

    if (kind === "agent_message_chunk" || kind === "agent_thought_chunk") {
      if (context) {
        if (kind === "agent_thought_chunk") {
          return null;
        }
        return {
          sessionId: routed,
          update: {
            content: update.content,
            messageId:
              streamingId ?? `devin-subagent:${sessionId ?? "unknown"}`,
            senderSessionId: sessionId,
            sessionUpdate: "session_message_chunk",
          },
        };
      }
      return {
        sessionId: routed,
        update: streamingId ? { ...update, messageId: streamingId } : update,
      };
    }

    if (kind === "tool_call" || kind === "tool_call_update") {
      const toolCallId = readNonEmptyString(update, "toolCallId");
      const started = asRecord(meta?.[DEVIN_META.subagentStarted]);
      const completed = asRecord(meta?.[DEVIN_META.subagentCompleted]);
      const agentId =
        readNonEmptyString(completed, "agentId") ??
        readNonEmptyString(started, "agentId");
      const known = toolCallId ? subagentCalls.get(toolCallId) : undefined;
      if (agentId || known) {
        const subagent: DevinSubagent = {
          agentId: agentId ?? known!.agentId,
          task: readString(started, "task") ?? known?.task ?? null,
          title:
            readNonEmptyString(started, "title") ?? known?.title ?? "Subagent",
        };
        if (toolCallId) {
          track(toolCallId, subagent);
        }
        const status = readString(update, "status");
        const state = completed
          ? completed.success === false
            ? "failed"
            : "completed"
          : status === "completed"
            ? "completed"
            : status === "failed"
              ? "failed"
              : "running";
        return {
          sessionId: routed,
          update: subagentUpdate(
            subagent,
            state,
            readString(completed, "summary"),
          ),
        };
      }
      const name = readNonEmptyString(meta, DEVIN_META.inferenceToolName);
      const title = typeof update.title === "string" ? update.title.trim() : "";
      if (name && (!title || title === "Tool")) {
        return { sessionId: routed, update: { ...update, title: name } };
      }
    }
    return { sessionId: routed, update };
  }

  return (message: acp.AnyMessage): acp.AnyMessage | null => {
    const record = asRecord(message);
    if (!record || record.method !== "session/update" || "id" in record) {
      return message;
    }
    const params = asRecord(record.params);
    const update = asRecord(params?.update);
    if (!params || !update) {
      return message;
    }
    const sessionId = readString(params, "sessionId");
    const next = normalizeUpdate(update, sessionId);
    if (!next) {
      return null;
    }
    if (next.update === update && next.sessionId === sessionId) {
      return message;
    }
    return {
      ...record,
      params: { ...params, sessionId: next.sessionId, update: next.update },
    } as acp.AnyMessage;
  };
}

// ─── Mistral Vibe ───────────────────────────────────────────────────────
// `_session/retrying {sessionId, category, detail}` reports the SDK's
// backoff; a rate limit is a usage-limit notice, the rest a retry notice.

const MISTRAL_RETRY_TITLES: Record<string, string> = {
  connection: "Connection lost, retrying",
  rate_limited: "Usage limit reached, retrying",
  server_error: "Server error, retrying",
  timed_out: "Request timed out, retrying",
};

export const mistralRetryingNotification: AcpExtNotificationHandler = (
  params,
  context,
) => {
  const category = readString(params, "category") ?? "unknown";
  const detail = readString(params, "detail");
  const title = MISTRAL_RETRY_TITLES[category] ?? "Retrying";
  const severity = category === "rate_limited" ? "warning" : "info";
  context.mirror.upsertTool({
    id: `notice:retrying:${category}:${detail ?? ""}`,
    input: {},
    kind: "notice",
    meta: { category, severity },
    output: { description: detail, severity, title },
    status: "completed",
    title,
  });
  context.update();
};

/** The overlay of a registry agent (empty for most). */
export function getAcpRegistryOverlay(
  agentId: string | null,
): AcpRegistryOverlay {
  switch (agentId) {
    case "devin":
      return {
        clientCapabilitiesMeta: {
          "cognition.ai/messageGrouping": true,
          "cognition.ai/subagentSupport": true,
        },
        clientTerminals: true,
        normalizeInbound: createDevinNormalizer(),
        routeUnknownSessionsToRoot: true,
      };
    case "mistral-vibe":
      return {
        extNotifications: { "_session/retrying": mistralRetryingNotification },
      };
    case "gemini":
      // Gemini CLI reads files itself; serving fs is opt-in per instance.
      return { clientFs: false };
    default:
      return {};
  }
}
