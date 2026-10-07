import { describe, expect, it } from "bun:test";

import {
  buildCodexUserInputPrompt,
  isCodexVersionAtLeast,
  mapCodexUserInputAnswers,
  parseCodexUserInputQuestions,
  parseCodexVersion,
  toCodexMcpElicitationResponse,
} from "./codex-app-server/protocol";
import {
  applyCodexTokenUsageUpdate,
  createCodexTokenUsageTracker,
} from "../runtime/codex/token-usage";

const questions = parseCodexUserInputQuestions({
  questions: [
    {
      header: "Scope",
      id: "scope",
      options: [
        { description: "Only this file", label: "File" },
        { description: "Whole repo", label: "Repo" },
      ],
      question: "What should I change?",
    },
    {
      header: "Tests",
      id: "tests",
      isOther: true,
      options: null,
      question: "Which test command?",
    },
  ],
});

describe("Codex version parsing", () => {
  it("reads the version from initialize.userAgent and --version output", () => {
    expect(
      parseCodexVersion("codex_cli_rs/0.160.1 (Mac OS 26.1.0; arm64) x/1.0"),
    ).toBe("0.160.1");
    expect(parseCodexVersion("codex-cli 0.98.0")).toBe("0.98.0");
    expect(parseCodexVersion("mock-codex-app-server")).toBeNull();
  });

  it("treats unknown versions as current", () => {
    expect(isCodexVersionAtLeast(null, "0.156.0")).toBe(true);
    expect(isCodexVersionAtLeast("codex_cli_rs/0.155.9", "0.156.0")).toBe(
      false,
    );
    expect(isCodexVersionAtLeast("codex_cli_rs/0.156.0", "0.156.0")).toBe(true);
    expect(isCodexVersionAtLeast("codex_cli_rs/1.0.0", "0.156.0")).toBe(true);
  });
});

describe("Codex request_user_input mapping", () => {
  it("renders every question with numbered options", () => {
    expect(buildCodexUserInputPrompt({ questions: [] })).toBe(
      "Codex is requesting input",
    );
    expect(buildCodexUserInputPrompt({ prompt: "Legacy prompt" })).toBe(
      "Legacy prompt",
    );
    expect(
      buildCodexUserInputPrompt({
        questions: [
          {
            header: "Scope",
            id: "scope",
            options: [{ description: "Only this file", label: "File" }],
            question: "What should I change?",
          },
          { header: "", id: "tests", question: "Which test command?" },
        ],
      }),
    ).toBe(
      [
        "1) Scope: What should I change?\n  1. File - Only this file",
        "2) Which test command?",
        "Answer each question on its own line, starting with its number (for example `1: your answer`).",
      ].join("\n\n"),
    );
  });

  it("maps numbered lines, headers and option indexes to question ids", () => {
    expect(mapCodexUserInputAnswers(questions, "1: 2\n2: bun test")).toEqual({
      scope: { answers: ["Repo"] },
      tests: { answers: ["bun test"] },
    });
    expect(
      mapCodexUserInputAnswers(questions, "Tests: npm test\nScope: file"),
    ).toEqual({
      scope: { answers: ["File"] },
      tests: { answers: ["npm test"] },
    });
  });

  it("falls back to line order, then to the whole response", () => {
    expect(mapCodexUserInputAnswers(questions, "repo\nmake check")).toEqual({
      scope: { answers: ["Repo"] },
      tests: { answers: ["make check"] },
    });
    expect(mapCodexUserInputAnswers(questions, "do whatever")).toEqual({
      scope: { answers: ["do whatever"] },
      tests: { answers: ["do whatever"] },
    });
  });
});

describe("Codex MCP elicitation responses", () => {
  const form = {
    message: "Allow?",
    mode: "form",
    requestedSchema: {
      properties: {
        mode: {
          oneOf: [
            { const: "allow_once", title: "Allow once" },
            { const: "allow_session", title: "Allow for this session" },
          ],
          type: "string",
        },
        note: { default: "n/a", type: "string" },
      },
      required: ["mode"],
      type: "object",
    },
    serverName: "docs",
    threadId: "thr",
  };

  it("fills accepted forms from options and defaults", () => {
    expect(toCodexMcpElicitationResponse(form, "accept")).toEqual({
      action: "accept",
      content: { mode: "allow_once", note: "n/a" },
    });
    expect(toCodexMcpElicitationResponse(form, "acceptForSession")).toEqual({
      _meta: { persist: "session" },
      action: "accept",
      content: { mode: "allow_session", note: "n/a" },
    });
  });

  it("declines forms it cannot complete and unsupported modes", () => {
    expect(
      toCodexMcpElicitationResponse(
        {
          ...form,
          requestedSchema: {
            properties: { token: { type: "string" } },
            required: ["token"],
            type: "object",
          },
        },
        "accept",
      ),
    ).toEqual({ action: "decline" });
    expect(
      toCodexMcpElicitationResponse(
        {
          challenge: "abc",
          description: "Confirm",
          mode: "openai/userVerification",
          serverName: "x",
          threadId: "thr",
          title: "Verify",
        },
        "accept",
      ),
    ).toEqual({ action: "decline" });
    expect(toCodexMcpElicitationResponse(form, "decline")).toEqual({
      action: "decline",
    });
  });
});

describe("Codex token usage", () => {
  const breakdown = (inputTokens: number, outputTokens: number) => ({
    cachedInputTokens: 0,
    inputTokens,
    outputTokens,
    reasoningOutputTokens: 0,
    totalTokens: inputTokens + outputTokens,
  });

  it("uses `last` as the delta when the running total resets", () => {
    const tracker = createCodexTokenUsageTracker();
    applyCodexTokenUsageUpdate(tracker, {
      tokenUsage: { last: breakdown(10, 5), total: breakdown(100, 50) },
    });

    expect(
      applyCodexTokenUsageUpdate(tracker, {
        tokenUsage: {
          last: breakdown(20, 7),
          modelContextWindow: 0,
          total: breakdown(20, 7),
        },
      }),
    ).toEqual({
      inputTokens: 20,
      outputTokens: 12,
      reasoningTokens: 0,
      totalTokens: 32,
    });
  });

  it("still reads the flat usage shape and ignores empty payloads", () => {
    const tracker = createCodexTokenUsageTracker();
    expect(
      applyCodexTokenUsageUpdate(tracker, {
        tokenUsage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
      }),
    ).toEqual({
      inputTokens: 5,
      outputTokens: 2,
      reasoningTokens: undefined,
      totalTokens: 7,
    });
    expect(applyCodexTokenUsageUpdate(tracker, { tokenUsage: {} })).toBeNull();
    expect(applyCodexTokenUsageUpdate(tracker, null)).toBeNull();
  });
});
