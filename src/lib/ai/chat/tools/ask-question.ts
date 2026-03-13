import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";

import { createThreadPlanQuestionSet } from "@/lib/plan/service";
import {
  threadPlanAnswerSchema,
  threadPlanQuestionSchema,
} from "@/schemas/plan.schema";

const MAX_STORED_QUESTION_COUNT = 3;
const MAX_STORED_OPTION_COUNT = 4;
const MIN_STORED_OPTION_COUNT = 2;

const askQuestionInputItemSchema = z.object({
  allowMultiple: z
    .boolean()
    .optional()
    .describe(
      "When true the user can select multiple options instead of one. Use for questions where several answers apply simultaneously.",
    ),
  header: z.string().trim().min(1).max(80),
  id: z.string().trim().min(1).max(80).optional(),
  options: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(400),
        label: z.string().trim().min(1).max(160),
      }),
    )
    .min(2)
    .max(8),
  question: z.string().trim().min(1).max(400),
});

export const askQuestionInputSchema = z.object({
  questions: z.array(askQuestionInputItemSchema).min(1).max(6),
});

export const askQuestionOutputSchema = z.object({
  answers: z.array(threadPlanAnswerSchema).nullable(),
  questionSetId: z.string(),
  questions: z.array(threadPlanQuestionSchema).min(1).max(3),
  status: z.enum(["pending", "answered"]),
});

function trimToLength(value: string, max: number) {
  return value.trim().slice(0, max).trim();
}

export function sanitizeAskQuestionInput(
  input: z.infer<typeof askQuestionInputSchema>,
) {
  const questions = input.questions
    .slice(0, MAX_STORED_QUESTION_COUNT)
    .map((question) => {
      const seenOptionLabels = new Set<string>();
      const options = question.options
        .map((option) => ({
          description: trimToLength(option.description, 240),
          label: trimToLength(option.label, 80),
        }))
        .filter(
          (option) =>
            option.label.length > 0 &&
            option.description.length > 0 &&
            !seenOptionLabels.has(option.label.toLowerCase()) &&
            seenOptionLabels.add(option.label.toLowerCase()),
        )
        .slice(0, MAX_STORED_OPTION_COUNT);

      return {
        ...(question.allowMultiple ? { allowMultiple: true } : {}),
        header: trimToLength(question.header, 24),
        id: question.id ? trimToLength(question.id, 80) : undefined,
        options,
        question: trimToLength(question.question, 240),
      };
    })
    .filter((question) => question.options.length >= MIN_STORED_OPTION_COUNT);

  if (questions.length === 0) {
    throw new Error(
      "Clarification questions require at least one question with 2 to 4 answer options.",
    );
  }

  return { questions };
}

export async function executeAskQuestion({
  input,
  runtime,
}: {
  input: z.infer<typeof askQuestionInputSchema>;
  runtime: {
    threadId: string;
  };
}) {
  const sanitized = sanitizeAskQuestionInput(input);
  const questions = sanitized.questions.map((question) => ({
    ...question,
    id: question.id || createId(),
  }));
  const questionSet = await createThreadPlanQuestionSet({
    questions,
    threadId: runtime.threadId,
  });

  return {
    answers: null,
    questionSetId: questionSet.id,
    questions: questionSet.questions,
    status: "pending" as const,
  };
}
