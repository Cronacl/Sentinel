import { z } from "zod";

import { getThreadPlanState, upsertThreadPlan } from "@/lib/plan/service";
import { THREAD_PLAN_AUDIENCES } from "@/lib/plan";
import { threadPlanTaskInputSchema } from "@/schemas/plan.schema";

export const createPlanInputSchema = z.object({
  audience: z.enum(THREAD_PLAN_AUDIENCES),
  document: z.string().trim().min(1).max(40_000),
  goal: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(2000),
  tasks: z.array(threadPlanTaskInputSchema).max(20).default([]),
  title: z.string().trim().min(1).max(200),
});

export const createPlanOutputSchema = z.object({
  audience: z.enum(THREAD_PLAN_AUDIENCES),
  document: z.string(),
  goal: z.string(),
  planId: z.string(),
  status: z.enum(["created", "updated"]),
  summary: z.string(),
  taskCount: z.number(),
  title: z.string(),
});

export async function executeCreatePlan({
  input,
  runtime,
}: {
  input: z.infer<typeof createPlanInputSchema>;
  runtime: {
    threadId: string;
  };
}) {
  const existing = await getThreadPlanState({
    threadId: runtime.threadId,
  });
  const next = await upsertThreadPlan({
    audience: input.audience,
    document: input.document,
    goal: input.goal,
    summary: input.summary,
    tasks: input.tasks,
    threadId: runtime.threadId,
    title: input.title,
  });

  return {
    audience: next.plan?.audience ?? input.audience,
    document: next.plan?.document ?? input.document,
    goal: next.plan?.goal ?? input.goal,
    planId: next.plan?.id ?? "",
    status: existing.plan ? "updated" : "created",
    summary: next.plan?.summary ?? input.summary,
    taskCount: next.plan?.tasks.length ?? input.tasks.length,
    title: next.plan?.title ?? input.title,
  };
}
