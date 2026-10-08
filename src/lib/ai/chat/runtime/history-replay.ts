import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import type { ThreadChatRequest } from "../types";
import { buildPlanModePromptPreamble } from "./plan-mode-instructions";

// Replaying a thread's history into a fresh native session. Engines that
// resume a native session (Claude, Codex, Copilot) only have the
// conversation the session itself remembers. When there is no session to
// resume (the instance's continuation key changed, for example its home
// directory moved, or the stored state is gone) a new session starts, and
// the Sentinel transcript is the only record of what was said: it goes into
// the first prompt of the new session (driver-contract §3: "null on
// mismatch ⇒ fresh session + replay").

/** Rendered transcript size Claude and Codex replay into a fresh session. */
export const HISTORY_REPLAY_MAX_CHARS = 200_000;

/**
 * One transcript message as plain text: text parts as written, and
 * placeholders for attachments, reasoning and tool calls. Null when the
 * message has nothing to show.
 */
export function formatReplayTranscriptMessage(message: ThreadUIMessage) {
  const text = message.parts
    .map((part) => {
      if (part.type === "text") {
        return part.text.trim();
      }

      if (part.type === "file") {
        return `[Attachment: ${part.filename ?? part.mediaType}]`;
      }

      if (part.type === "reasoning") {
        return `[Reasoning omitted]`;
      }

      if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
        return `[Tool: ${"toolName" in part ? part.toolName : part.type.slice(5)}]`;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!text) {
    return null;
  }

  return `${message.role.toUpperCase()}: ${text}`;
}

/**
 * The whole first prompt of a fresh session, the transcript up to and
 * including the message being sent (Copilot's bootstrap prompt).
 */
export function buildTranscriptBootstrapPrompt(
  transcript: ThreadUIMessage[],
  threadMode: "chat" | "plan",
  options: { engineLabel: string },
) {
  const renderedTranscript = transcript
    .map(formatReplayTranscriptMessage)
    .filter((entry): entry is string => Boolean(entry))
    .join("\n\n");

  const planModePreamble =
    threadMode === "plan"
      ? buildPlanModePromptPreamble(
          `Plan Mode is active for this fresh ${options.engineLabel} session. Follow the full contract below for the first response and continue honoring it until the mode changes.`,
        )
      : null;

  if (!renderedTranscript) {
    return planModePreamble;
  }

  return [
    "Continue this Sentinel conversation faithfully.",
    ...(planModePreamble
      ? [planModePreamble]
      : [`Current mode: ${threadMode}.`]),
    "The prior transcript follows. Use it as conversation context, then continue naturally from the final user message.",
    "",
    renderedTranscript,
  ].join("\n");
}

/**
 * What came before the message being sent, from the thread's stored
 * transcript: everything before the edited message for an edit, else the
 * transcript without a trailing copy of the new message.
 */
export function getReplayHistory(
  transcript: ThreadUIMessage[],
  request: Pick<ThreadChatRequest, "message" | "messageId" | "trigger">,
) {
  if (request.trigger === "edit-user-message" && request.messageId) {
    const index = transcript.findIndex(
      (message) => message.id === request.messageId,
    );
    return index === -1 ? transcript : transcript.slice(0, index);
  }

  const last = transcript.at(-1);
  return last && request.message && last.id === request.message.id
    ? transcript.slice(0, -1)
    : transcript;
}

/**
 * The prior conversation as a prefix for the first prompt of a fresh native
 * session, newest messages kept when it exceeds `maxChars`. Null when there
 * is nothing to replay (a new thread).
 */
export function buildHistoryReplayPrefix(
  history: ThreadUIMessage[],
  options: { maxChars?: number } = {},
) {
  const maxChars = options.maxChars ?? HISTORY_REPLAY_MAX_CHARS;
  const entries = history
    .map(formatReplayTranscriptMessage)
    .filter((entry): entry is string => Boolean(entry));
  if (entries.length === 0) {
    return null;
  }

  const kept: string[] = [];
  let used = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    const separator = kept.length > 0 ? 2 : 0;
    if (used + separator + entry.length <= maxChars) {
      kept.unshift(entry);
      used += separator + entry.length;
      continue;
    }
    if (kept.length === 0) {
      // A single message larger than the budget: keep its end.
      kept.unshift(`…${entry.slice(entry.length - Math.max(0, maxChars - 1))}`);
    }
    break;
  }

  const omitted = entries.length - kept.length;
  return [
    "This conversation started in an earlier session that cannot be resumed. Its transcript follows: use it as context, then answer the new message after it.",
    "",
    "<conversation_history>",
    ...(omitted > 0
      ? [`[${omitted} earlier message${omitted === 1 ? "" : "s"} omitted]`, ""]
      : []),
    kept.join("\n\n"),
    "</conversation_history>",
    "",
    "New message:",
  ].join("\n");
}

/** Prompt prefixes in order, blank ones dropped; null when none is left. */
export function joinPromptPrefixes(...prefixes: Array<string | null>) {
  const kept = prefixes.filter((prefix): prefix is string =>
    Boolean(prefix?.trim()),
  );
  return kept.length > 0 ? kept.join("\n\n") : null;
}
