// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const getThreadPlanState = mock(async () => ({
  pendingQuestionSet: null,
  plan: {
    audience: "technical",
    createdAt: new Date("2026-03-12T00:00:00.000Z"),
    document: "# Plan mode\n\n## Overview\n\nImplement plan mode",
    goal: "Ship plan mode",
    id: "plan-1",
    summary: "Implement plan mode",
    tasks: [],
    threadId: "thread-1",
    title: "Plan mode",
    updatedAt: new Date("2026-03-12T00:00:00.000Z"),
  },
}));
const upsertThreadPlan = mock(async () => ({
  pendingQuestionSet: null,
  plan: {
    audience: "technical",
    createdAt: new Date("2026-03-12T00:00:00.000Z"),
    document: "# Plan mode\n\n## Overview\n\nImplement plan mode",
    goal: "Ship plan mode",
    id: "plan-1",
    summary: "Implement plan mode",
    tasks: [
      {
        createdAt: new Date("2026-03-12T00:00:00.000Z"),
        description: "Build thread mode",
        id: "task-1",
        status: "pending",
        title: "Add thread mode",
        updatedAt: new Date("2026-03-12T00:00:00.000Z"),
      },
    ],
    threadId: "thread-1",
    title: "Plan mode",
    updatedAt: new Date("2026-03-12T00:00:00.000Z"),
  },
}));
const manageThreadPlanTask = mock(async () => ({
  plan: {
    pendingQuestionSet: null,
    plan: {
      audience: "technical",
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      document: "# Plan mode\n\n## Overview\n\nImplement plan mode",
      goal: "Ship plan mode",
      id: "plan-1",
      summary: "Implement plan mode",
      tasks: [],
      threadId: "thread-1",
      title: "Plan mode",
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    },
  },
  task: {
    createdAt: new Date("2026-03-12T00:00:00.000Z"),
    description: "Build thread mode",
    id: "task-1",
    status: "completed",
    title: "Add thread mode",
    updatedAt: new Date("2026-03-12T00:00:00.000Z"),
  },
}));
const answerThreadPlanQuestionSet = mock(async () => ({
  answeredAt: new Date("2026-03-12T00:00:00.000Z"),
  answers: [
    {
      answer: "Thread-scoped",
      optionLabel: "Thread-scoped",
      questionId: "q-1",
    },
  ],
  createdAt: new Date("2026-03-12T00:00:00.000Z"),
  id: "question-set-1",
  questions: [],
  status: "answered",
  threadId: "thread-1",
  updatedAt: new Date("2026-03-12T00:00:00.000Z"),
}));
const getOwnedThreadOrThrow = mock(async () => ({ id: "thread-1" }));

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    input: () => ({
      mutation: (handler: any) => handler,
      query: (handler: any) => handler,
    }),
  },
}));

mock.module("@/lib/plan/service", () => ({
  answerThreadPlanQuestionSet,
  getThreadPlanState,
  manageThreadPlanTask,
  upsertThreadPlan,
}));

mock.module("./workspace-thread-helpers", () => ({
  getOwnedThreadOrThrow,
}));

const { planRouter } = await import("./plan");

beforeEach(() => {
  getThreadPlanState.mockReset();
  upsertThreadPlan.mockReset();
  manageThreadPlanTask.mockReset();
  answerThreadPlanQuestionSet.mockReset();
  getOwnedThreadOrThrow.mockReset();

  getThreadPlanState.mockImplementation(async () => ({
    pendingQuestionSet: null,
    plan: {
      audience: "technical",
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      document: "# Plan mode\n\n## Overview\n\nImplement plan mode",
      goal: "Ship plan mode",
      id: "plan-1",
      summary: "Implement plan mode",
      tasks: [],
      threadId: "thread-1",
      title: "Plan mode",
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    },
  }));
  upsertThreadPlan.mockImplementation(async () => ({
    pendingQuestionSet: null,
    plan: {
      audience: "technical",
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      document: "# Plan mode\n\n## Overview\n\nImplement plan mode",
      goal: "Ship plan mode",
      id: "plan-1",
      summary: "Implement plan mode",
      tasks: [],
      threadId: "thread-1",
      title: "Plan mode",
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    },
  }));
  manageThreadPlanTask.mockImplementation(async () => ({
    plan: {
      pendingQuestionSet: null,
      plan: {
        audience: "technical",
        createdAt: new Date("2026-03-12T00:00:00.000Z"),
        document: "# Plan mode\n\n## Overview\n\nImplement plan mode",
        goal: "Ship plan mode",
        id: "plan-1",
        summary: "Implement plan mode",
        tasks: [],
        threadId: "thread-1",
        title: "Plan mode",
        updatedAt: new Date("2026-03-12T00:00:00.000Z"),
      },
    },
    task: {
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      description: "Build thread mode",
      id: "task-1",
      status: "completed",
      title: "Add thread mode",
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    },
  }));
  answerThreadPlanQuestionSet.mockImplementation(async () => ({
    answeredAt: new Date("2026-03-12T00:00:00.000Z"),
    answers: [
      {
        answer: "Thread-scoped",
        optionLabel: "Thread-scoped",
        questionId: "q-1",
      },
    ],
    createdAt: new Date("2026-03-12T00:00:00.000Z"),
    id: "question-set-1",
    questions: [],
    status: "answered",
    threadId: "thread-1",
    updatedAt: new Date("2026-03-12T00:00:00.000Z"),
  }));
  getOwnedThreadOrThrow.mockImplementation(async () => ({ id: "thread-1" }));
});

afterEach(() => {
  mock.restore();
});

describe("planRouter", () => {
  it("returns the current plan state for a thread", async () => {
    const result = await planRouter.get({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: {
        threadId: "thread-1",
      },
    });

    expect(getOwnedThreadOrThrow).toHaveBeenCalled();
    expect(getThreadPlanState).toHaveBeenCalledWith({
      database: {},
      threadId: "thread-1",
    });
    expect(result.plan?.id).toBe("plan-1");
  });

  it("upserts a plan and updates tasks", async () => {
    const result = await planRouter.upsert({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: {
        audience: "technical",
        document: "# Plan mode\n\n## Overview\n\nImplement plan mode",
        goal: "Ship plan mode",
        summary: "Implement plan mode",
        tasks: [{ title: "Add thread mode" }],
        threadId: "thread-1",
        title: "Plan mode",
      },
    });

    expect(upsertThreadPlan).toHaveBeenCalledWith({
      audience: "technical",
      database: {},
      document: "# Plan mode\n\n## Overview\n\nImplement plan mode",
      goal: "Ship plan mode",
      summary: "Implement plan mode",
      tasks: [{ title: "Add thread mode" }],
      threadId: "thread-1",
      title: "Plan mode",
    });
    expect(result.plan?.title).toBe("Plan mode");
  });

  it("answers a pending question set", async () => {
    const result = await planRouter.answerQuestions({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: {
        answers: [
          {
            answer: "Thread-scoped",
            optionLabel: "Thread-scoped",
            questionId: "q-1",
          },
        ],
        questionSetId: "question-set-1",
        threadId: "thread-1",
      },
    });

    expect(answerThreadPlanQuestionSet).toHaveBeenCalledWith({
      answers: [
        {
          answer: "Thread-scoped",
          optionLabel: "Thread-scoped",
          questionId: "q-1",
        },
      ],
      database: {},
      questionSetId: "question-set-1",
      threadId: "thread-1",
    });
    expect(result.status).toBe("answered");
  });
});
