import { describe, expect, it } from "bun:test";

import {
  buildClaudeAskUserQuestionAnswers,
  buildClaudeAskUserQuestionResult,
  buildClaudePermissionResult,
  normalizeClaudePermissionInput,
  resolveClaudePermissionInput,
} from "./claude-permissions";

describe("Claude permission helpers", () => {
  it("returns the original tool input when an approval is accepted", () => {
    expect(
      buildClaudePermissionResult({
        approved: true,
        toolInput: normalizeClaudePermissionInput({
          command: "ls -la",
          description: "List files",
        }),
      }),
    ).toEqual({
      behavior: "allow",
      updatedInput: {
        command: "ls -la",
        description: "List files",
      },
    });
  });

  it("normalizes non-object tool input to an empty object", () => {
    expect(normalizeClaudePermissionInput("ls -la")).toEqual({});
  });

  it("recovers the original tool input from the persisted Claude tool payload", () => {
    expect(
      resolveClaudePermissionInput({
        pendingInput: undefined,
        persistedToolInput: {
          command: "ls -la",
        },
      }),
    ).toEqual({
      command: "ls -la",
    });
  });

  it("returns a deny result with a message when approval is rejected", () => {
    expect(
      buildClaudePermissionResult({
        approved: false,
        message: "No",
        toolInput: {},
      }),
    ).toEqual({
      behavior: "deny",
      message: "No",
    });
  });

  it("returns an empty record instead of undefined for stale approvals", () => {
    expect(
      buildClaudePermissionResult({
        approved: true,
        toolInput: undefined,
      }),
    ).toEqual({
      behavior: "allow",
      updatedInput: {},
    });
  });
});

describe("Claude AskUserQuestion answers", () => {
  const formatQuestion = {
    header: "Format",
    multiSelect: false,
    options: [
      { description: "Brief overview", label: "Summary" },
      { description: "Full explanation", label: "Detailed" },
    ],
    question: "How should I format the output?",
  };
  const sectionsQuestion = {
    header: "Sections",
    multiSelect: true,
    options: [
      { description: "Opening context", label: "Introduction" },
      { description: "Final summary", label: "Conclusion" },
    ],
    question: "Which sections should I include?",
  };

  it("answers a single question with the chosen label", () => {
    expect(
      buildClaudeAskUserQuestionResult({
        response: "Summary",
        toolInput: { questions: [formatQuestion] },
      }),
    ).toEqual({
      behavior: "allow",
      updatedInput: {
        answers: { "How should I format the output?": "Summary" },
        questions: [formatQuestion],
      },
    });
  });

  it("maps the user-input card's serialized answers and additional context", () => {
    expect(
      buildClaudeAskUserQuestionAnswers({
        questions: [formatQuestion, sectionsQuestion],
        response: [
          "How should I format the output?: Detailed",
          "Which sections should I include?: Introduction, Conclusion",
          "",
          "Additional context: Keep it under a page.",
        ].join("\n"),
      }),
    ).toEqual({
      annotations: {
        "Which sections should I include?": {
          notes: "Keep it under a page.",
        },
      },
      answers: {
        "How should I format the output?": "Detailed",
        "Which sections should I include?": "Introduction, Conclusion",
      },
    });
  });

  it("keeps answers for questions whose text contains colons", () => {
    const timeQuestion = {
      ...formatQuestion,
      question: "Deploy at: 9:00 or 17:00?",
    };

    expect(
      buildClaudeAskUserQuestionAnswers({
        questions: [timeQuestion, sectionsQuestion],
        response:
          "Deploy at: 9:00 or 17:00?: 9:00\nWhich sections should I include?: Conclusion",
      }).answers,
    ).toEqual({
      "Deploy at: 9:00 or 17:00?": "9:00",
      "Which sections should I include?": "Conclusion",
    });
  });

  it("uses free text as the answer to a lone question", () => {
    expect(
      buildClaudeAskUserQuestionAnswers({
        questions: [formatQuestion],
        response: "A table, please",
      }),
    ).toEqual({
      answers: { "How should I format the output?": "A table, please" },
    });
  });

  it("returns unmatched free text across several questions as a general reply", () => {
    expect(
      buildClaudeAskUserQuestionAnswers({
        questions: [formatQuestion, sectionsQuestion],
        response: "Let's discuss this first.",
      }),
    ).toEqual({ answers: {}, response: "Let's discuss this first." });
  });
});
