"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Description,
  Label,
  Radio,
  RadioGroup,
} from "@heroui/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { TaskStatusIcon } from "@/components/chat/task-status-icon";
import { useRightSidebar } from "@/components/shell/shell-context";
import { getPlanAudienceLabel, getTaskStatusLabel } from "@/lib/plan";

import type { RendererProps } from "../../renderer";
import { PlanSidebar } from "@/components/chat/plan-sidebar";
import {
  getPlanSidebarState,
  setPlanSidebarState,
  syncPlanSidebarDraft,
} from "@/components/chat/plan-sidebar-store";

import { ToolLayout } from "../shared/tool-layout";
import {
  getPlanToolName,
  useStablePlanDraft,
  type PlanDocumentDraft,
  type PlanToolName,
} from "./plan-utils";

type PlanDocumentOutput = {
  audience: "general" | "technical";
  document: string;
  goal: string;
  planId: string;
  summary: string;
  title: string;
};

type CreatePlanOutput = PlanDocumentOutput & {
  status: "created" | "updated";
  taskCount: number;
};

type UpdatePlanOutput = PlanDocumentOutput;

type ManageTaskOutput = {
  action: "create" | "delete" | "update";
  planId: string;
  task: {
    description: string | null;
    id: string;
    status: "blocked" | "completed" | "in_progress" | "pending";
    title: string;
  } | null;
};

type AskQuestionOutput = {
  answers: Array<{
    answer: string;
    optionLabel?: string | null;
    questionId: string;
  }> | null;
  questionSetId: string;
  questions: Array<{
    allowMultiple?: boolean;
    header: string;
    id: string;
    options: Array<{
      description: string;
      label: string;
    }>;
    question: string;
  }>;
  status: "answered" | "pending";
};

function getTaskStatusTextClass(
  status: NonNullable<ManageTaskOutput["task"]>["status"],
) {
  if (status === "completed") return "text-success";
  if (status === "in_progress") return "text-accent";
  if (status === "blocked") return "text-danger";
  return "text-foreground/40";
}

function getPlanStatus(
  part: RendererProps["part"],
  toolName: PlanToolName,
  output?: unknown,
) {
  if (
    toolName === "ask_question" &&
    part.state === "output-available" &&
    output &&
    (output as AskQuestionOutput).status === "pending"
  ) {
    return { label: "Waiting", tone: "muted" as const };
  }
  if (part.state === "output-denied") {
    return { label: "Denied", tone: "danger" as const };
  }
  if (part.state === "output-error") {
    return { label: "Failed", tone: "danger" as const };
  }
  if (part.state === "output-available") {
    return { label: "Done", tone: "success" as const };
  }
  if (toolName === "create_plan" || toolName === "update_plan") {
    return { label: "Drafting", tone: "muted" as const };
  }
  return { label: "Running", tone: "muted" as const };
}

function buildAskQuestionSummary(output?: unknown): string {
  if (!output) return "Waiting for input";
  const value = output as AskQuestionOutput;
  if (value.status === "answered") {
    return `${value.answers?.length ?? value.questions.length}/${value.questions.length} answered`;
  }
  return `${value.questions.length} question${value.questions.length === 1 ? "" : "s"}`;
}

function AnsweredQuestions({ output }: { output: AskQuestionOutput }) {
  return (
    <div className="space-y-1">
      {output.questions.map((question, index) => {
        const answer = output.answers?.find(
          (candidate) => candidate.questionId === question.id,
        );
        return (
          <div className="flex items-start gap-2 py-0.5" key={question.id}>
            <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-success-soft text-[8px] font-medium text-success">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-foreground/70">
                {question.question}
              </p>
              <p className="mt-0.5 text-[10px] text-foreground/50">
                {answer?.answer ?? "No answer recorded."}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CUSTOM_OPTION_KEY = "__custom__";

function QuestionBody({
  onAnswerPlanQuestions,
  output,
}: {
  onAnswerPlanQuestions?: RendererProps["onAnswerPlanQuestions"];
  output: AskQuestionOutput;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [singleSelections, setSingleSelections] = useState<
    Record<string, string>
  >({});
  const [multiSelections, setMultiSelections] = useState<
    Record<string, string[]>
  >({});
  const [freeformAnswers, setFreeformAnswers] = useState<
    Record<string, string>
  >({});

  const currentQuestion = output.questions[currentIndex];
  const isMulti = currentQuestion?.allowMultiple === true;

  const singleValue = currentQuestion
    ? freeformAnswers[currentQuestion.id]?.trim()
      ? CUSTOM_OPTION_KEY
      : (singleSelections[currentQuestion.id] ?? "")
    : "";

  const multiValue = currentQuestion
    ? (multiSelections[currentQuestion.id] ?? [])
    : [];

  const isCustomActive = isMulti
    ? multiValue.includes(CUSTOM_OPTION_KEY)
    : singleValue === CUSTOM_OPTION_KEY;

  const currentAnswer = currentQuestion
    ? (() => {
        const freeform = freeformAnswers[currentQuestion.id]?.trim() ?? "";
        if (isMulti) {
          const labels = multiValue.filter((v) => v !== CUSTOM_OPTION_KEY);
          return [...labels, ...(freeform ? [freeform] : [])].join(", ");
        }
        const sel = singleSelections[currentQuestion.id] ?? "";
        return freeform || (sel !== CUSTOM_OPTION_KEY ? sel : "");
      })()
    : "";

  const answers = useMemo(
    () =>
      output.answers ??
      output.questions.flatMap((question) => {
        const freeform = freeformAnswers[question.id]?.trim();
        if (question.allowMultiple) {
          const selected = (multiSelections[question.id] ?? []).filter(
            (v) => v !== CUSTOM_OPTION_KEY,
          );
          const parts = [...selected, ...(freeform ? [freeform] : [])];
          if (parts.length === 0) return [];
          return [
            {
              answer: parts.join(", "),
              optionLabel: null,
              questionId: question.id,
            },
          ];
        }
        const selected = singleSelections[question.id];
        const answerText =
          freeform ||
          (selected && selected !== CUSTOM_OPTION_KEY ? selected : "");
        if (!answerText) return [];
        return [
          {
            answer: answerText,
            optionLabel: freeform ? null : (selected ?? null),
            questionId: question.id,
          },
        ];
      }),
    [
      freeformAnswers,
      multiSelections,
      output.answers,
      output.questions,
      singleSelections,
    ],
  );

  useEffect(() => {
    setCurrentIndex(0);
  }, [output.questionSetId]);

  if (output.status === "answered" && output.answers) {
    return (
      <ToolLayout
        summary={
          <>
            Clarification
            <span className="ml-1.5 text-[11px] text-foreground/40">
              {output.answers.length}/{output.questions.length} answered
            </span>
          </>
        }
        isExpanded={false}
        onExpandedChange={() => {}}
        isExpandable
      >
        <AnsweredQuestions output={output} />
      </ToolLayout>
    );
  }

  if (!currentQuestion) {
    return <p className="text-xs text-muted">No questions available.</p>;
  }

  const isLastStep = currentIndex === output.questions.length - 1;
  const canAdvance = currentAnswer.trim().length > 0;
  const canSubmit =
    answers.length === output.questions.length &&
    answers.every((answer) => answer.answer.trim().length > 0);

  const optionClass =
    "w-full cursor-pointer my-0.5 items-start gap-1.5 rounded-lg px-1.5 py-1 transition-colors data-selected:bg-surface";
  const controlClass = "size-3 shrink-0";

  return (
    <div className="overflow-hidden rounded-xl border border-border/40 bg-surface/20">
      <div className="border-b border-border/30 px-3 py-2">
        <p className="text-[13px] sentinel-thinking-shimmer">
          Clarification
          <span className="ml-1.5 text-[11px]">
            {output.questions.length} question
            {output.questions.length === 1 ? "" : "s"}
          </span>
        </p>
        <p className="mt-1.5 text-[13px] font-medium text-foreground">
          {currentQuestion.question}
        </p>
      </div>

      <div className="p-1">
        {isMulti ? (
          <CheckboxGroup
            className="gap-0 p-0"
            value={multiValue}
            onChange={(values) => {
              setMultiSelections((current) => ({
                ...current,
                [currentQuestion.id]: values,
              }));
              if (!values.includes(CUSTOM_OPTION_KEY)) {
                setFreeformAnswers((current) => ({
                  ...current,
                  [currentQuestion.id]: "",
                }));
              }
            }}
          >
            {currentQuestion.options.map((option) => (
              <Checkbox
                className={optionClass}
                key={option.label}
                value={option.label}
              >
                <Checkbox.Control className={controlClass}>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Content className="min-w-0 gap-0">
                  <Label className="cursor-pointer text-[12px]">
                    {option.label}
                  </Label>
                  {option.description ? (
                    <Description className="text-[11px]">
                      {option.description}
                    </Description>
                  ) : null}
                </Checkbox.Content>
              </Checkbox>
            ))}

            <Checkbox className={optionClass} value={CUSTOM_OPTION_KEY}>
              <Checkbox.Control className={controlClass}>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content className="min-w-0 gap-0">
                <Label className="cursor-pointer text-[12px]">
                  Custom answer
                </Label>
              </Checkbox.Content>
            </Checkbox>
          </CheckboxGroup>
        ) : (
          <RadioGroup
            className="gap-0 p-1"
            value={singleValue}
            onChange={(value) => {
              if (value === CUSTOM_OPTION_KEY) {
                setSingleSelections((current) => ({
                  ...current,
                  [currentQuestion.id]: CUSTOM_OPTION_KEY,
                }));
              } else {
                setSingleSelections((current) => ({
                  ...current,
                  [currentQuestion.id]: value,
                }));
                setFreeformAnswers((current) => ({
                  ...current,
                  [currentQuestion.id]: "",
                }));
              }
            }}
          >
            {currentQuestion.options.map((option) => (
              <Radio
                className={optionClass}
                key={option.label}
                value={option.label}
              >
                <Radio.Control className={controlClass}>
                  <Radio.Indicator />
                </Radio.Control>
                <Radio.Content className="min-w-0 gap-0">
                  <Label className="cursor-pointer text-[12px]">
                    {option.label}
                  </Label>
                  {option.description ? (
                    <Description className="text-[11px]">
                      {option.description}
                    </Description>
                  ) : null}
                </Radio.Content>
              </Radio>
            ))}

            <Radio className={optionClass} value={CUSTOM_OPTION_KEY}>
              <Radio.Control className={controlClass}>
                <Radio.Indicator />
              </Radio.Control>
              <Radio.Content className="min-w-0 gap-0">
                <Label className="cursor-pointer text-[12px]">
                  Custom answer
                </Label>
              </Radio.Content>
            </Radio>
          </RadioGroup>
        )}

        {isCustomActive ? (
          <div className="mt-0.5 pl-5">
            <input
              autoFocus
              className="w-full bg-transparent py-0.5 text-xs text-foreground outline-none placeholder:text-muted"
              onChange={(event) =>
                setFreeformAnswers((current) => ({
                  ...current,
                  [currentQuestion.id]: event.target.value,
                }))
              }
              placeholder="Type your answer..."
              value={freeformAnswers[currentQuestion.id] ?? ""}
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/30 px-3 py-1.5">
        <div className="flex items-center gap-1 text-[10px] text-muted">
          <Button
            className="h-6 w-6 min-w-0 rounded-full"
            isDisabled={currentIndex === 0}
            isIconOnly
            onPress={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowLeft01Icon}
              size={12}
              strokeWidth={1.5}
            />
          </Button>
          <span>
            {currentIndex + 1} of {output.questions.length}
          </span>
          <Button
            className="h-6 w-6 min-w-0 rounded-full"
            isDisabled={currentIndex === output.questions.length - 1}
            isIconOnly
            onPress={() =>
              setCurrentIndex((index) =>
                Math.min(output.questions.length - 1, index + 1),
              )
            }
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowRight01Icon}
              size={12}
              strokeWidth={1.5}
            />
          </Button>
        </div>

        {isLastStep ? (
          <Button
            className="h-7 min-w-0 rounded-full px-4 text-[11px]"
            isDisabled={!canSubmit || !onAnswerPlanQuestions}
            onPress={() =>
              onAnswerPlanQuestions?.({
                answers,
                questionSetId: output.questionSetId,
              })
            }
            size="sm"
          >
            Submit
          </Button>
        ) : (
          <Button
            className="h-7 min-w-0 rounded-full px-4 text-[11px]"
            isDisabled={!canAdvance}
            onPress={() =>
              setCurrentIndex((index) =>
                Math.min(output.questions.length - 1, index + 1),
              )
            }
            size="sm"
            variant="secondary"
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

function ManageTaskInline({
  isRunning,
  output,
}: {
  isRunning: boolean;
  output?: ManageTaskOutput;
}) {
  if (!output) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <TaskStatusIcon
          className="shrink-0 text-foreground/30"
          status="pending"
        />
        <span
          className={`text-[13px] ${isRunning ? "sentinel-thinking-shimmer" : "text-foreground/50"}`}
        >
          Updating task…
        </span>
      </div>
    );
  }

  const actionLabel =
    output.action === "create"
      ? "Created"
      : output.action === "delete"
        ? "Removed"
        : "Updated";

  if (!output.task) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <TaskStatusIcon
          className="shrink-0 text-foreground/30"
          status="completed"
        />
        <span className="text-[13px] text-foreground/50">
          {actionLabel} task
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-0.5">
      <TaskStatusIcon
        className={`shrink-0 ${getTaskStatusTextClass(output.task.status)}`}
        status={output.task.status}
      />
      <span className="min-w-0 truncate text-[13px] text-foreground/70">
        {output.task.title}
      </span>
      <span
        className={`shrink-0 text-[11px] ${getTaskStatusTextClass(output.task.status)}`}
      >
        {getTaskStatusLabel(output.task.status)}
      </span>
    </div>
  );
}

const PlanDocCard = memo(function PlanDocCard({
  draft,
  handleOpenSidebar,
  isRunning,
  onStartPlanImplementation,
  part,
  toolName,
}: {
  draft: PlanDocumentDraft | null;
  handleOpenSidebar: () => void;
  isRunning: boolean;
  onStartPlanImplementation?: () => void;
  part: RendererProps["part"];
  toolName: PlanToolName;
}) {
  const output = "output" in part ? part.output : undefined;
  const errorText = "errorText" in part ? part.errorText : undefined;
  const value =
    (output as CreatePlanOutput | UpdatePlanOutput | undefined) ?? draft;

  if (!value) {
    return (
      <p
        className={`text-[13px] ${isRunning ? "sentinel-thinking-shimmer" : "text-foreground/70"}`}
      >
        {toolName === "create_plan" ? "Drafting" : "Updating"} plan…
      </p>
    );
  }

  const taskCount =
    "taskCount" in value && typeof value.taskCount === "number"
      ? value.taskCount
      : (draft?.tasks?.length ?? 0);
  const tasks = draft?.tasks ?? [];
  const isError =
    part.state === "output-error" || part.state === "output-denied";
  const isDone = part.state === "output-available";

  return (
    <div className="overflow-hidden rounded-xl border border-border/40 bg-surface/20">
      <div className="px-3.5 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={`text-[13px] font-medium ${isRunning ? "sentinel-thinking-shimmer" : "text-foreground"}`}
            >
              {value.title || "Untitled plan"}
            </p>
            {value.summary ? (
              <p className="mt-1 line-clamp-2 text-[11px] text-foreground/50">
                {value.summary}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px] text-foreground/40">
          <span>{getPlanAudienceLabel(value.audience)}</span>
          {taskCount > 0 ? (
            <>
              <span>·</span>
              <span>
                {taskCount} task{taskCount === 1 ? "" : "s"}
              </span>
            </>
          ) : null}
          {isDone ? (
            <>
              <span>·</span>
              <span className="text-success">
                {toolName === "create_plan" ? "Created" : "Updated"}
              </span>
            </>
          ) : null}
          {isError ? (
            <>
              <span>·</span>
              <span className="text-danger">
                {part.state === "output-denied" ? "Denied" : "Failed"}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-end w-full gap-1.5 border-t border-border/30 px-3.5 py-1.5">
        <Button
          className="h-6 min-w-0 px-2.5 text-[10px]"
          onPress={handleOpenSidebar}
          size="sm"
          variant="outline"
        >
          Open
        </Button>
        {isDone && onStartPlanImplementation ? (
          <Button
            className="h-6 min-w-0 px-2.5 text-[10px]"
            onPress={onStartPlanImplementation}
            size="sm"
            variant="primary"
          >
            Start
          </Button>
        ) : null}
      </div>

      {errorText && part.state === "output-error" ? (
        <div className="border-t border-danger/10 px-3.5 py-1.5 text-[11px] text-danger">
          {errorText}
        </div>
      ) : null}
    </div>
  );
});

export const PlanTool = memo(function PlanTool({
  onAnswerPlanQuestions,
  onStartPlanImplementation,
  part,
}: RendererProps) {
  const { isOpen, open } = useRightSidebar();
  const toolName = getPlanToolName(part);
  const [isExpanded, setIsExpanded] = useState(false);
  const output = "output" in part ? part.output : undefined;
  const errorText = "errorText" in part ? part.errorText : undefined;
  const planDraft = useStablePlanDraft(toolName, part);
  const isPlanDoc = toolName === "create_plan" || toolName === "update_plan";

  const statusLabel =
    part.state === "output-available"
      ? toolName === "create_plan"
        ? "Created"
        : "Updated"
      : "Drafting";

  const buildSidebarSnapshot = useCallback(() => {
    if (!planDraft) return null;
    return {
      audience: planDraft.audience,
      document: planDraft.document,
      goal: planDraft.goal,
      isStreaming: planDraft.isStreaming,
      statusLabel,
      summary: planDraft.summary,
      taskCount: planDraft.taskCount,
      tasks: planDraft.tasks,
      title: planDraft.title,
    };
  }, [planDraft, statusLabel]);

  const syncPlanSidebar = useCallback(() => {
    if (!toolName) return;
    const snapshot = buildSidebarSnapshot();
    if (!snapshot) return;
    setPlanSidebarState({
      kind: "draft",
      snapshot,
      sourceKey: part.toolCallId,
    });
  }, [buildSidebarSnapshot, part.toolCallId, toolName]);

  const handleOpenSidebar = useCallback(() => {
    if (!planDraft) return;
    syncPlanSidebar();
    open(<PlanSidebar />);
  }, [open, planDraft, syncPlanSidebar]);

  useEffect(() => {
    if (!isOpen || !planDraft || !isPlanDoc) return;

    const currentSidebar = getPlanSidebarState();
    if (
      currentSidebar.kind !== "draft" ||
      currentSidebar.sourceKey !== part.toolCallId
    ) {
      return;
    }

    const snapshot = buildSidebarSnapshot();
    if (!snapshot) return;
    syncPlanSidebarDraft({ snapshot, sourceKey: part.toolCallId });
  }, [buildSidebarSnapshot, isOpen, isPlanDoc, part.toolCallId, planDraft]);

  const autoExpandedRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPlanDoc) {
      return;
    }

    const shouldAutoExpand = Boolean(
      part.state === "output-error" ||
      (toolName === "ask_question" &&
        part.state === "output-available" &&
        output &&
        (output as AskQuestionOutput).status === "pending"),
    );

    if (shouldAutoExpand && autoExpandedRef.current !== part.toolCallId) {
      autoExpandedRef.current = part.toolCallId;
      setIsExpanded(true);
    } else if (
      !shouldAutoExpand &&
      autoExpandedRef.current === part.toolCallId
    ) {
      autoExpandedRef.current = null;
      setIsExpanded(false);
    }
  }, [isPlanDoc, output, part.state, part.toolCallId, toolName]);

  if (!toolName) return null;

  const status = getPlanStatus(part, toolName, output);
  const isFinishedState =
    part.state === "output-error" ||
    part.state === "output-denied" ||
    part.state === "output-available";
  const isAskQuestionPending =
    toolName === "ask_question" &&
    part.state === "output-available" &&
    output &&
    (output as AskQuestionOutput).status === "pending";

  if (isAskQuestionPending) {
    return (
      <QuestionBody
        onAnswerPlanQuestions={onAnswerPlanQuestions}
        output={output as AskQuestionOutput}
      />
    );
  }

  const isRunning =
    status.label === "Running" ||
    status.label === "Drafting" ||
    status.label === "Waiting";

  if (isPlanDoc) {
    return (
      <PlanDocCard
        draft={planDraft}
        handleOpenSidebar={handleOpenSidebar}
        isRunning={isRunning}
        onStartPlanImplementation={onStartPlanImplementation}
        part={part}
        toolName={toolName}
      />
    );
  }

  if (toolName === "manage_task") {
    if (part.state === "output-error" || part.state === "output-denied") {
      return (
        <div className="flex items-center gap-2 py-0.5">
          <HugeiconsIcon
            className="shrink-0 text-danger"
            color="currentColor"
            icon={Cancel01Icon}
            size={14}
            strokeWidth={1.5}
          />
          <span className="text-[13px] text-danger">
            {errorText ?? "Task operation failed"}
          </span>
        </div>
      );
    }
    return (
      <ManageTaskInline
        isRunning={isRunning}
        output={output as ManageTaskOutput | undefined}
      />
    );
  }

  if (toolName === "ask_question") {
    const questionSummary = buildAskQuestionSummary(output);
    return (
      <ToolLayout
        summary={
          <>
            Clarification
            <span className="ml-1.5 text-[11px] text-foreground/40">
              {questionSummary}
            </span>
          </>
        }
        isRunning={isRunning}
        isError={status.tone === "danger"}
        isExpandable={isFinishedState}
        isExpanded={isExpanded}
        onExpandedChange={setIsExpanded}
        errorText={
          errorText && part.state !== "output-error" ? errorText : undefined
        }
      >
        {part.state === "output-error" ? (
          <p className="text-[11px] text-danger">
            {errorText ?? "Clarification failed."}
          </p>
        ) : output ? (
          <AnsweredQuestions output={output as AskQuestionOutput} />
        ) : null}
      </ToolLayout>
    );
  }

  return null;
});
