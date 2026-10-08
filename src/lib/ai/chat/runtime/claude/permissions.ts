import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";

function isClaudePermissionRecord(
  input: unknown,
): input is Record<string, unknown> {
  return !!input && typeof input === "object" && !Array.isArray(input);
}

export function normalizeClaudePermissionInput(
  input: unknown,
): Record<string, unknown> {
  if (isClaudePermissionRecord(input)) {
    return input;
  }

  return {};
}

export function resolveClaudePermissionInput(input: {
  pendingInput?: unknown;
  persistedToolInput?: unknown;
}) {
  if (isClaudePermissionRecord(input.pendingInput)) {
    return input.pendingInput;
  }

  if (isClaudePermissionRecord(input.persistedToolInput)) {
    return input.persistedToolInput;
  }

  return {};
}

export function buildClaudePermissionResult(input: {
  approved: boolean;
  message?: string;
  toolInput?: unknown;
}): PermissionResult {
  if (!input.approved) {
    return {
      behavior: "deny",
      message: input.message ?? "Request denied.",
    };
  }

  return {
    behavior: "allow",
    updatedInput: normalizeClaudePermissionInput(input.toolInput),
  };
}

// The Claude user-input card submits a single string: the chosen label when
// one question gets one answer, otherwise "<question>: <a, b>" lines, plus an
// optional "\n\nAdditional context: <text>" suffix from its last step
// (renderers/claude-user-input). AskUserQuestion wants those answers keyed by
// question text in `updatedInput.answers`.
const CLAUDE_USER_INPUT_CONTEXT_SEPARATOR = "\n\nAdditional context: ";

type ClaudeAskUserQuestionAnswers = {
  annotations?: Record<string, { notes: string }>;
  answers: Record<string, string>;
  response?: string;
};

function readClaudeQuestionTexts(questions: unknown) {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.flatMap((question) =>
    isClaudePermissionRecord(question) &&
    typeof question.question === "string" &&
    question.question.length > 0
      ? [question.question]
      : [],
  );
}

function findClaudeQuestionOfferingLabel(questions: unknown, label: string) {
  if (!Array.isArray(questions)) {
    return null;
  }

  const owners = questions.flatMap((question) =>
    isClaudePermissionRecord(question) &&
    typeof question.question === "string" &&
    Array.isArray(question.options) &&
    question.options.some(
      (option) => isClaudePermissionRecord(option) && option.label === label,
    )
      ? [question.question]
      : [],
  );

  return owners.length === 1 ? owners[0]! : null;
}

function parseSerializedClaudeAnswers(
  questionTexts: string[],
  serialized: string,
) {
  const answers: Record<string, string> = {};
  let rest = serialized;

  for (const [index, questionText] of questionTexts.entries()) {
    const marker = `${questionText}: `;
    if (!rest.startsWith(marker)) {
      continue;
    }

    rest = rest.slice(marker.length);
    const nextAnswerStart = questionTexts
      .slice(index + 1)
      .map((nextQuestion) => rest.indexOf(`\n${nextQuestion}: `))
      .filter((position) => position >= 0)
      .reduce(
        (earliest, position) => Math.min(earliest, position),
        rest.length,
      );
    answers[questionText] = rest.slice(0, nextAnswerStart).trim();
    rest = rest.slice(nextAnswerStart).replace(/^\n/, "");
  }

  return rest.trim().length === 0 && Object.keys(answers).length > 0
    ? answers
    : null;
}

export function buildClaudeAskUserQuestionAnswers(input: {
  questions: unknown;
  response: string;
}): ClaudeAskUserQuestionAnswers {
  const questionTexts = readClaudeQuestionTexts(input.questions);
  const response = input.response.trim();
  const separatorIndex = response.lastIndexOf(
    CLAUDE_USER_INPUT_CONTEXT_SEPARATOR,
  );
  const serializedAnswers =
    separatorIndex >= 0 ? response.slice(0, separatorIndex) : response;
  const additionalContext =
    separatorIndex >= 0
      ? response
          .slice(separatorIndex + CLAUDE_USER_INPUT_CONTEXT_SEPARATOR.length)
          .trim()
      : "";

  const answers = parseSerializedClaudeAnswers(
    questionTexts,
    serializedAnswers,
  );
  if (answers) {
    const lastQuestion = questionTexts.at(-1);
    return {
      answers,
      ...(additionalContext && lastQuestion
        ? { annotations: { [lastQuestion]: { notes: additionalContext } } }
        : {}),
    };
  }

  // A lone question takes the text as its answer: a chosen label, or the
  // user's own "Other" text.
  if (questionTexts.length === 1) {
    return { answers: { [questionTexts[0]!]: response } };
  }

  // The card sends a bare label when only one of several questions got a
  // single answer; give it to the one question that offers that label.
  const labelOwner = findClaudeQuestionOfferingLabel(input.questions, response);
  if (labelOwner) {
    return { answers: { [labelOwner]: response } };
  }

  // Free text that answers no specific question goes back as a general reply.
  return { answers: {}, response };
}

/**
 * Answers an AskUserQuestion permission request the way the Agent SDK
 * documents: allow it with the original input plus `answers` (keyed by
 * question text; multi-select answers comma-separated).
 */
export function buildClaudeAskUserQuestionResult(input: {
  response: string;
  toolInput?: unknown;
}): PermissionResult {
  const toolInput = normalizeClaudePermissionInput(input.toolInput);

  return {
    behavior: "allow",
    updatedInput: {
      ...toolInput,
      ...buildClaudeAskUserQuestionAnswers({
        questions: toolInput.questions,
        response: input.response,
      }),
    },
  };
}
