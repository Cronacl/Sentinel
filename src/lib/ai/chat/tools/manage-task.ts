import { z } from "zod";

import { manageThreadPlanTask } from "@/lib/plan/service";
import { threadPlanTaskStatusSchema } from "@/schemas/plan.schema";

export const manageTaskInputSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  description: z.string().trim().max(600).optional().nullable(),
  planId: z.string().min(1).optional(),
  status: threadPlanTaskStatusSchema.optional(),
  taskId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

export const manageTaskOutputSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  planId: z.string(),
  task: z
    .object({
      description: z.string().nullable(),
      id: z.string(),
      status: threadPlanTaskStatusSchema,
      title: z.string(),
    })
    .nullable(),
});

export async function executeManageTask({
  input,
  runtime,
}: {
  input: z.infer<typeof manageTaskInputSchema>;
  runtime: {
    threadId: string;
  };
}) {
  const result = await manageThreadPlanTask({
    action: input.action,
    description: input.description,
    planId: input.planId,
    status: input.status,
    taskId: input.taskId,
    threadId: runtime.threadId,
    title: input.title,
  });
  const task = result.task as
    | {
        description: string | null;
        id: string;
        status: "blocked" | "completed" | "in_progress" | "pending";
        title: string;
      }
    | null;

  return {
    action: input.action,
    planId: result.plan.plan?.id ?? input.planId ?? "",
    task: task
      ? {
          description: task.description,
          id: task.id,
          status: task.status,
          title: task.title,
        }
      : null,
  };
}
