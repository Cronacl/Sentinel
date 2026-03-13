import { z } from "zod";

import { updateThreadPlan } from "@/lib/plan/service";
import { THREAD_PLAN_AUDIENCES } from "@/lib/plan";

export const updatePlanInputSchema = z.object({
  audience: z.enum(THREAD_PLAN_AUDIENCES).optional(),
  document: z.string().trim().min(1).max(40_000).optional(),
  goal: z.string().trim().min(1).max(300).optional(),
  planId: z.string().min(1).optional(),
  summary: z.string().trim().min(1).max(2000).optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

export const updatePlanOutputSchema = z.object({
  audience: z.enum(THREAD_PLAN_AUDIENCES),
  document: z.string(),
  goal: z.string(),
  planId: z.string(),
  summary: z.string(),
  title: z.string(),
});

export async function executeUpdatePlan({
  input,
  runtime,
}: {
  input: z.infer<typeof updatePlanInputSchema>;
  runtime: {
    threadId: string;
  };
}) {
  const state = await updateThreadPlan({
    audience: input.audience,
    document: input.document,
    goal: input.goal,
    planId: input.planId,
    summary: input.summary,
    threadId: runtime.threadId,
    title: input.title,
  });

  if (!state.plan) {
    throw new Error("No plan exists for this thread.");
  }

  return {
    audience: state.plan.audience,
    document: state.plan.document,
    goal: state.plan.goal,
    planId: state.plan.id,
    summary: state.plan.summary,
    title: state.plan.title,
  };
}
