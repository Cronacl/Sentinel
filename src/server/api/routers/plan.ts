import {
  answerThreadPlanQuestionSet,
  getThreadPlanState,
  manageThreadPlanTask,
  upsertThreadPlan,
} from "@/lib/plan/service";
import {
  planAnswerQuestionsSchema,
  planDeleteTaskSchema,
  planGetSchema,
  planUpdateTaskSchema,
  planUpsertSchema,
} from "@/schemas/plan.schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { getOwnedThreadOrThrow } from "./workspace-thread-helpers";

export const planRouter = createTRPCRouter({
  get: protectedProcedure
    .input(planGetSchema)
    .query(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);
      return getThreadPlanState({
        database: ctx.db,
        threadId: input.threadId,
      });
    }),

  upsert: protectedProcedure
    .input(planUpsertSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);
      return upsertThreadPlan({
        audience: input.audience,
        database: ctx.db,
        document: input.document,
        goal: input.goal,
        summary: input.summary,
        tasks: input.tasks,
        threadId: input.threadId,
        title: input.title,
      });
    }),

  updateTask: protectedProcedure
    .input(planUpdateTaskSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);

      return manageThreadPlanTask({
        action: input.taskId ? "update" : "create",
        database: ctx.db,
        description: input.description,
        status: input.status,
        taskId: input.taskId,
        threadId: input.threadId,
        title: input.title,
      });
    }),

  deleteTask: protectedProcedure
    .input(planDeleteTaskSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);
      return manageThreadPlanTask({
        action: "delete",
        database: ctx.db,
        taskId: input.taskId,
        threadId: input.threadId,
      });
    }),

  answerQuestions: protectedProcedure
    .input(planAnswerQuestionsSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);
      return answerThreadPlanQuestionSet({
        answers: input.answers,
        database: ctx.db,
        questionSetId: input.questionSetId,
        threadId: input.threadId,
      });
    }),
});
