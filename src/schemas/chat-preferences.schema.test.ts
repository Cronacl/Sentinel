import { describe, expect, it } from "bun:test";

import { chatSelectionSchema } from "./chat-preferences.schema";

describe("chatSelectionSchema", () => {
  it("accepts none and xhigh reasoning effort values", () => {
    expect(
      chatSelectionSchema.safeParse({ reasoningEffort: "none" }).success,
    ).toBe(true);
    expect(
      chatSelectionSchema.safeParse({ reasoningEffort: "xhigh" }).success,
    ).toBe(true);
  });
});
