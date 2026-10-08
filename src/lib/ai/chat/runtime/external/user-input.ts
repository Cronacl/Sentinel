// Questions an external agent asks the user (Cursor's cursor/ask_question,
// ACP form elicitations), as the shared user-input card shows them and back.
// The card (renderers/external-runtime/user-input.tsx) submits one string:
// the chosen label when one question gets one answer, otherwise
// "<question>: <a, b>" lines, plus an optional "\n\nAdditional context: …"
// suffix from its last step. parseQuestionResponse turns that back into
// per-question option ids, so every question gets its own answer (the old
// Cursor runtime answered only the first one). Pure.

export type ExternalQuestionOption = {
  description?: string;
  id: string;
  label: string;
};

export type ExternalQuestion = {
  header?: string;
  id: string;
  multiSelect: boolean;
  options: ExternalQuestionOption[];
  question: string;
};

export type ExternalQuestionAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  /** Free text that matched no option (or a question without options). */
  text?: string;
};

export type ExternalQuestionResponse = {
  /** "Additional context" the user typed on the last step. */
  additionalContext: string | null;
  answers: ExternalQuestionAnswer[];
};

const CONTEXT_SEPARATOR = "\n\nAdditional context: ";

/** The part input the user-input card renders. */
export function buildQuestionInput(input: {
  prompt?: string | null;
  questions: readonly ExternalQuestion[];
  title?: string | null;
}) {
  return {
    ...(input.prompt ? { prompt: input.prompt } : {}),
    questions: input.questions.map((question) => ({
      ...(question.header ? { header: question.header } : {}),
      id: question.id,
      multiSelect: question.multiSelect,
      options: question.options.map((option) => ({
        ...(option.description ? { description: option.description } : {}),
        id: option.id,
        label: option.label,
      })),
      question: question.question,
    })),
    ...(input.title ? { title: input.title } : {}),
  };
}

function matchOptionIds(question: ExternalQuestion, answer: string) {
  const trimmed = answer.trim();
  const exact = question.options.find((option) => option.label === trimmed);
  if (exact) {
    return { ids: [exact.id], rest: "" };
  }
  if (!question.multiSelect) {
    return { ids: [], rest: trimmed };
  }

  // Multi-select answers are joined with ", "; labels may contain commas,
  // so match the longest known label at each position.
  const labels = [...question.options].sort(
    (left, right) => right.label.length - left.label.length,
  );
  const ids: string[] = [];
  let rest = trimmed;
  while (rest.length > 0) {
    const option = labels.find(
      (candidate) =>
        rest === candidate.label || rest.startsWith(`${candidate.label}, `),
    );
    if (!option) {
      break;
    }
    if (!ids.includes(option.id)) {
      ids.push(option.id);
    }
    rest = rest.slice(option.label.length).replace(/^, /, "");
  }
  return { ids, rest: rest.trim() };
}

function toAnswer(
  question: ExternalQuestion,
  text: string,
): ExternalQuestionAnswer {
  const { ids, rest } = matchOptionIds(question, text);
  return {
    questionId: question.id,
    selectedOptionIds: ids,
    ...(rest ? { text: rest } : {}),
  };
}

/** "<question>: <answers>" sections, in question order; null when the text is not in that form. */
function parseSections(questions: readonly ExternalQuestion[], text: string) {
  const answers = new Map<string, string>();
  let rest = text;
  for (const [index, question] of questions.entries()) {
    const marker = `${question.question}: `;
    if (!rest.startsWith(marker)) {
      continue;
    }
    rest = rest.slice(marker.length);
    const next = questions
      .slice(index + 1)
      .map((candidate) => rest.indexOf(`\n${candidate.question}: `))
      .filter((position) => position >= 0)
      .reduce(
        (earliest, position) => Math.min(earliest, position),
        rest.length,
      );
    answers.set(question.id, rest.slice(0, next).trim());
    rest = rest.slice(next).replace(/^\n/, "");
  }
  return rest.trim().length === 0 && answers.size > 0 ? answers : null;
}

/**
 * The card's submitted string as answers per question. Questions the user
 * skipped are left out; free text that answers no specific question goes to
 * the only question, else to `additionalContext`.
 */
export function parseQuestionResponse(
  questions: readonly ExternalQuestion[],
  response: string,
): ExternalQuestionResponse {
  const trimmed = response.trim();
  const separator = trimmed.lastIndexOf(CONTEXT_SEPARATOR);
  const body = separator >= 0 ? trimmed.slice(0, separator) : trimmed;
  const context =
    separator >= 0
      ? trimmed.slice(separator + CONTEXT_SEPARATOR.length).trim() || null
      : null;

  const sections = parseSections(questions, body);
  if (sections) {
    return {
      additionalContext: context,
      answers: questions.flatMap((question) => {
        const text = sections.get(question.id);
        return text != null ? [toAnswer(question, text)] : [];
      }),
    };
  }

  if (questions.length === 1) {
    return {
      additionalContext: context,
      answers: body ? [toAnswer(questions[0]!, body)] : [],
    };
  }

  // A bare label answers the one question offering it.
  const owners = questions.filter((question) =>
    question.options.some((option) => option.label === body),
  );
  if (owners.length === 1) {
    return {
      additionalContext: context,
      answers: [toAnswer(owners[0]!, body)],
    };
  }

  return {
    additionalContext: [body, context].filter(Boolean).join("\n\n") || null,
    answers: [],
  };
}
