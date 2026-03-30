"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Description,
  Label,
  ProgressBar,
  Radio,
  RadioGroup,
  TextArea,
} from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { unwrapClaudeInput } from "../claude-helpers";

type QuestionOption = {
  description: string;
  label: string;
  preview?: string;
};

type Question = {
  header: string;
  multiSelect: boolean;
  options: QuestionOption[];
  question: string;
};

type PromptUserInputInput = {
  prompt: string;
  requestId?: string;
};

type ClaudeUserInputInput = {
  questions: Question[];
};

type ParsedUserInput =
  | { prompt: string; type: "prompt" }
  | { questions: Question[]; type: "questions" };

function isQuestionOption(value: unknown): value is QuestionOption {
  if (!value || typeof value !== "object") return false;
  const option = value as Record<string, unknown>;
  return (
    typeof option.label === "string" && typeof option.description === "string"
  );
}

function isUserInputInput(value: unknown): value is ClaudeUserInputInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.questions);
}

function isPromptInput(value: unknown): value is PromptUserInputInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.prompt === "string";
}

function normalizeQuestions(value: unknown): Question[] | null {
  if (!isUserInputInput(value)) return null;

  const questions = value.questions.flatMap((question) => {
    if (!question || typeof question !== "object") {
      return [];
    }

    const candidate = question as Record<string, unknown>;
    if (
      typeof candidate.question !== "string" ||
      typeof candidate.header !== "string" ||
      !Array.isArray(candidate.options)
    ) {
      return [];
    }

    const options = candidate.options.filter(isQuestionOption);
    if (options.length === 0) {
      return [];
    }

    return [
      {
        header: candidate.header,
        multiSelect:
          candidate.multiSelect === true || candidate.allowMultiple === true,
        options,
        question: candidate.question,
      },
    ];
  });

  return questions.length > 0 ? questions : null;
}

function parseUserInput(rawInput: unknown): ParsedUserInput | null {
  const unwrapped = unwrapClaudeInput<unknown>(rawInput);
  const questions = normalizeQuestions(unwrapped);
  if (questions) {
    return { questions, type: "questions" };
  }

  if (isPromptInput(unwrapped)) {
    return { prompt: unwrapped.prompt, type: "prompt" };
  }

  return null;
}

function getPromptText(input: ClaudeUserInputInput): string {
  if (input.questions.length === 0) return "Requesting input";
  return input.questions.map((q) => q.question).join("\n");
}

export const ClaudeUserInputTool = memo(function ClaudeUserInputTool({
  onApprove,
  part,
}: RendererProps) {
  const isWaiting = part.state === "approval-requested";
  const isDone =
    part.state === "output-available" || part.state === "approval-responded";

  const rawInput = "input" in part ? part.input : undefined;
  const userInput = useMemo(() => parseUserInput(rawInput), [rawInput]);
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const [currentStep, setCurrentStep] = useState(0);
  const [response, setResponse] = useState("");
  const [singleSelections, setSingleSelections] = useState<
    Record<string, string>
  >({});
  const [multiSelections, setMultiSelections] = useState<
    Record<string, string[]>
  >({});

  const structuredResponse = useMemo(() => {
    if (userInput?.type !== "questions") {
      return response.trim();
    }

    const answeredQuestions = userInput.questions
      .map((question) => {
        const answers = question.multiSelect
          ? (multiSelections[question.question] ?? [])
          : [singleSelections[question.question]].filter(Boolean);

        if (answers.length === 0) {
          return null;
        }

        return {
          answers,
          question: question.question,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value != null);

    const extraContext = response.trim();
    if (answeredQuestions.length === 0) {
      return extraContext;
    }

    if (
      answeredQuestions.length === 1 &&
      answeredQuestions[0]?.answers.length === 1 &&
      !extraContext
    ) {
      return answeredQuestions[0].answers[0] ?? "";
    }

    const serializedAnswers = answeredQuestions
      .map((answer) => `${answer.question}: ${answer.answers.join(", ")}`)
      .join("\n");

    if (!extraContext) {
      return serializedAnswers;
    }

    return `${serializedAnswers}\n\nAdditional context: ${extraContext}`;
  }, [multiSelections, response, singleSelections, userInput]);

  const handleSubmit = useCallback(() => {
    const trimmedResponse = structuredResponse.trim();
    if (!approvalId || !trimmedResponse) return;
    onApprove?.(approvalId, trimmedResponse);
  }, [approvalId, onApprove, structuredResponse]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  useEffect(() => {
    setCurrentStep(0);
  }, [userInput]);

  const promptText =
    userInput?.type === "questions"
      ? getPromptText({ questions: userInput.questions })
      : (userInput?.prompt ?? "Requesting input");

  const currentQuestion =
    userInput?.type === "questions"
      ? (userInput.questions[currentStep] ?? null)
      : null;
  const singleSelection =
    currentQuestion == null
      ? undefined
      : singleSelections[currentQuestion.question];
  const currentSelections =
    currentQuestion == null
      ? []
      : currentQuestion.multiSelect
        ? (multiSelections[currentQuestion.question] ?? [])
        : typeof singleSelection === "string"
          ? [singleSelection]
          : [];
  const questionCount =
    userInput?.type === "questions" ? userInput.questions.length : 0;
  const isLastStep =
    currentQuestion != null && currentStep === questionCount - 1;
  const canMoveForward = currentSelections.length > 0;

  const summary = (
    <>
      <Icon
        icon="solar:chat-round-line-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {isDone ? "Input provided" : "Claude is requesting input"}
    </>
  );

  return (
    <ToolLayout
      summary={summary}
      isRunning={false}
      isError={false}
      isExpandable={isWaiting}
      isExpanded={isWaiting}
      onExpandedChange={() => {}}
    >
      {isWaiting && (
        <div className="flex flex-col gap-2">
          {userInput?.type === "questions" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {currentQuestion?.header || "Question"}
                    </p>
                    <p className="mt-0.5 text-[12px] text-foreground/60">
                      Step {Math.min(currentStep + 1, questionCount)} of{" "}
                      {questionCount}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {userInput.questions.map((question, index) => {
                      const answered = question.multiSelect
                        ? (multiSelections[question.question] ?? []).length > 0
                        : Boolean(singleSelections[question.question]);

                      return (
                        <span
                          className={`h-1.5 rounded-full transition-all ${
                            index === currentStep
                              ? "w-5 bg-primary"
                              : answered
                                ? "w-2.5 bg-primary/50"
                                : "w-2.5 bg-foreground/12"
                          }`}
                          key={`${question.header}-${index}`}
                        />
                      );
                    })}
                  </div>
                </div>
                <ProgressBar.Root
                  aria-label="Question progress"
                  className="gap-1"
                  size="sm"
                  value={
                    questionCount > 0
                      ? ((currentStep + 1) / questionCount) * 100
                      : 0
                  }
                >
                  <ProgressBar.Track className="h-1.5">
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar.Root>
              </div>

              {currentQuestion ? (
                <>
                  <div className="space-y-3">
                    <p className="whitespace-pre-wrap text-[14px] leading-6 text-foreground">
                      {currentQuestion.question}
                    </p>

                    {currentQuestion.multiSelect ? (
                      <CheckboxGroup
                        className="gap-0"
                        value={currentSelections}
                        onChange={(values) => {
                          setMultiSelections((current) => ({
                            ...current,
                            [currentQuestion.question]: values,
                          }));
                        }}
                      >
                        {currentQuestion.options.map((option) => (
                          <Checkbox
                            className="my-0.5 w-full cursor-pointer items-start gap-2 rounded-xl border border-border/30 px-2.5 py-2 transition-colors data-selected:border-primary/35 data-selected:bg-primary/8"
                            key={option.label}
                            value={option.label}
                          >
                            <Checkbox.Control className="mt-0.5 size-3 shrink-0">
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                            <Checkbox.Content className="min-w-0 gap-0">
                              <Label className="cursor-pointer text-[12px] font-medium text-foreground">
                                {option.label}
                              </Label>
                              {option.description ? (
                                <Description className="text-[11px] leading-5 text-foreground/55">
                                  {option.description}
                                </Description>
                              ) : null}
                            </Checkbox.Content>
                          </Checkbox>
                        ))}
                      </CheckboxGroup>
                    ) : (
                      <RadioGroup
                        className="gap-0"
                        value={currentSelections[0] ?? ""}
                        onChange={(value) => {
                          setSingleSelections((current) => ({
                            ...current,
                            [currentQuestion.question]: value,
                          }));
                        }}
                      >
                        {currentQuestion.options.map((option) => (
                          <Radio
                            className="my-0.5 w-full cursor-pointer items-start gap-2 rounded-xl border border-border/30 px-2.5 py-2 transition-colors data-selected:border-primary/35 data-selected:bg-primary/8"
                            key={option.label}
                            value={option.label}
                          >
                            <Radio.Control className="mt-0.5 size-3 shrink-0">
                              <Radio.Indicator />
                            </Radio.Control>
                            <Radio.Content className="min-w-0 gap-0">
                              <Label className="cursor-pointer text-[12px] font-medium text-foreground">
                                {option.label}
                              </Label>
                              {option.description ? (
                                <Description className="text-[11px] leading-5 text-foreground/55">
                                  {option.description}
                                </Description>
                              ) : null}
                            </Radio.Content>
                          </Radio>
                        ))}
                      </RadioGroup>
                    )}

                    {isLastStep ? (
                      <div className="space-y-1 rounded-xl border border-border/30 bg-background/40 p-2.5">
                        <p className="text-[12px] font-medium text-foreground/80">
                          Additional context
                        </p>
                        <TextArea.Root
                          className="min-h-20"
                          fullWidth
                          name="additional-context"
                          onChange={(event) =>
                            setResponse(event.currentTarget.value)
                          }
                          onKeyDown={handleKeyDown}
                          placeholder="Optional context, constraints, or notes"
                          value={response}
                          variant="secondary"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border/30 pt-2">
                    <span className="text-[11px] text-foreground/40">
                      {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+Enter
                      submits on the final step
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        isDisabled={currentStep === 0}
                        onPress={() =>
                          setCurrentStep((step) => Math.max(0, step - 1))
                        }
                        size="sm"
                        variant="ghost"
                      >
                        Back
                      </Button>
                      {isLastStep ? (
                        <Button
                          isDisabled={!structuredResponse.trim()}
                          onPress={handleSubmit}
                          size="sm"
                        >
                          Submit
                        </Button>
                      ) : (
                        <Button
                          isDisabled={!canMoveForward}
                          onPress={() =>
                            setCurrentStep((step) =>
                              Math.min(questionCount - 1, step + 1),
                            )
                          }
                          size="sm"
                        >
                          Continue
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-[12px] text-foreground/70">
              {promptText}
            </p>
          )}
          {userInput?.type !== "questions" ? (
            <>
              <textarea
                className="min-h-[60px] w-full resize-y rounded-md border border-border/50 bg-background px-3 py-2 text-[12px] text-foreground outline-none focus:border-primary/50"
                placeholder="Type your response..."
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-foreground/30">
                  {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+Enter to
                  submit
                </span>
                <button
                  className="h-7 rounded-md bg-primary px-3 text-[11px] text-primary-foreground disabled:opacity-50"
                  disabled={!structuredResponse.trim()}
                  onClick={handleSubmit}
                  type="button"
                >
                  Submit
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </ToolLayout>
  );
});
