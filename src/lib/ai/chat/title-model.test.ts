// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";

const getLanguageModel = mock(async () => ({ kind: "title-model" }));

mock.module("../providers/resolver", () => ({
  getLanguageModel,
}));

const { getThreadTitleModelId } = await import("./title/model");
mock.restore();

afterEach(() => {
  mock.clearAllMocks();
});

describe("getThreadTitleModelId", () => {
  it("maps every provider to its dedicated fast title model", () => {
    expect(getThreadTitleModelId("openai")).toBe("gpt-4.1-nano");
    expect(getThreadTitleModelId("anthropic")).toBe("claude-haiku-4-5");
    expect(getThreadTitleModelId("google")).toBe("gemini-2.5-flash-lite");
    expect(getThreadTitleModelId("google_vertex")).toBe(
      "gemini-2.5-flash-lite",
    );
  });
});
