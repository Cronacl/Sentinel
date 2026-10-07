import { describe, expect, it } from "bun:test";

import { REASONING_EFFORTS } from "@/lib/ai/providers/models";

import {
  AUTOMATION_REASONING_EFFORTS,
  CHAT_ENGINES,
  PERMISSION_MODES,
} from "./enums";

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

describe("PERMISSION_MODES", () => {
  it("stores the widened modes, least permissive first", () => {
    expect([...PERMISSION_MODES]).toEqual([
      "default",
      "accept_edits",
      "auto",
      "full",
    ]);
  });
});

describe("reasoning efforts", () => {
  it("carry max, and automations accept every chat effort", () => {
    expect(REASONING_EFFORTS).toContain("max");
    expect([...AUTOMATION_REASONING_EFFORTS]).toEqual([...REASONING_EFFORTS]);
  });
});
