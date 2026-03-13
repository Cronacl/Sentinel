import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq } from "drizzle-orm";

import type {
  ThreadPlan,
  ThreadPlanAnswer,
  ThreadPlanAudience,
  ThreadPlanQuestion,
  ThreadPlanQuestionSet,
  ThreadPlanTask,
  ThreadPlanTaskStatus,
} from "@/lib/plan";
import { buildDefaultPlanDocument } from "@/lib/plan";
import { db, type Database } from "@/server/db";
import {
  threadPlanQuestions,
  threadPlans,
  threadPlanTasks,
  threads,
} from "@/server/db/schema";

type ThreadPlanState = {
  pendingQuestionSet: ThreadPlanQuestionSet | null;
  plan: ThreadPlan | null;
};

function trimToString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAudience(value: unknown): ThreadPlanAudience {
  return value === "general" ? "general" : "technical";
}

function normalizePlanDocumentPayload({
  audience,
  document,
  goal,
  summary,
  tasks,
  title,
}: {
  audience: ThreadPlanAudience;
  document: unknown;
  goal: unknown;
  summary: unknown;
  tasks: Array<{ description?: string | null; title: string }> | ThreadPlanTask[];
  title: unknown;
}) {
  const normalizedTitle = trimToString(title) || "Plan";
  const normalizedGoal =
    trimToString(goal) || "Clarify the implementation goal.";
  const normalizedSummary =
    trimToString(summary) || normalizedGoal;
  const normalizedDocument =
    trimToString(document) ||
    buildDefaultPlanDocument({
      audience,
      goal: normalizedGoal,
      summary: normalizedSummary,
      tasks: tasks.map((task) => ({
        ...task,
        description: task.description ?? null,
        status: "status" in task ? task.status : "pending",
        title: trimToString(task.title) || "Untitled task",
      })),
      title: normalizedTitle,
    });

  return {
    document: normalizedDocument,
    goal: normalizedGoal,
    summary: normalizedSummary,
    title: normalizedTitle,
  };
}

async function ensurePlanDocumentBackfill({
  database,
  planRow,
  tasks,
}: {
  database: Database;
  planRow: typeof threadPlans.$inferSelect;
  tasks: ThreadPlanTask[];
}) {
  const audience = normalizeAudience(planRow.audience);
  const normalizedPlan = normalizePlanDocumentPayload({
    audience,
    document: planRow.document,
    goal: planRow.goal,
    summary: planRow.summary,
    tasks,
    title: planRow.title,
  });

  if (planRow.audience === audience && trimToString(planRow.document)) {
    return {
      audience,
      document: normalizedPlan.document,
      updatedAt: planRow.updatedAt,
    };
  }

  database
    .update(threadPlans)
    .set({
      audience,
      document: normalizedPlan.document,
      updatedAt: planRow.updatedAt,
    })
    .where(eq(threadPlans.id, planRow.id))
    .run();

  return {
    audience,
    document: normalizedPlan.document,
    updatedAt: planRow.updatedAt,
  };
}

function mapTask(
  row: typeof threadPlanTasks.$inferSelect,
): ThreadPlanTask {
  return {
    createdAt: row.createdAt,
    description: row.description,
    id: row.id,
    status: row.status,
    title: row.title,
    updatedAt: row.updatedAt,
  };
}

function mapQuestionSet(
  row: typeof threadPlanQuestions.$inferSelect,
): ThreadPlanQuestionSet {
  return {
    answeredAt: row.answeredAt,
    answers: (row.response as ThreadPlanAnswer[] | null) ?? null,
    createdAt: row.createdAt,
    id: row.id,
    questions: row.questions as ThreadPlanQuestion[],
    status: row.status,
    threadId: row.threadId,
    updatedAt: row.updatedAt,
  };
}

async function loadPlanState(
  threadId: string,
  database: Database,
): Promise<ThreadPlanState> {
  const planRow = await database.query.threadPlans.findFirst({
    where: eq(threadPlans.threadId, threadId),
  });

  const taskRows = planRow
    ? await database.query.threadPlanTasks.findMany({
        where: eq(threadPlanTasks.planId, planRow.id),
        orderBy: (table, { asc }) => [asc(table.sortOrder), asc(table.createdAt)],
      })
    : [];

  const pendingQuestionRow = await database.query.threadPlanQuestions.findFirst({
    where: and(
      eq(threadPlanQuestions.threadId, threadId),
      eq(threadPlanQuestions.status, "pending"),
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const tasks = taskRows.map(mapTask);
  const hydratedPlan = planRow
    ? await ensurePlanDocumentBackfill({
        database,
        planRow,
        tasks,
      })
    : null;

  return {
    pendingQuestionSet: pendingQuestionRow ? mapQuestionSet(pendingQuestionRow) : null,
    plan: planRow
      ? {
          audience: hydratedPlan!.audience,
          createdAt: planRow.createdAt,
          document: hydratedPlan!.document,
          goal: planRow.goal,
          id: planRow.id,
          summary: planRow.summary,
          tasks,
          threadId: planRow.threadId,
          title: planRow.title,
          updatedAt: hydratedPlan!.updatedAt,
        }
      : null,
  };
}

export async function getThreadPlanState({
  database = db,
  threadId,
}: {
  database?: Database;
  threadId: string;
}) {
  return loadPlanState(threadId, database);
}

function replacePlanTasks(
  tx: Database,
  planId: string,
  tasks: Array<{ description?: string | null; title: string }>,
) {
  tx.delete(threadPlanTasks).where(eq(threadPlanTasks.planId, planId)).run();

  tasks.forEach((task, index) => {
    tx.insert(threadPlanTasks)
      .values({
        description: trimToString(task.description) || null,
        planId,
        sortOrder: index,
        title: trimToString(task.title) || "Untitled task",
      })
      .run();
  });
}

export async function upsertThreadPlan({
  audience,
  database = db,
  document,
  goal,
  summary,
  tasks,
  threadId,
  title,
}: {
  audience: ThreadPlanAudience;
  database?: Database;
  document: string;
  goal: string;
  summary: string;
  tasks?: Array<{ description?: string | null; title: string }>;
  threadId: string;
  title: string;
}) {
  const normalizedPlan = normalizePlanDocumentPayload({
    audience,
    document,
    goal,
    summary,
    tasks: tasks ?? [],
    title,
  });

  database.transaction((tx) => {
    const existing = tx
      .select()
      .from(threadPlans)
      .where(eq(threadPlans.threadId, threadId))
      .get();

    if (existing) {
      tx.update(threadPlans)
        .set({
          audience,
          document: normalizedPlan.document,
          goal: normalizedPlan.goal,
          summary: normalizedPlan.summary,
          title: normalizedPlan.title,
        })
        .where(eq(threadPlans.id, existing.id))
        .run();

      if (tasks) {
        replacePlanTasks(tx as unknown as Database, existing.id, tasks);
      }
    } else {
      const planId = createId();
      tx.insert(threadPlans)
        .values({
          audience,
          document: normalizedPlan.document,
          goal: normalizedPlan.goal,
          id: planId,
          summary: normalizedPlan.summary,
          threadId,
          title: normalizedPlan.title,
        })
        .run();

      if (tasks && tasks.length > 0) {
        replacePlanTasks(tx as unknown as Database, planId, tasks);
      }
    }

    tx.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, threadId)).run();
  });

  return loadPlanState(threadId, database);
}

export async function updateThreadPlan({
  audience,
  database = db,
  document,
  goal,
  planId,
  summary,
  threadId,
  title,
}: {
  audience?: ThreadPlanAudience;
  database?: Database;
  document?: string;
  goal?: string;
  planId?: string;
  summary?: string;
  threadId: string;
  title?: string;
}) {
  database.transaction((tx) => {
    const existing = planId
      ? tx
          .select()
          .from(threadPlans)
          .where(
            and(eq(threadPlans.id, planId), eq(threadPlans.threadId, threadId)),
          )
          .get()
      : tx
          .select()
          .from(threadPlans)
          .where(eq(threadPlans.threadId, threadId))
          .get();

    if (!existing) {
      throw new Error("No plan exists for this thread.");
    }

    tx.update(threadPlans)
      .set({
        ...(audience === undefined ? {} : { audience }),
        ...(typeof document === "string" ? { document: document.trim() } : {}),
        ...(typeof goal === "string" ? { goal: goal.trim() } : {}),
        ...(typeof summary === "string" ? { summary: summary.trim() } : {}),
        ...(typeof title === "string" ? { title: title.trim() } : {}),
      })
      .where(eq(threadPlans.id, existing.id))
      .run();

    tx.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, threadId)).run();
  });

  return loadPlanState(threadId, database);
}

export async function manageThreadPlanTask({
  action,
  database = db,
  description,
  planId,
  status,
  taskId,
  threadId,
  title,
}: {
  action: "create" | "delete" | "update";
  database?: Database;
  description?: string | null;
  planId?: string;
  status?: ThreadPlanTaskStatus;
  taskId?: string;
  threadId: string;
  title?: string;
}) {
  let resolvedTask: ThreadPlanTask | null = null;

  database.transaction((tx) => {
    const resolvedPlan = planId
      ? tx
          .select()
          .from(threadPlans)
          .where(
            and(eq(threadPlans.id, planId), eq(threadPlans.threadId, threadId)),
          )
          .get()
      : tx
          .select()
          .from(threadPlans)
          .where(eq(threadPlans.threadId, threadId))
          .get();

    if (!resolvedPlan) {
      throw new Error("No plan exists for this thread.");
    }

    if (action === "create") {
      const lastTask = tx
        .select()
        .from(threadPlanTasks)
        .where(eq(threadPlanTasks.planId, resolvedPlan.id))
        .orderBy(desc(threadPlanTasks.sortOrder))
        .limit(1)
        .get();
      const nextId = createId();
      tx.insert(threadPlanTasks)
        .values({
          description: trimToString(description) || null,
          id: nextId,
          planId: resolvedPlan.id,
          sortOrder: (lastTask?.sortOrder ?? -1) + 1,
          ...(status ? { status } : {}),
          title: trimToString(title) || "Untitled task",
        })
        .run();

      const inserted = tx
        .select()
        .from(threadPlanTasks)
        .where(eq(threadPlanTasks.id, nextId))
        .get();
      resolvedTask = inserted ? mapTask(inserted) : null;
    } else {
      if (!taskId) {
        throw new Error("A task id is required.");
      }

      const existingTask = tx
        .select()
        .from(threadPlanTasks)
        .where(eq(threadPlanTasks.id, taskId))
        .get();
      if (!existingTask || existingTask.planId !== resolvedPlan.id) {
        throw new Error("Task not found.");
      }

      if (action === "delete") {
        resolvedTask = mapTask(existingTask);
        tx.delete(threadPlanTasks).where(eq(threadPlanTasks.id, taskId)).run();
      } else {
        tx.update(threadPlanTasks)
          .set({
            ...(description === undefined
              ? {}
              : { description: trimToString(description) || null }),
            ...(status === undefined ? {} : { status }),
            ...(typeof title === "string" ? { title: title.trim() } : {}),
          })
          .where(eq(threadPlanTasks.id, taskId))
          .run();

        const updated = tx
          .select()
          .from(threadPlanTasks)
          .where(eq(threadPlanTasks.id, taskId))
          .get();
        resolvedTask = updated ? mapTask(updated) : null;
      }
    }

    tx.update(threadPlans)
      .set({ updatedAt: new Date() })
      .where(eq(threadPlans.id, resolvedPlan.id))
      .run();
    tx.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, threadId)).run();
  });

  return {
    plan: await loadPlanState(threadId, database),
    task: resolvedTask,
  };
}

export async function createThreadPlanQuestionSet({
  database = db,
  questions,
  threadId,
}: {
  database?: Database;
  questions: ThreadPlanQuestion[];
  threadId: string;
}) {
  const questionSetId = createId();

  database.transaction((tx) => {
    tx.update(threadPlanQuestions)
      .set({
        answeredAt: new Date(),
        status: "cancelled",
      })
      .where(
        and(
          eq(threadPlanQuestions.threadId, threadId),
          eq(threadPlanQuestions.status, "pending"),
        ),
      )
      .run();

    tx.insert(threadPlanQuestions)
      .values({
        id: questionSetId,
        questions,
        threadId,
      })
      .run();

    tx.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, threadId)).run();
  });

  const created = await database.query.threadPlanQuestions.findFirst({
    where: eq(threadPlanQuestions.id, questionSetId),
  });

  if (!created) {
    throw new Error("Question set was not created.");
  }

  return mapQuestionSet(created);
}

export async function answerThreadPlanQuestionSet({
  answers,
  database = db,
  questionSetId,
  threadId,
}: {
  answers: ThreadPlanAnswer[];
  database?: Database;
  questionSetId: string;
  threadId: string;
}) {
  database.update(threadPlanQuestions)
    .set({
      answeredAt: new Date(),
      response: answers,
      status: "answered",
    })
    .where(
      and(
        eq(threadPlanQuestions.id, questionSetId),
        eq(threadPlanQuestions.threadId, threadId),
      ),
    )
    .run();

  database.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, threadId)).run();

  const questionSet = await database.query.threadPlanQuestions.findFirst({
    where: and(
      eq(threadPlanQuestions.id, questionSetId),
      eq(threadPlanQuestions.threadId, threadId),
    ),
  });

  if (!questionSet) {
    throw new Error("Question set not found.");
  }

  return mapQuestionSet(questionSet);
}
