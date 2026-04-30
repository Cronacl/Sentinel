import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ChatMessage,
  getAssistantFailureSummary,
  getAssistantFailureText,
  getPendingAssistantStatusLabel,
  isVisibleAssistantPart,
  shouldShowAssistantFailureDetails,
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

  it("does not surface cancellation as a failure", () => {
    expect(
      getAssistantFailureText({
        messageStatus: "cancelled",
      }),
    ).toBeNull();
  });

  it("summarizes long provider errors to the first compact line", () => {
    const errorText = [
      "Provider request failed with status 500 after retrying the request several times and receiving a very long diagnostic payload that should not fill the entire chat viewport because the upstream provider included a verbose transport dump.",
      "stack: at provider.call",
    ].join("\n");

    expect(getAssistantFailureSummary(errorText).endsWith("...")).toBe(true);
    expect(getAssistantFailureSummary(errorText)).not.toContain("stack:");
    expect(shouldShowAssistantFailureDetails(errorText)).toBe(true);
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

  it("keeps rendered tool failure text behind a disclosure", () => {
    const errorText =
      'Reference image attachment "placeholder.png" was not found.';
    const markup = renderToStaticMarkup(
      createElement(ChatMessage, {
        chatEngine: "sentinel",
        message: {
          id: "assistant-tool-error",
          metadata: {
            errorMessage: errorText,
            status: "error",
          },
          parts: [
            {
              errorText,
              input: {
                mode: "single",
                prompt: "Generate 5-second video of Socrates in Athens",
              },
              state: "output-error",
              toolCallId: "tool-call-1",
              toolName: "generate_video",
              type: "dynamic-tool",
            } as any,
          ],
          role: "assistant",
        },
        onRetry: () => {},
      }),
    );

    expect(markup).toContain("Video generation failed");
    expect(markup).not.toContain("Error details");
    expect(markup).not.toContain("placeholder.png");
    expect(markup).toContain("Retry");
    expect(markup).not.toContain("Run failed");
  });

  it("uses a lighter inline failure treatment when other content is present", () => {
    const markup = renderToStaticMarkup(
      createElement(ChatMessage, {
        chatEngine: "sentinel",
        message: {
          id: "assistant-partial-error",
          metadata: {
            errorMessage: "Provider request failed.",
            status: "error",
          },
          parts: [{ text: "Partial answer", type: "text" }],
          role: "assistant",
        },
        onRetry: () => {},
      }),
    );

    expect(markup).toContain("Partial answer");
    expect(markup).toContain("Run failed");
    expect(markup).toContain("Provider request failed.");
    expect(markup).toContain("bg-danger/5");
  });

  it("keeps long assistant failures collapsed by default with details available", () => {
    const errorText = [
      "Provider request failed with status 500 after retrying the request several times and receiving a very long diagnostic payload that should not fill the entire chat viewport.",
      "stack: at provider.call",
      "raw payload: secret-free-but-extremely-noisy diagnostics",
    ].join("\n");

    const markup = renderToStaticMarkup(
      createElement(ChatMessage, {
        chatEngine: "sentinel",
        message: {
          id: "assistant-long-error",
          metadata: {
            errorMessage: errorText,
            status: "error",
          },
          parts: [{ text: " ", type: "text" }],
          role: "assistant",
        },
        onRetry: () => {},
      }),
    );

    expect(markup).toContain("Run failed");
    expect(markup).toContain("Details");
    expect(markup).toContain("Copy error");
    expect(markup).not.toContain("raw payload:");
  });

  it("does not render a failure banner or retry action for cancelled runs", () => {
    const markup = renderToStaticMarkup(
      createElement(ChatMessage, {
        chatEngine: "sentinel",
        message: {
          id: "assistant-cancelled",
          metadata: {
            errorMessage: "Generation stopped.",
            status: "cancelled",
          },
          parts: [{ text: " ", type: "text" }],
          role: "assistant",
        },
        onRetry: () => {},
      }),
    );

    expect(markup).not.toContain("Run failed");
    expect(markup).not.toContain("Generation stopped.");
    expect(markup).not.toContain("Retry");
  });
});
