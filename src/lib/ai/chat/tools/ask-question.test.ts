import { describe, expect, it, mock } from "bun:test";

const createThreadPlanQuestionSet = mock(
  async ({ questions }: { questions: unknown[] }) => ({
    id: "qs-1",
    questions,
  }),
);

mock.module("@/lib/plan/service", () => ({
  createThreadPlanQuestionSet,
}));

const {
  askQuestionInputSchema,
  executeAskQuestion,
  sanitizeAskQuestionInput,
} = await import("./ask-question");

describe("ask_question", () => {
  it("accepts oversized model input and trims it to supported limits", () => {
    const parsed = askQuestionInputSchema.parse({
      questions: [
        {
          header: "Feature Request",
          options: [
            { description: "One", label: "One" },
            { description: "Two", label: "Two" },
            { description: "Three", label: "Three" },
            { description: "Four", label: "Four" },
            { description: "Five", label: "Five" },
          ],
          question: "Which feature should we prioritize?",
        },
        {
          header: "Second",
          options: [
            { description: "A", label: "A" },
            { description: "B", label: "B" },
          ],
          question: "Second question",
        },
        {
          header: "Third",
          options: [
            { description: "A", label: "A" },
            { description: "B", label: "B" },
          ],
          question: "Third question",
        },
        {
          header: "Fourth",
          options: [
            { description: "A", label: "A" },
            { description: "B", label: "B" },
          ],
          question: "Fourth question",
        },
      ],
    });

    const sanitized = sanitizeAskQuestionInput(parsed);

    expect(sanitized.questions).toHaveLength(3);
    expect(sanitized.questions[0]?.options).toHaveLength(4);
    expect(sanitized.questions[0]?.options.map((option) => option.label)).toEqual(
      ["One", "Two", "Three", "Four"],
    );
  });

  it("stores sanitized questions instead of surfacing a raw validation error", async () => {
    const result = await executeAskQuestion({
      input: askQuestionInputSchema.parse({
        questions: [
          {
            header: "Feature Request",
            options: [
              { description: "Trigonometric", label: "Trig" },
              { description: "Power", label: "Power" },
              { description: "Logarithmic", label: "Logs" },
              { description: "Memory", label: "Memory" },
              { description: "Conversions", label: "Conversions" },
            ],
            question: "What features would you like to add?",
          },
        ],
      }),
      runtime: { threadId: "thread-1" },
    });

    expect(createThreadPlanQuestionSet).toHaveBeenCalledTimes(1);
    expect(createThreadPlanQuestionSet.mock.calls[0]?.[0]).toMatchObject({
      questions: [
        {
          header: "Feature Request",
          options: [
            { label: "Trig" },
            { label: "Power" },
            { label: "Logs" },
            { label: "Memory" },
          ],
          question: "What features would you like to add?",
        },
      ],
      threadId: "thread-1",
    });
    expect(result.status).toBe("pending");
    expect(result.questions[0]?.options).toHaveLength(4);
  });

  it("passes allowMultiple through to the stored question", async () => {
    createThreadPlanQuestionSet.mockClear();
    await executeAskQuestion({
      input: askQuestionInputSchema.parse({
        questions: [
          {
            allowMultiple: true,
            header: "Multi",
            options: [
              { description: "A desc", label: "A" },
              { description: "B desc", label: "B" },
            ],
            question: "Pick all that apply",
          },
        ],
      }),
      runtime: { threadId: "thread-2" },
    });

    const storedQuestion =
      (createThreadPlanQuestionSet.mock.calls[0]?.[0] as { questions: Array<{ allowMultiple?: boolean }> })
        .questions[0];
    expect(storedQuestion?.allowMultiple).toBe(true);
  });

  it("omits allowMultiple when not set", () => {
    const sanitized = sanitizeAskQuestionInput(
      askQuestionInputSchema.parse({
        questions: [
          {
            header: "Single",
            options: [
              { description: "X", label: "X" },
              { description: "Y", label: "Y" },
            ],
            question: "Pick one",
          },
        ],
      }),
    );

    expect(sanitized.questions[0]).not.toHaveProperty("allowMultiple");
  });
});
