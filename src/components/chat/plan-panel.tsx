"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { useMemo, useState } from "react";
import { Button, Card, ScrollShadow } from "@heroui/react";
import {
  AiIdeaIcon,
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Loading02Icon,
  TimeQuarterPassIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useRightSidebar } from "@/components/shell/shell-context";
import {
  getPlanAudienceLabel,
  getTaskStatusLabel,
  type ThreadPlanAudience,
} from "@/lib/plan";
import { api } from "@/trpc/react";

import { MarkdownContent } from "./message-parts/text";
import { PlanSidebar } from "./plan-sidebar";
import { setPlanSidebarState } from "./plan-sidebar-store";

function formatRelativeTime(value: Date) {
  const diffMs = Math.abs(Date.now() - value.getTime());
  if (diffMs < 30_000) {
    return "now";
  }

  return formatDistanceToNowStrict(value, { addSuffix: true });
}

function getStatusDot(status: string) {
  if (status === "completed") return "bg-success";
  if (status === "in_progress") return "bg-accent";
  if (status === "blocked") return "bg-danger";
  return "bg-muted/50";
}

function getStatusChipClass(status: string) {
  if (status === "completed")
    return "border-success/10 bg-success/10 text-success";
  if (status === "in_progress")
    return "border-accent/10 bg-accent/10 text-accent";
  if (status === "blocked")
    return "border-danger/15 bg-danger-soft text-danger-soft-foreground";
  return "border-border/60 bg-background/70 text-muted";
}

function getStatusIcon(status: string) {
  if (status === "completed") return CheckmarkCircle02Icon;
  if (status === "in_progress") return Loading02Icon;
  if (status === "blocked") return Cancel01Icon;
  return TimeQuarterPassIcon;
}

function getAudienceChipClass(audience: ThreadPlanAudience) {
  return audience === "general"
    ? "border-accent/15 bg-accent/10 text-accent"
    : "border-border/50 bg-background/60 text-foreground/80";
}

function AudienceChip({ audience }: { audience: ThreadPlanAudience }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getAudienceChipClass(audience)}`}
    >
      {getPlanAudienceLabel(audience)}
    </span>
  );
}

export function PlanPanel({ threadId }: { threadId: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { open } = useRightSidebar();
  const utils = api.useUtils();
  const plan = api.plan.get.useQuery({ threadId }, { staleTime: 0 });
  const updateTask = api.plan.updateTask.useMutation({
    onSuccess: () => {
      void utils.plan.get.invalidate({ threadId });
    },
  });
  const deleteTask = api.plan.deleteTask.useMutation({
    onSuccess: () => {
      void utils.plan.get.invalidate({ threadId });
    },
  });
  const currentPlan = plan.data?.plan ?? null;
  const pendingQuestionSet = plan.data?.pendingQuestionSet ?? null;
  const completedCount = currentPlan
    ? currentPlan.tasks.filter((task) => task.status === "completed").length
    : 0;
  const totalCount = currentPlan?.tasks.length ?? 0;
  const progressLabel =
    totalCount > 0 ? `${completedCount}/${totalCount} done` : "No tasks yet";
  const trimmedSummary = currentPlan?.summary.trim() ?? "";
  const summaryPreview =
    trimmedSummary.length > 140
      ? `${trimmedSummary.slice(0, 140).trimEnd()}…`
      : trimmedSummary;
  const taskActionButtons = useMemo(
    () =>
      [
        ["pending", "Pending"],
        ["in_progress", "Active"],
        ["completed", "Done"],
      ] as const,
    [],
  );
  const openSidebar = () => {
    setPlanSidebarState({
      kind: "thread",
      sourceKey: `thread:${threadId}`,
      threadId,
    });
    open(<PlanSidebar />);
  };

  if (plan.isPending && !plan.data) {
    return (
      <div className="rounded-2xl border border-border/40 bg-surface/30 px-4 py-3">
        <p className="text-xs text-muted">Loading plan…</p>
      </div>
    );
  }

  if (plan.error) {
    return (
      <div className="rounded-2xl border border-danger-soft-hover bg-danger-soft px-4 py-3">
        <p className="text-xs text-danger-soft-foreground">
          {plan.error.message}
        </p>
      </div>
    );
  }

  if (!plan.data?.plan) {
    return (
      <div className="rounded-2xl border border-border/40 bg-surface/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            className="text-muted"
            color="currentColor"
            icon={AiIdeaIcon}
            size={14}
            strokeWidth={1.5}
          />
          <p className="text-xs font-medium text-foreground">Plan</p>
        </div>
        <p className="mt-1 text-xs text-muted">
          No plan yet. Ask Sentinel to build one.
        </p>
      </div>
    );
  }

  const resolvedPlan = currentPlan!;

  return (
    <Card className="overflow-hidden border border-border/40 bg-surface/30 shadow-none">
      <button
        className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-default/20"
        onClick={() => setIsExpanded((value) => !value)}
        type="button"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10">
            <HugeiconsIcon
              className="text-accent"
              color="currentColor"
              icon={AiIdeaIcon}
              size={16}
              strokeWidth={1.5}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-muted">
                Plan
              </span>
              <AudienceChip audience={resolvedPlan.audience} />
              <span className="rounded-full border border-border/40 bg-background/60 px-2 py-0.5 text-[10px] text-muted">
                {progressLabel}
              </span>
              <span className="text-[10px] text-muted">
                Updated {formatRelativeTime(resolvedPlan.updatedAt)}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {resolvedPlan.title}
            </p>
            <p className="mt-1 text-xs text-muted">{summaryPreview}</p>
            {totalCount > 0 ? (
              <div className="mt-3 flex gap-1">
                {resolvedPlan.tasks.map((task) => (
                  <div
                    className={`h-1.5 flex-1 rounded-full ${getStatusDot(task.status)}`}
                    key={task.id}
                    title={`${task.title}: ${getTaskStatusLabel(task.status)}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <HugeiconsIcon
          className={`mt-1 shrink-0 text-muted transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          color="currentColor"
          icon={ArrowDown01Icon}
          size={16}
          strokeWidth={1.5}
        />
      </button>

      {isExpanded ? (
        <div className="border-t border-border/30 px-4 py-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/30 bg-background/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <AudienceChip audience={resolvedPlan.audience} />
                    <span className="rounded-full border border-border/40 bg-default/40 px-2 py-0.5 text-[10px] text-muted">
                      Goal
                    </span>
                  </div>
                  <Button
                    className="h-7 min-w-0 rounded-lg px-3 text-[11px]"
                    onPress={openSidebar}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Open sidebar
                  </Button>
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">
                  {resolvedPlan.goal}
                </p>
                <div className="mt-4 rounded-2xl border border-border/20 bg-surface/60 p-4">
                  <MarkdownContent text={resolvedPlan.document} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {pendingQuestionSet ? (
                <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon
                      className="text-accent"
                      color="currentColor"
                      icon={AiIdeaIcon}
                      size={14}
                      strokeWidth={1.5}
                    />
                    <span className="text-xs font-medium text-foreground">
                      Clarification pending
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted">
                    Sentinel is waiting on {pendingQuestionSet.questions.length}{" "}
                    question
                    {pendingQuestionSet.questions.length === 1 ? "" : "s"}{" "}
                    before finalizing the plan.
                  </p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-border/30 bg-background/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      Work breakdown
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {progressLabel}
                    </p>
                  </div>
                  {totalCount > 0 ? (
                    <span className="rounded-full border border-border/40 bg-default/40 px-2 py-0.5 text-[10px] text-muted">
                      {totalCount} task{totalCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>

                {totalCount > 0 ? (
                  <ScrollShadow className="mt-4 max-h-[420px] space-y-2">
                    {resolvedPlan.tasks.map((task) => {
                      const StatusIcon = getStatusIcon(task.status);
                      return (
                        <div
                          className="group rounded-2xl border border-border/20 bg-surface/60 p-3"
                          key={task.id}
                        >
                          <div className="flex items-start gap-3">
                            <HugeiconsIcon
                              className={`mt-0.5 shrink-0 ${
                                task.status === "completed"
                                  ? "text-success"
                                  : task.status === "in_progress"
                                    ? "text-accent"
                                    : task.status === "blocked"
                                      ? "text-danger"
                                      : "text-muted/60"
                              }`}
                              color="currentColor"
                              icon={StatusIcon}
                              size={14}
                              strokeWidth={1.5}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs font-medium text-foreground">
                                  {task.title}
                                </p>
                                <span
                                  className={`rounded-full border px-1.5 py-px text-[9px] ${getStatusChipClass(task.status)}`}
                                >
                                  {getTaskStatusLabel(task.status)}
                                </span>
                              </div>
                              {task.description ? (
                                <p className="mt-1 text-[11px] text-muted">
                                {task.description}
                              </p>
                              ) : null}
                              <div className="mt-3 flex flex-wrap items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                                {taskActionButtons.map(([status, label]) => (
                                  <Button
                                    className="h-6 min-w-0 rounded-md px-2 text-[10px]"
                                    key={status}
                                    onPress={() =>
                                      updateTask.mutate({
                                        status,
                                        taskId: task.id,
                                        threadId,
                                      })
                                    }
                                    size="sm"
                                    type="button"
                                    variant={
                                      task.status === status
                                        ? "secondary"
                                        : "ghost"
                                    }
                                  >
                                    {label}
                                  </Button>
                                ))}
                                <Button
                                  className="h-6 min-w-0 rounded-md px-2 text-[10px] text-danger"
                                  onPress={() =>
                                    deleteTask.mutate({
                                      taskId: task.id,
                                      threadId,
                                    })
                                  }
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </ScrollShadow>
                ) : (
                  <p className="mt-4 text-[11px] text-muted">
                    This plan does not have structured tasks yet. Sentinel can
                    add a work breakdown as the plan evolves.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
