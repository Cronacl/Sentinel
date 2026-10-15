import { describe, expect, it } from "bun:test";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import {
  buildHistoryReplayPrefix,
  buildTranscriptBootstrapPrompt,
  formatReplayTranscriptMessage,
  getReplayHistory,
  joinPromptPrefixes,
} from "./history-replay";
import { buildPlanModePromptPreamble } from "./plan-mode-instructions";

function message(
  id: string,
  role: "assistant" | "user",
  parts: unknown[],
): ThreadUIMessage {
  return { id, metadata: {}, parts, role } as ThreadUIMessage;
}

function text(id: string, role: "assistant" | "user", value: string) {
  return message(id, role, [{ text: value, type: "text" }]);
}

const transcript = [
  text("user-1", "user", "Add a cache"),
  message("assistant-1", "assistant", [
    { text: "thinking", type: "reasoning" },
    {
      input: {},
      state: "output-available",
      toolCallId: "call-1",
      toolName: "claude_bash",
      type: "dynamic-tool",
    },
    { text: "  Done: the cache is in place.  ", type: "text" },
  ]),
  message("user-2", "user", [
    { filename: "spec.pdf", mediaType: "application/pdf", type: "file" },
    { text: "Now document it", type: "text" },
  ]),
];

describe("formatReplayTranscriptMessage", () => {
  it("renders text and placeholders for reasoning, tools and attachments", () => {
    expect(formatReplayTranscriptMessage(transcript[1]!)).toBe(
      "ASSISTANT: [Reasoning omitted]\n\n[Tool: claude_bash]\n\nDone: the cache is in place.",
    );
    expect(formatReplayTranscriptMessage(transcript[2]!)).toBe(
      "USER: [Attachment: spec.pdf]\n\nNow document it",
    );
  });

  it("skips a message with nothing to show", () => {
    expect(
      formatReplayTranscriptMessage(
        message("empty", "assistant", [{ text: "  ", type: "text" }]),
      ),
    ).toBeNull();
  });
});

describe("buildTranscriptBootstrapPrompt", () => {
  // Copilot's prompt before it moved here: the text must not change.
  it("keeps Copilot's chat-mode bootstrap prompt", () => {
    expect(
      buildTranscriptBootstrapPrompt(transcript.slice(0, 1), "chat", {
        engineLabel: "Copilot",
      }),
    ).toBe(
      [
        "Continue this Sentinel conversation faithfully.",
        "Current mode: chat.",
        "The prior transcript follows. Use it as conversation context, then continue naturally from the final user message.",
        "",
        "USER: Add a cache",
      ].join("\n"),
    );
  });

  it("names the engine in the plan-mode preamble", () => {
    const preamble = buildPlanModePromptPreamble(
      "Plan Mode is active for this fresh Copilot session. Follow the full contract below for the first response and continue honoring it until the mode changes.",
    );

    expect(
      buildTranscriptBootstrapPrompt([], "plan", { engineLabel: "Copilot" }),
    ).toBe(preamble);
    expect(
      buildTranscriptBootstrapPrompt(transcript.slice(0, 1), "plan", {
        engineLabel: "Copilot",
      }),
    ).toBe(
      [
        "Continue this Sentinel conversation faithfully.",
        preamble,
        "The prior transcript follows. Use it as conversation context, then continue naturally from the final user message.",
        "",
        "USER: Add a cache",
      ].join("\n"),
    );
  });

  it("is null for an empty transcript in chat mode", () => {
    expect(
      buildTranscriptBootstrapPrompt([], "chat", { engineLabel: "Copilot" }),
    ).toBeNull();
  });
});

describe("getReplayHistory", () => {
  it("drops a trailing copy of the message being sent", () => {
    const sent = text("user-3", "user", "Ship it");

    expect(
      getReplayHistory([...transcript, sent], {
        message: sent,
        trigger: "submit-user-message",
      }),
    ).toEqual(transcript);
    expect(
      getReplayHistory(transcript, {
        message: sent,
        trigger: "submit-user-message",
      }),
    ).toEqual(transcript);
  });

  it("keeps what came before the edited message", () => {
    expect(
      getReplayHistory(transcript, {
        message: text("user-2-edit", "user", "Document it briefly"),
        messageId: "user-2",
        trigger: "edit-user-message",
      }),
    ).toEqual(transcript.slice(0, 2));
  });
});

describe("buildHistoryReplayPrefix", () => {
  it("is null when there is no prior conversation", () => {
    expect(buildHistoryReplayPrefix([])).toBeNull();
    expect(
      buildHistoryReplayPrefix([
        message("empty", "assistant", [{ text: "", type: "text" }]),
      ]),
    ).toBeNull();
  });

  it("wraps the prior transcript and introduces the new message", () => {
    const prefix = buildHistoryReplayPrefix(transcript.slice(0, 2));

    expect(prefix).toBe(
      [
        "This conversation started in an earlier session that cannot be resumed. Its transcript follows: use it as context, then answer the new message after it.",
        "",
        "<conversation_history>",
        "USER: Add a cache\n\nASSISTANT: [Reasoning omitted]\n\n[Tool: claude_bash]\n\nDone: the cache is in place.",
        "</conversation_history>",
        "",
        "New message:",
      ].join("\n"),
    );
  });

  it("keeps the newest messages within the budget and says how many were left out", () => {
    const history = Array.from({ length: 5 }, (_, index) =>
      text(`m-${index}`, index % 2 ? "assistant" : "user", `message ${index}`),
    );
    // "USER: message 4" is 15 characters; two entries and a separator fit.
    const prefix = buildHistoryReplayPrefix(history, { maxChars: 37 })!;

    expect(prefix).toContain("[3 earlier messages omitted]");
    expect(prefix).toContain("ASSISTANT: message 3\n\nUSER: message 4");
    expect(prefix).not.toContain("message 2");
  });

  it("keeps the end of a single message larger than the budget", () => {
    const prefix = buildHistoryReplayPrefix(
      [text("long", "user", "a".repeat(50) + "tail")],
      { maxChars: 10 },
    )!;

    expect(prefix).toContain("<conversation_history>\n…aaaaatail\n");
    expect(prefix).not.toContain("omitted");
  });
});

describe("joinPromptPrefixes", () => {
  it("joins the non-blank prefixes in order", () => {
    expect(joinPromptPrefixes("history", null, " ", "plan")).toBe(
      "history\n\nplan",
    );
    expect(joinPromptPrefixes(null, "")).toBeNull();
  });
});
