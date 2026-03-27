import { describe, expect, it } from "bun:test";

import { CHAT_ENGINES } from "./enums";

describe("CHAT_ENGINES", () => {
  it("includes Claude as a supported chat engine", () => {
    expect(CHAT_ENGINES).toContain("claude");
  });
});
