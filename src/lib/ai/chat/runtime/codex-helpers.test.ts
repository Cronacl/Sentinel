import { describe, expect, it } from "bun:test";

import {
  buildCodexBootstrapTitle,
  getCodexAssistantParentMessageId,
} from "./codex-helpers";

describe("getCodexAssistantParentMessageId", () => {
  it("anchors assistant replies to the submitted user message", () => {
    expect(
      getCodexAssistantParentMessageId({
        submittedUserMessageId: "user-2",
        userParentMessageId: "assistant-1",
      }),
    ).toBe("user-2");
  });

  it("falls back to the previous transcript message when needed", () => {
    expect(
      getCodexAssistantParentMessageId({
        submittedUserMessageId: null,
        userParentMessageId: "assistant-1",
      }),
    ).toBe("assistant-1");
  });
});

describe("buildCodexBootstrapTitle", () => {
  it("creates a compact title from the first user message", () => {
    expect(
      buildCodexBootstrapTitle(
        "can you fix codex title generation and message branching in chat runtime?",
      ),
    ).toBe("Fix Codex Title Generation and Message");
  });

  it("keeps greetings readable instead of leaving raw input", () => {
    expect(buildCodexBootstrapTitle("hey")).toBe("Hey");
  });

  it("falls back cleanly when the first message is empty", () => {
    expect(buildCodexBootstrapTitle(" \n\t ")).toBe("New thread");
  });
});
