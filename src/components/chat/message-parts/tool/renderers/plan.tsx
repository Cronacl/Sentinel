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
  Spinner,
} from "@heroui/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Loading02Icon,
  TimeQuarterPassIcon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { getPlanAudienceLabel, getTaskStatusLabel } from "@/lib/plan";

import type { RendererProps } from "../renderer";
import { PlanSidebar } from "@/components/chat/plan-sidebar";
import {
  getPlanSidebarState,
  setPlanSidebarState,
  syncPlanSidebarDraft,
} from "@/components/chat/plan-sidebar-store";

import {
  getPlanDraft,
  getPlanToolName,
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

function getStatusChipClass(tone: "danger" | "muted" | "success") {
  switch (tone) {
    case "success":
      return "border-success/5 bg-success/10 text-success";
    case "danger":
      return "border-danger/20 bg-danger-soft text-danger-soft-foreground";
    default:
      return "border-border/60 bg-background/70 text-muted";
  }
}

function getTaskStatusIcon(
  status: NonNullable<ManageTaskOutput["task"]>["status"],
) {
  if (status === "completed") return CheckmarkCircle02Icon;
  if (status === "in_progress") return Loading02Icon;
  if (status === "blocked") return Cancel01Icon;
  return TimeQuarterPassIcon;
}

function getTaskStatusChipClass(
  status: NonNullable<ManageTaskOutput["task"]>["status"],
) {
  if (status === "completed")
    return "border-success/10 bg-success/10 text-success";
  if (status === "in_progress")
    return "border-accent/10 bg-accent/10 text-accent";
  if (status === "blocked")
    return "border-danger/15 bg-danger-soft text-danger-soft-foreground";
  return "border-border/50 bg-background/60 text-muted";
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

function getToolLabel(toolName: PlanToolName) {
  switch (toolName) {
    case "create_plan":
      return "Plan";
    case "update_plan":
      return "Plan";
    case "manage_task":
      return "Task updated";
    default:
      return "Clarification";
  }
}

function buildSummary(
  toolName: PlanToolName,
  output?: unknown,
  draft?: PlanDocumentDraft | null,
) {
  if (toolName === "create_plan" && (output || draft)) {
    const value = (output as CreatePlanOutput | undefined) ?? draft!;
    const taskCount =
      typeof (value as CreatePlanOutput | PlanDocumentDraft).taskCount ===
      "number"
        ? (value as CreatePlanOutput | PlanDocumentDraft).taskCount
        : 0;
    return `${value.title} · ${getPlanAudienceLabel(value.audience)} · ${taskCount} task${taskCount === 1 ? "" : "s"}`;
  }
  if (toolName === "update_plan" && (output || draft)) {
    const value = (output as UpdatePlanOutput | undefined) ?? draft!;
    return `${value.title} · ${getPlanAudienceLabel(value.audience)}`;
  }
  if (toolName === "manage_task" && output) {
    const value = output as ManageTaskOutput;
    if (!value.task) {
      return value.action === "delete" ? "Removed task" : "Updated task";
    }
    return `${value.task.title} · ${getTaskStatusLabel(value.task.status)}`;
  }
  if (toolName === "ask_question" && output) {
    const value = output as AskQuestionOutput;
    if (value.status === "answered") {
      return `${value.answers?.length ?? value.questions.length}/${value.questions.length} answered`;
    }
    return `${value.questions.length} question${value.questions.length === 1 ? "" : "s"}`;
  }
  if (draft && (toolName === "create_plan" || toolName === "update_plan")) {
    return `${draft.title} · ${getPlanAudienceLabel(draft.audience)}`;
  }
  return toolName === "ask_question" ? "Waiting for input" : "Processing…";
}

function AnsweredQuestions({ output }: { output: AskQuestionOutput }) {
  return (
    <div className="space-y-1.5">
      {output.questions.map((question, index) => {
        const answer = output.answers?.find(
          (candidate) => candidate.questionId === question.id,
        );
        return (
          <div
            className="rounded-xl border border-border/20 bg-background/50 px-2.5 py-2"
            key={question.id}
          >
            <div className="flex items-center gap-1.5">
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-success-soft text-[8px] font-medium text-success">
                {index + 1}
              </span>
              <span className="text-[10px] text-muted">{question.header}</span>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-foreground">
              {question.question}
            </p>
            <div className="mt-1 flex items-start gap-1.5">
              <HugeiconsIcon
                className="mt-px shrink-0 text-success"
                color="currentColor"
                icon={Tick01Icon}
                size={10}
                strokeWidth={2}
              />
              <p className="text-[10px] text-foreground/80">
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
      <div className="rounded-2xl border border-border/60 bg-surface/20 px-3 py-1.5">
        <div className="mb-1.5 flex items-center gap-2">
          <p className="text-[12px] font-medium text-foreground">
            Clarification captured
          </p>
          <div className="flex items-center gap-1 rounded-full border border-success/5 bg-success/10 px-1.5 py-0.5 text-[10px] text-success">
            <span className="truncate">Done</span>
          </div>
        </div>
        <AnsweredQuestions output={output} />
      </div>
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
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface/20">
      <div className="border-b border-border/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-medium text-foreground">
            Clarification
          </p>
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-1.5 py-0.5 text-[10px] text-muted">
            <Spinner className="h-3 w-3" size="sm" />
            <span className="truncate">Waiting</span>
          </div>
          <span className="text-[10px] text-muted">
            {output.questions.length} question
            {output.questions.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-1.5 text-xs font-medium text-foreground">
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

function renderManageTask(output: ManageTaskOutput) {
  const actionLabel =
    output.action === "create"
      ? "Created"
      : output.action === "delete"
        ? "Removed"
        : "Updated";

  if (!output.task) {
    return (
      <div className="px-3.5 py-3">
        <p className="text-[11px] text-muted">
          {actionLabel} task successfully.
        </p>
      </div>
    );
  }

  const StatusIcon = getTaskStatusIcon(output.task.status);

  return (
    <div className="px-3.5 py-3">
      <div className="flex items-start gap-2">
        <HugeiconsIcon
          className={`mt-px shrink-0 ${
            output.task.status === "completed"
              ? "text-success"
              : output.task.status === "in_progress"
                ? "text-accent"
                : output.task.status === "blocked"
                  ? "text-danger"
                  : "text-muted/60"
          }`}
          color="currentColor"
          icon={StatusIcon}
          size={12}
          strokeWidth={1.5}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-foreground">
              {output.task.title}
            </span>
            <span
              className={`rounded-full border px-1.5 py-px text-[9px] ${getTaskStatusChipClass(output.task.status)}`}
            >
              {actionLabel} · {getTaskStatusLabel(output.task.status)}
            </span>
          </div>
          {output.task.description ? (
            <p className="mt-0.5 text-[10px] text-muted">
              {output.task.description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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
  const planDraft = useMemo(
    () => getPlanDraft(toolName, part),
    [part, toolName],
  );
  const isPlanDoc = toolName === "create_plan" || toolName === "update_plan";

  const syncPlanSidebar = useCallback(() => {
    if (!toolName || !planDraft) {
      return;
    }

    setPlanSidebarState({
      kind: "draft",
      snapshot: {
        audience: planDraft.audience,
        document: planDraft.document,
        goal: planDraft.goal,
        isStreaming: planDraft.isStreaming,
        statusLabel:
          part.state === "output-available"
            ? toolName === "create_plan"
              ? "Created"
              : "Updated"
            : "Drafting",
        summary: planDraft.summary,
        taskCount: planDraft.taskCount,
        tasks: planDraft.tasks,
        title: planDraft.title,
      },
      sourceKey: part.toolCallId,
    });
  }, [part.state, part.toolCallId, planDraft, toolName]);

  const handleOpenSidebar = useCallback(() => {
    if (!planDraft) {
      return;
    }

    syncPlanSidebar();
    open(<PlanSidebar />);
  }, [open, planDraft, syncPlanSidebar]);

  useEffect(() => {
    if (!isOpen || !planDraft || !isPlanDoc) {
      return;
    }

    const currentSidebar = getPlanSidebarState();
    if (currentSidebar.kind !== "draft") {
      return;
    }

    if (currentSidebar.sourceKey !== part.toolCallId) {
      return;
    }

    syncPlanSidebarDraft({
      snapshot: {
        audience: planDraft.audience,
        document: planDraft.document,
        goal: planDraft.goal,
        isStreaming: planDraft.isStreaming,
        statusLabel:
          part.state === "output-available"
            ? toolName === "create_plan"
              ? "Created"
              : "Updated"
            : "Drafting",
        summary: planDraft.summary,
        taskCount: planDraft.taskCount,
        tasks: planDraft.tasks,
        title: planDraft.title,
      },
      sourceKey: part.toolCallId,
    });
  }, [isOpen, isPlanDoc, part.state, part.toolCallId, planDraft, toolName]);

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
    } else if (!shouldAutoExpand && autoExpandedRef.current === part.toolCallId) {
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

  const hasExpandableBody = !isPlanDoc;

  const cardHeader = (
    <div className="flex items-center gap-2">
      <p className="shrink-0 text-[12px] font-medium text-foreground">
        {getToolLabel(toolName)}
      </p>
      <div
        className={`shrink-0 flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${getStatusChipClass(status.tone)}`}
      >
        {(status.label === "Running" ||
          status.label === "Drafting" ||
          status.label === "Waiting") && (
          <Spinner className="h-3 w-3" size="sm" />
        )}
        <span className="truncate">{status.label}</span>
      </div>
      <p className="min-w-0 flex-1 truncate text-[11px] text-foreground/72">
        {buildSummary(toolName, output, planDraft)}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        {isPlanDoc &&
        part.state === "output-available" &&
        onStartPlanImplementation ? (
          <Button
            className="h-auto min-w-0 px-2 py-0.5 bg-background text-[10px] text-foreground transition-colors hover:text-foreground"
            onPress={onStartPlanImplementation}
            size="sm"
            type="button"
            variant="tertiary"
          >
            Start
          </Button>
        ) : null}
        {planDraft ? (
          <Button
            className="h-auto min-w-0 px-2 py-0.5 bg-background text-[10px] text-foreground transition-colors hover:text-foreground"
            onPress={handleOpenSidebar}
            size="sm"
            type="button"
            variant="tertiary"
          >
            Open
          </Button>
        ) : null}
        {hasExpandableBody && isFinishedState ? (
          <Button
            className="h-auto min-w-0 px-2 py-0.5 bg-background text-[10px] text-foreground transition-colors hover:text-foreground"
            onPress={() => setIsExpanded((prev) => !prev)}
            size="sm"
            type="button"
            variant="tertiary"
          >
            {isExpanded ? "Hide" : "Show"}
          </Button>
        ) : null}
      </div>
    </div>
  );

  const cardError =
    errorText && part.state !== "output-error" ? (
      <div className="mt-2 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
        {errorText}
      </div>
    ) : null;

  if (!hasExpandableBody) {
    return (
      <div className="rounded-2xl border border-border/60 bg-surface/20 px-3 py-1.5">
        {cardHeader}
        {cardError}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-surface/20 px-3 py-1.5">
      {cardHeader}

      {isExpanded && (
        <div className="mt-1.5 overflow-hidden rounded-2xl border border-border/20 bg-surface">
          <div className="border-b border-border/50 px-3.5 py-1.5 text-[9px] text-foreground">
            {getToolLabel(toolName)}
          </div>
          {part.state === "output-error" ? (
            <div className="px-3.5 py-2">
              <p className="text-[11px] text-danger-soft-foreground">
                {errorText ?? "Planning action failed."}
              </p>
            </div>
          ) : toolName === "manage_task" && output ? (
            renderManageTask(output as ManageTaskOutput)
          ) : toolName === "ask_question" && output ? (
            <div className="px-3.5 py-2">
              <AnsweredQuestions output={output as AskQuestionOutput} />
            </div>
          ) : (
            <div className="px-3.5 py-2">
              <p className="text-[11px] text-muted">Processing…</p>
            </div>
          )}
        </div>
      )}

      {cardError}
    </div>
  );
});
