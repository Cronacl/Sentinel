import { describe, expect, it } from "bun:test";

import {
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

  it("rotates generic pending labels while waiting for visible output", () => {
    expect(
      getPendingAssistantStatusLabel({
        messageStatus: "pending",
        rotationIndex: 0,
      }),
    ).toBe("Working...");
    expect(
      getPendingAssistantStatusLabel({
        messageStatus: "pending",
        rotationIndex: 1,
      }),
    ).toBe("Planning next steps...");
    expect(
      getPendingAssistantStatusLabel({
        messageStatus: "pending",
        rotationIndex: 2,
      }),
    ).toBe("Preparing response...");
  });
});
