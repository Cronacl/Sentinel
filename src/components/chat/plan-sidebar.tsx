"use client";

import type { ReactNode } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { useMemo } from "react";
import { CloseButton, ScrollShadow } from "@heroui/react";
import {
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Loading02Icon,
  TimeQuarterPassIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  getPlanAudienceLabel,
  getTaskStatusLabel,
  type ThreadPlanTaskStatus,
} from "@/lib/plan";
import { api } from "@/trpc/react";
import { useRightSidebar } from "@/components/shell/shell-context";

import { MarkdownContent } from "./message-parts/text";
import {
  closePlanSidebarState,
  usePlanSidebarState,
} from "./plan-sidebar-store";

function formatRelativeTime(value: Date) {
  const diffMs = Math.abs(Date.now() - value.getTime());
  if (diffMs < 30_000) return "now";
  return formatDistanceToNowStrict(value, { addSuffix: true });
}

function getTaskStatusIcon(status: ThreadPlanTaskStatus | undefined) {
  if (status === "completed") return CheckmarkCircle02Icon;
  if (status === "in_progress") return Loading02Icon;
  if (status === "blocked") return Cancel01Icon;
  return TimeQuarterPassIcon;
}

function getTaskStatusColor(status: ThreadPlanTaskStatus | undefined) {
  if (status === "completed") return "text-success";
  if (status === "in_progress") return "text-accent";
  if (status === "blocked") return "text-danger";
  return "text-foreground/30";
}

function getTaskDot(status: ThreadPlanTaskStatus | undefined) {
  if (status === "completed") return "bg-success";
  if (status === "in_progress") return "bg-accent";
  if (status === "blocked") return "bg-danger";
  return "bg-foreground/15";
}

type SidebarPlanData = {
  audience: "general" | "technical";
  document: string;
  goal?: string | null;
  isStreaming?: boolean;
  pendingQuestionCount?: number;
  statusLabel?: string | null;
  summary?: string | null;
  taskCount?: number;
  tasks?: Array<{
    description?: string | null;
    id?: string;
    status?: ThreadPlanTaskStatus;
    title: string;
  }>;
  title?: string | null;
  updatedAt?: Date | null;
};

function PlanSidebarBody({ plan }: { plan: SidebarPlanData }) {
  const taskCount = plan.taskCount ?? plan.tasks?.length ?? 0;
  const trimmedGoal = plan.goal?.trim() ?? "";
  const completedCount =
    plan.tasks?.filter((t) => t.status === "completed").length ?? 0;

  const metaParts = useMemo(() => {
    const parts: string[] = [];
    parts.push(getPlanAudienceLabel(plan.audience));
    if (plan.statusLabel) parts.push(plan.statusLabel);
    if (taskCount > 0) parts.push(`${taskCount} task${taskCount === 1 ? "" : "s"}`);
    if (plan.updatedAt) parts.push(formatRelativeTime(plan.updatedAt));
    return parts;
  }, [plan.audience, plan.statusLabel, plan.updatedAt, taskCount]);

  return (
    <ScrollShadow className="h-full px-5 pb-6" orientation="vertical">
      <p className="text-[11px] text-foreground/40">
        {metaParts.join(" · ")}
      </p>

      {trimmedGoal ? (
        <p className="mt-2.5 text-[13px] leading-relaxed text-foreground/70">
          {trimmedGoal}
        </p>
      ) : null}

      {taskCount > 0 && plan.tasks ? (
        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium text-foreground/50">
              Tasks
            </p>
            <p className="text-[10px] text-foreground/30">
              {completedCount}/{taskCount} done
            </p>
          </div>

          <div className="mb-3 flex gap-0.5">
            {plan.tasks.map((task, i) => (
              <div
                key={task.id ?? i}
                className={`h-1 flex-1 rounded-full ${getTaskDot(task.status)}`}
              />
            ))}
          </div>

          <div className="space-y-px">
            {plan.tasks.map((task, index) => {
              const StatusIcon = getTaskStatusIcon(task.status);
              return (
                <div
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5"
                  key={task.id ?? `${task.title}-${index}`}
                >
                  <HugeiconsIcon
                    className={`mt-0.5 shrink-0 ${getTaskStatusColor(task.status)}`}
                    color="currentColor"
                    icon={StatusIcon}
                    size={12}
                    strokeWidth={1.5}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[12px] text-foreground/80">
                        {task.title}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] ${getTaskStatusColor(task.status)}`}
                      >
                        {getTaskStatusLabel(task.status ?? "pending")}
                      </span>
                    </div>
                    {task.description ? (
                      <p className="mt-0.5 text-[11px] text-foreground/40">
                        {task.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-4">
        <p className="mb-2 text-[11px] font-medium text-foreground/50">
          Document
        </p>
        <div className="[&_.sentinel-prose]:text-[13px] [&_.sentinel-prose_h1]:text-[1.15em] [&_.sentinel-prose_h2]:text-[1.05em] [&_.sentinel-prose_h3]:text-[0.95em]">
          <MarkdownContent
            isStreaming={plan.isStreaming}
            text={plan.document || "Drafting plan..."}
          />
        </div>
      </section>
    </ScrollShadow>
  );
}

export function PlanSidebar() {
  const { close } = useRightSidebar();
  const kind = usePlanSidebarState((state) => state.kind);
  const threadId = usePlanSidebarState((state) =>
    state.kind === "thread" ? state.threadId : "__plan-sidebar__",
  );
  const draftSnapshot = usePlanSidebarState((state) =>
    state.kind === "draft" ? state.snapshot : null,
  );
  const threadPlan = api.plan.get.useQuery(
    { threadId },
    {
      enabled: kind === "thread",
      staleTime: 0,
    },
  );

  const viewState = useMemo(
    () => ({
      draftSnapshot,
      kind,
      threadId,
    }),
    [draftSnapshot, kind, threadId],
  );

  const handleClose = () => {
    closePlanSidebarState();
    close();
  };

  let title = "Plan";
  let content: ReactNode = null;

  if (viewState.kind === "thread") {
    if (threadPlan.isPending && !threadPlan.data) {
      content = (
        <div className="px-5 py-8 text-[13px] text-foreground/40">
          Loading plan...
        </div>
      );
    } else if (threadPlan.error) {
      content = (
        <div className="px-5 py-8 text-[13px] text-danger">
          {threadPlan.error.message}
        </div>
      );
    } else if (!threadPlan.data?.plan) {
      content = (
        <div className="px-5 py-8 text-[13px] text-foreground/40">
          No plan is available for this thread yet.
        </div>
      );
    } else {
      title = threadPlan.data.plan.title?.trim() || "Plan";
      content = (
        <PlanSidebarBody
          plan={{
            audience: threadPlan.data.plan.audience,
            document: threadPlan.data.plan.document,
            goal: threadPlan.data.plan.goal,
            isStreaming: false,
            pendingQuestionCount:
              threadPlan.data.pendingQuestionSet?.questions.length ?? 0,
            summary: threadPlan.data.plan.summary,
            taskCount: threadPlan.data.plan.tasks.length,
            tasks: threadPlan.data.plan.tasks,
            title: threadPlan.data.plan.title,
            updatedAt: threadPlan.data.plan.updatedAt,
          }}
        />
      );
    }
  } else if (viewState.kind === "draft" && viewState.draftSnapshot) {
    title = viewState.draftSnapshot.title?.trim() || "Plan";
    content = <PlanSidebarBody plan={viewState.draftSnapshot} />;
  } else {
    content = (
      <div className="px-5 py-8 text-[13px] text-foreground/40">
        No plan selected.
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/20 px-5 py-3.5">
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">
          {title}
        </h2>
        <CloseButton
          aria-label="Close plan sidebar"
          className="shrink-0"
          onPress={handleClose}
        />
      </header>
      <div className="min-h-0 flex-1 pt-3">{content}</div>
    </div>
  );
}
