"use client";

import type { ReactNode } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { useMemo } from "react";
import { CloseButton, ScrollShadow } from "@heroui/react";

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
  if (diffMs < 30_000) {
    return "now";
  }

  return formatDistanceToNowStrict(value, { addSuffix: true });
}

function getTaskTone(status: ThreadPlanTaskStatus | undefined) {
  if (status === "completed") return "text-success";
  if (status === "in_progress") return "text-accent";
  if (status === "blocked") return "text-danger";
  return "text-muted";
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

function MetaDot() {
  return <span className="text-border">·</span>;
}

function PlanSidebarBody({ plan }: { plan: SidebarPlanData }) {
  const taskCount = plan.taskCount ?? plan.tasks?.length ?? 0;
  const trimmedGoal = plan.goal?.trim() ?? "";

  const metaItems = useMemo(() => {
    const items: Array<{ key: string; node: ReactNode }> = [];

    items.push({
      key: "audience",
      node: (
        <span className="rounded-full border border-border/40 bg-background/60 px-2 py-0.5 text-[10px] font-medium">
          {getPlanAudienceLabel(plan.audience)}
        </span>
      ),
    });

    if (plan.statusLabel) {
      items.push({
        key: "status",
        node: (
          <span className="rounded-full border border-accent-soft bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
            {plan.statusLabel}
          </span>
        ),
      });
    }

    if (taskCount > 0) {
      items.push({
        key: "tasks",
        node: (
          <span className="text-[11px]">
            {taskCount} task{taskCount === 1 ? "" : "s"}
          </span>
        ),
      });
    }

    if (plan.updatedAt) {
      items.push({
        key: "updated",
        node: (
          <span className="text-[11px]">
            Updated {formatRelativeTime(plan.updatedAt)}
          </span>
        ),
      });
    }

    return items;
  }, [plan.audience, plan.statusLabel, plan.updatedAt, taskCount]);

  return (
    <ScrollShadow className="h-full px-5 pb-6" orientation="vertical">
      <div className="flex flex-wrap items-center gap-1.5 text-muted">
        {metaItems.map((item, i) => (
          <span key={item.key} className="inline-flex items-center gap-1.5">
            {i > 0 && <MetaDot />}
            {item.node}
          </span>
        ))}
      </div>

      {trimmedGoal ? (
        <p className="mt-3 text-[13px] leading-relaxed text-foreground/80">
          {trimmedGoal}
        </p>
      ) : null}

      {taskCount > 0 ? (
        <section className="mt-5">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold  tracking-wider text-muted">
              Tasks
            </p>
            <span className="text-[10px] text-muted">
              {taskCount} item{taskCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-1.5">
            {plan.tasks?.map((task, index) => (
              <div
                className="rounded-lg border border-border/15 bg-background/45 px-3 py-2"
                key={task.id ?? `${task.title}-${index}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {task.title}
                  </span>
                  {task.status ? (
                    <span className={`text-[10px] ${getTaskTone(task.status)}`}>
                      {getTaskStatusLabel(task.status)}
                    </span>
                  ) : null}
                </div>
                {task.description ? (
                  <p className="mt-1 text-[11px] text-muted">
                    {task.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-5">
        <p className="mb-2.5 text-[11px] font-semibold  tracking-wider text-muted">
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

  let title = "Plan draft";
  let content: ReactNode = null;

  if (viewState.kind === "thread") {
    if (threadPlan.isPending && !threadPlan.data) {
      content = (
        <div className="px-5 py-8 text-sm text-muted">Loading plan...</div>
      );
    } else if (threadPlan.error) {
      content = (
        <div className="px-5 py-8 text-sm text-danger-soft-foreground">
          {threadPlan.error.message}
        </div>
      );
    } else if (!threadPlan.data?.plan) {
      content = (
        <div className="px-5 py-8 text-sm text-muted">
          No plan is available for this thread yet.
        </div>
      );
    } else {
      title = threadPlan.data.plan.title?.trim() || "Plan draft";
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
    title = viewState.draftSnapshot.title?.trim() || "Plan draft";
    content = <PlanSidebarBody plan={viewState.draftSnapshot} />;
  } else {
    content = (
      <div className="px-5 py-8 text-sm text-muted">No plan selected.</div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-border/20 px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-snug text-foreground">
            {title}
          </h2>
        </div>
        <CloseButton
          aria-label="Close plan sidebar"
          className="mt-0.5 shrink-0"
          onPress={handleClose}
        />
      </header>

      <div className="min-h-0 flex-1 pt-4">{content}</div>
    </div>
  );
}
