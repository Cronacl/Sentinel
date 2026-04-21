import { describe, expect, it } from "bun:test";

import { CHAT_ENGINES } from "./enums";

describe("CHAT_ENGINES", () => {
  it("includes Claude as a supported chat engine", () => {
    expect(CHAT_ENGINES).toContain("claude");
  });

  it("includes Copilot as a supported chat engine", () => {
    expect(CHAT_ENGINES).toContain("copilot");
  });

  it("includes Cursor as a supported chat engine", () => {
    expect(CHAT_ENGINES).toContain("cursor");
  });

  it("includes OpenCode as a supported chat engine", () => {
    expect(CHAT_ENGINES).toContain("opencode");
  });
});
