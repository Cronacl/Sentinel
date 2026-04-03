import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ChatMessage,
  getAssistantFailureText,
  getPendingAssistantStatusLabel,
  isVisibleAssistantPart,
} from "./chat-message";

describe("chat-message helpers", () => {
  it("treats whitespace-only text parts as not visible", () => {
    expect(
      isVisibleAssistantPart({
        text: "   ",
        type: "text",
      }),
    ).toBe(false);
  });

  it("treats non-empty text parts as visible", () => {
    expect(
      isVisibleAssistantPart({
        text: "hello",
        type: "text",
      }),
    ).toBe(true);
  });

  it("treats reasoning parts as visible", () => {
    expect(
      isVisibleAssistantPart({
        text: "**Inspect renderer**",
        type: "reasoning",
      }),
    ).toBe(true);
  });

  it("treats tool parts as visible", () => {
    expect(
      isVisibleAssistantPart({
        input: {},
        state: "input-streaming",
        toolCallId: "tool-1",
        toolName: "web_search",
        type: "dynamic-tool",
      }),
    ).toBe(true);
  });

  it("prefers the latest reasoning title over generic pending labels", () => {
    expect(
      getPendingAssistantStatusLabel({
        messageStatus: "streaming",
        reasoningText: "**Inspect renderer**\nLooking at the placeholder path",
      }),
    ).toBe("Inspect renderer");
  });

  it("prefers an explicit status label over generic pending labels", () => {
    expect(
      getPendingAssistantStatusLabel({
        messageStatus: "pending",
        statusLabel: "Compacting context...",
      }),
    ).toBe("Compacting context...");
  });

  it("shows planning copy when reasoning metadata is active", () => {
    expect(
      getPendingAssistantStatusLabel({
        messageStatus: "streaming",
        reasoningMetadata: {
          activeSinceMs: Date.now(),
          isActive: true,
        },
      }),
    ).toBe("Planning next steps...");
  });

  it("uses a single generic pending label while waiting for visible output", () => {
    expect(
      getPendingAssistantStatusLabel({
        messageStatus: "pending",
      }),
    ).toBe("Working...");
    expect(
      getPendingAssistantStatusLabel({
        messageStatus: "pending",
      }),
    ).toBe("Working...");
  });

  it("prefers explicit assistant failure text", () => {
    expect(
      getAssistantFailureText({
        errorMessage: "Provider request failed.",
        messageStatus: "error",
      }),
    ).toBe("Provider request failed.");
  });

  it("falls back to a cancellation label when no error text is present", () => {
    expect(
      getAssistantFailureText({
        messageStatus: "cancelled",
      }),
    ).toBe("Generation stopped.");
  });
});

describe("ChatMessage", () => {
  it("renders inline assistant failures even when the message has no visible parts", () => {
    const markup = renderToStaticMarkup(
      createElement(ChatMessage, {
        chatEngine: "sentinel",
        message: {
          id: "assistant-error",
          metadata: {
            errorMessage: "Provider request failed.",
            status: "error",
          },
          parts: [{ text: " ", type: "text" }],
          role: "assistant",
        },
        onRetry: () => {},
      }),
    );

    expect(markup).toContain("Provider request failed.");
    expect(markup).toContain("Retry");
  });

  it("keeps the pending state visible while the assistant is still streaming", () => {
    const markup = renderToStaticMarkup(
      createElement(ChatMessage, {
        chatEngine: "sentinel",
        isStreaming: true,
        message: {
          id: "assistant-streaming-error",
          metadata: {
            errorMessage: "Provider request failed.",
            status: "error",
          },
          parts: [{ text: " ", type: "text" }],
          role: "assistant",
        },
        onRetry: () => {},
      }),
    );

    expect(markup).not.toContain("Provider request failed.");
    expect(markup).not.toContain("Retry");
    expect(markup).toContain('aria-busy="true"');
  });
});
