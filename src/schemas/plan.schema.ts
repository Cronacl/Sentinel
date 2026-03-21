import { z } from "zod";

import {
  THREAD_PLAN_AUDIENCES,
  THREAD_PLAN_TASK_STATUSES,
  type ThreadPlanQuestion,
} from "@/lib/plan";

export const threadPlanAudienceSchema = z.enum(THREAD_PLAN_AUDIENCES);
export const threadPlanTaskStatusSchema = z.enum(THREAD_PLAN_TASK_STATUSES);

export const threadPlanTaskInputSchema = z.object({
  description: z.string().trim().max(600).optional().nullable(),
  title: z.string().trim().min(1).max(200),
});

export const threadPlanQuestionOptionSchema = z.object({
  description: z.string().trim().min(1).max(240),
  label: z.string().trim().min(1).max(80),
});

export const threadPlanQuestionSchema: z.ZodType<ThreadPlanQuestion> = z.object(
  {
    allowMultiple: z.boolean().optional(),
    header: z.string().trim().min(1).max(24),
    id: z.string().trim().min(1).max(80),
    options: z.array(threadPlanQuestionOptionSchema).min(2).max(4),
    question: z.string().trim().min(1).max(240),
  },
);

export const threadPlanAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(400),
  optionLabel: z.string().trim().min(1).max(80).optional().nullable(),
  questionId: z.string().trim().min(1).max(80),
});

export const planGetSchema = z.object({
  threadId: z.string().min(1),
});

export const planUpsertSchema = z.object({
  audience: threadPlanAudienceSchema,
  document: z.string().trim().min(1).max(40_000),
  goal: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(2000),
  tasks: z.array(threadPlanTaskInputSchema).max(20).optional(),
  threadId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
});

export const planUpdateTaskSchema = z.object({
  description: z.string().trim().max(600).optional().nullable(),
  status: threadPlanTaskStatusSchema.optional(),
  taskId: z.string().min(1).optional(),
  threadId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
});

export const planUpdateSchema = z.object({
  audience: threadPlanAudienceSchema.optional(),
  document: z.string().trim().min(1).max(40_000).optional(),
  goal: z.string().trim().min(1).max(300).optional(),
  planId: z.string().min(1).optional(),
  summary: z.string().trim().min(1).max(2000).optional(),
  threadId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
});

export const planDeleteTaskSchema = z.object({
  taskId: z.string().min(1),
  threadId: z.string().min(1),
});

export const planAnswerQuestionsSchema = z.object({
  answers: z.array(threadPlanAnswerSchema).min(1).max(3),
  questionSetId: z.string().min(1),
  threadId: z.string().min(1),
});
