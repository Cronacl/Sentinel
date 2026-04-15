import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { runThreadChat } from "@/lib/ai/chat";
import type {
  RepoProjectMode,
  ThreadChatEngineState,
} from "@/lib/ai/chat/engines/types";
import { ensureThreadWorktree, resolveRepoContext } from "@/lib/git/repo";
import { disposeShellSession } from "@/lib/ai/chat/tools/shell";
import { getErrorMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { PermissionMode } from "@/lib/security";
import { buildCodexBootstrapTitle } from "@/lib/ai/chat/runtime/codex-helpers";
import { buildFirstUserMessageTitle } from "@/lib/ai/chat/runtime/transcript";
import { db, type Database } from "@/server/db";
import type {
  ChatEngine,
  ScratchpadTaskStatus,
  ThreadStatus,
} from "@/server/db/enums";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import {
  deriveScratchpadTaskStatus,
  deriveScratchpadTaskTitle,
} from "@/lib/scratchpad/derived";
import {
  scratchpadTasks,
  scratchpads,
  threadMessages,
  threadPlanQuestions,
  threads,
  workspaces,
} from "@/server/db/schema";

const log = createLogger("Scratchpad");
const SCRATCHPAD_HUB_TITLE = "Scratchpad";
const SCRATCHPAD_RUN_TRIGGER = "submit-user-message";
const SCRATCHPAD_THREAD_MODE = "chat";
const SCRATCHPAD_ENGINE = "sentinel";
const RECENT_MESSAGE_LIMIT = 8;

type ScratchpadThreadRow = typeof threads.$inferSelect;
type ScratchpadTaskRow = typeof scratchpadTasks.$inferSelect;
type ScratchpadMessageRow = Pick<
  typeof threadMessages.$inferSelect,
  "createdAt" | "metadata" | "parts" | "role" | "threadId"
>;
type ScratchpadThreadStateRow = Pick<
  ScratchpadThreadRow,
  "activeStreamId" | "chatEngine" | "id" | "status" | "title"
>;

type LaunchScratchpadTaskRunInput = {
  database?: Database;
  engine?: ChatEngine;
  modelId?: string;
  reasoningEffort?: ReasoningEffort;
  taskId: string;
  threadId: string;
  title: string;
  userId: string;
  virtualThreadId: string;
  workspaceId: string;
};

type DerivedScratchpadTask = {
  createdAt: Date;
  id: string;
  isClickable: boolean;
  progressText: string | null;
  status: ScratchpadTaskStatus;
  threadActiveRunId: string | null;
  threadChatEngine: ChatEngine | null;
  threadStatus: ThreadStatus | null;
  threadTitle: string | null;
  title: string;
  updatedAt: Date;
  virtualThreadId: string | null;
  visibleThreadId: string | null;
};

type ScratchpadListResult = {
  hubThreadId: string | null;
  id: string | null;
  tasks: DerivedScratchpadTask[];
  workspaceId: string;
};

function trimToString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createScratchpadHubThread(params: {
  database: Database;
  userId: string;
  workspaceId: string;
}) {
  const hubThreadId = crypto.randomUUID();

  params.database
    .insert(threads)
    .values({
      chatEngine: SCRATCHPAD_ENGINE,
      id: hubThreadId,
      mode: SCRATCHPAD_THREAD_MODE,
      title: SCRATCHPAD_HUB_TITLE,
      userId: params.userId,
      visibility: "virtual",
      workspaceId: params.workspaceId,
    })
    .run();

  return hubThreadId;
}

async function ensureScratchpadRecord(params: {
  database: Database;
  userId: string;
  workspaceId: string;
}) {
  const existing = await params.database.query.scratchpads.findFirst({
    where: and(
      eq(scratchpads.userId, params.userId),
      eq(scratchpads.workspaceId, params.workspaceId),
    ),
  });

  const existingHubThread =
    existing?.hubThreadId == null
      ? null
      : await params.database.query.threads.findFirst({
          where: eq(threads.id, existing.hubThreadId),
          columns: { id: true },
        });

  if (existing && existingHubThread) {
    return existing;
  }

  const hubThreadId = createScratchpadHubThread(params);

  if (existing) {
    params.database
      .update(scratchpads)
      .set({
        hubThreadId,
        updatedAt: new Date(),
      })
      .where(eq(scratchpads.id, existing.id))
      .run();

    return {
      ...existing,
      hubThreadId,
      updatedAt: new Date(),
    };
  }

  const createdId = createId();
  const now = new Date();
  params.database
    .insert(scratchpads)
    .values({
      createdAt: now,
      hubThreadId,
      id: createdId,
      updatedAt: now,
      userId: params.userId,
      workspaceId: params.workspaceId,
    })
    .run();

  return {
    createdAt: now,
    hubThreadId,
    id: createdId,
    updatedAt: now,
    userId: params.userId,
    workspaceId: params.workspaceId,
  };
}

async function findOwnedScratchpadTask(params: {
  database: Database;
  taskId: string;
  userId: string;
}) {
  return params.database.query.scratchpadTasks.findFirst({
    where: eq(scratchpadTasks.id, params.taskId),
    with: {
      scratchpad: true,
    },
  });
}

async function loadDerivedThreadState(params: {
  database: Database;
  tasks: ScratchpadTaskRow[];
}) {
  const virtualThreadIds = params.tasks
    .map((task) => task.virtualThreadId)
    .filter((value): value is string => Boolean(value));

  if (virtualThreadIds.length === 0) {
    return {
      pendingQuestionThreadIds: new Set<string>(),
      recentMessagesByThreadId: new Map<string, ScratchpadMessageRow[]>(),
      targetThreadIdByTaskId: new Map<string, string>(),
      threadById: new Map<string, ScratchpadThreadStateRow>(),
      visibleChildByVirtualThreadId: new Map<
        string,
        ScratchpadThreadStateRow
      >(),
    };
  }

  const [virtualThreads, visibleChildren] = await Promise.all([
    params.database.query.threads.findMany({
      where: inArray(threads.id, virtualThreadIds),
      columns: {
        activeStreamId: true,
        chatEngine: true,
        id: true,
        status: true,
        title: true,
      },
    }),
    params.database.query.threads.findMany({
      where: inArray(threads.sourceVirtualThreadId, virtualThreadIds),
      columns: {
        activeStreamId: true,
        chatEngine: true,
        id: true,
        sourceVirtualThreadId: true,
        status: true,
        title: true,
      },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
    }),
  ]);

  const visibleChildByVirtualThreadId = new Map<
    string,
    ScratchpadThreadStateRow
  >();
  for (const child of visibleChildren) {
    if (!child.sourceVirtualThreadId) {
      continue;
    }
    if (!visibleChildByVirtualThreadId.has(child.sourceVirtualThreadId)) {
      visibleChildByVirtualThreadId.set(child.sourceVirtualThreadId, child);
    }
  }

  const threadById = new Map<string, ScratchpadThreadStateRow>([
    ...virtualThreads.map((thread) => [thread.id, thread] as const),
    ...visibleChildren.map((thread) => [thread.id, thread] as const),
  ]);
  const targetThreadIdByTaskId = new Map<string, string>();
  for (const task of params.tasks) {
    if (!task.virtualThreadId) {
      continue;
    }
    const targetThreadId =
      visibleChildByVirtualThreadId.get(task.virtualThreadId)?.id ??
      task.visibleThreadId ??
      task.virtualThreadId;
    targetThreadIdByTaskId.set(task.id, targetThreadId);
  }

  const targetThreadIds = [...new Set(targetThreadIdByTaskId.values())];
  const [recentMessages, pendingQuestionRows] =
    targetThreadIds.length > 0
      ? await Promise.all([
          params.database.query.threadMessages.findMany({
            where: inArray(threadMessages.threadId, targetThreadIds),
            columns: {
              createdAt: true,
              metadata: true,
              parts: true,
              role: true,
              threadId: true,
            },
            orderBy: (table, { desc }) => [desc(table.createdAt)],
          }),
          params.database.query.threadPlanQuestions.findMany({
            where: and(
              inArray(threadPlanQuestions.threadId, targetThreadIds),
              eq(threadPlanQuestions.status, "pending"),
            ),
            columns: {
              threadId: true,
            },
          }),
        ])
      : [[], []];

  const recentMessagesByThreadId = new Map<string, ScratchpadMessageRow[]>();
  for (const message of recentMessages) {
    const current = recentMessagesByThreadId.get(message.threadId) ?? [];
    if (current.length >= RECENT_MESSAGE_LIMIT) {
      continue;
    }
    current.push(message);
    recentMessagesByThreadId.set(message.threadId, current);
  }

  for (const [threadId, messages] of recentMessagesByThreadId) {
    recentMessagesByThreadId.set(threadId, [...messages].reverse());
  }

  return {
    pendingQuestionThreadIds: new Set(
      pendingQuestionRows.map((row) => row.threadId),
    ),
    recentMessagesByThreadId,
    threadById,
    targetThreadIdByTaskId,
    visibleChildByVirtualThreadId,
  };
}

async function hydrateScratchpadThreadTitles(params: {
  database: Database;
  targetThreadIds: string[];
  threadById: Map<string, ScratchpadThreadStateRow>;
}) {
  const candidateThreadIds = params.targetThreadIds.filter((threadId) => {
    const thread = params.threadById.get(threadId);
    if (!thread) {
      return false;
    }

    return thread.title === "New thread" || thread.chatEngine === "codex";
  });

  if (candidateThreadIds.length === 0) {
    return;
  }

  const userMessages = await params.database.query.threadMessages.findMany({
    where: and(
      inArray(threadMessages.threadId, candidateThreadIds),
      eq(threadMessages.role, "user"),
    ),
    columns: {
      parts: true,
      threadId: true,
    },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  const firstUserTextByThreadId = new Map<string, string>();
  for (const message of userMessages) {
    if (firstUserTextByThreadId.has(message.threadId)) {
      continue;
    }

    const text = (
      (message.parts as Array<{ text?: string; type: string }>) ?? []
    ).find(
      (part): part is { text: string; type: string } =>
        part.type === "text" && typeof part.text === "string",
    )?.text;

    if (text) {
      firstUserTextByThreadId.set(message.threadId, text);
    }
  }

  const nextTitleByThreadId = new Map<string, string>();
  for (const threadId of candidateThreadIds) {
    const thread = params.threadById.get(threadId);
    if (!thread) {
      continue;
    }

    const firstUserText = firstUserTextByThreadId.get(threadId) ?? null;
    const rawFirstUserTitle = buildFirstUserMessageTitle(firstUserText);
    const bootstrapTitle =
      thread.chatEngine === "codex"
        ? buildCodexBootstrapTitle(firstUserText)
        : rawFirstUserTitle;
    const shouldBootstrapTitle =
      thread.title === "New thread" && bootstrapTitle !== "New thread";
    const shouldNormalizeCodexTitle =
      thread.chatEngine === "codex" &&
      thread.title === rawFirstUserTitle &&
      bootstrapTitle !== thread.title;

    if (!shouldBootstrapTitle && !shouldNormalizeCodexTitle) {
      continue;
    }

    nextTitleByThreadId.set(threadId, bootstrapTitle);
    params.threadById.set(threadId, {
      ...thread,
      title: bootstrapTitle,
    });
  }

  for (const [threadId, title] of nextTitleByThreadId) {
    params.database
      .update(threads)
      .set({
        title,
        updatedAt: new Date(),
      })
      .where(eq(threads.id, threadId))
      .run();
  }
}

async function buildScratchpadThreadState(params: {
  database: Database;
  permissionModeOverride: PermissionMode;
  projectMode: RepoProjectMode;
  threadId: string;
  workspaceId: string;
}): Promise<ThreadChatEngineState | null> {
  const state: ThreadChatEngineState = {
    permissionModeOverride: params.permissionModeOverride,
  };

  if (params.projectMode !== "worktree") {
    return state;
  }

  const workspace = await params.database.query.workspaces.findFirst({
    where: eq(workspaces.id, params.workspaceId),
    columns: {
      rootPath: true,
    },
  });

  const rootPath = trimToString(workspace?.rootPath);
  if (!rootPath) {
    throw new Error("This workspace does not have a root path.");
  }

  const repoContext = await resolveRepoContext(rootPath);
  if (!repoContext.isGitRepo) {
    throw new Error("This workspace is not a git repository.");
  }

  if (!repoContext.branch) {
    throw new Error(
      "This workspace does not have an active branch for a worktree.",
    );
  }

  const worktree = await ensureThreadWorktree(
    rootPath,
    params.threadId,
    repoContext.branch,
  );

  return {
    ...state,
    repo: {
      activeBranch: repoContext.branch,
      projectMode: "worktree",
      worktreePath: worktree.path,
    },
  };
}

async function defaultLaunchScratchpadTaskRun(
  input: LaunchScratchpadTaskRunInput,
) {
  const database = input.database ?? db;
  const messageId = crypto.randomUUID();

  try {
    const response = await runThreadChat(
      {
        engine: input.engine ?? SCRATCHPAD_ENGINE,
        id: input.threadId,
        message: {
          id: messageId,
          metadata: {},
          parts: [{ text: input.title, type: "text" }],
          role: "user",
        },
        ...(input.modelId ? { modelId: input.modelId } : {}),
        ...(input.reasoningEffort
          ? { reasoningEffort: input.reasoningEffort }
          : {}),
        threadMode: SCRATCHPAD_THREAD_MODE,
        toolsEnabled: true,
        trigger: SCRATCHPAD_RUN_TRIGGER,
        workspaceId: input.workspaceId,
      },
      input.userId,
    );

    if (response.status >= 400) {
      database
        .update(scratchpadTasks)
        .set({
          progressText: `Task failed to start (${response.status}).`,
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(scratchpadTasks.id, input.taskId))
        .run();
    }
  } catch (error) {
    const message = getErrorMessage(error, "Task failed to start.");
    log.error("scratchpad task launch failed", {
      error: message,
      taskId: input.taskId,
      virtualThreadId: input.virtualThreadId,
      workspaceId: input.workspaceId,
    });
    database
      .update(scratchpadTasks)
      .set({
        progressText: message,
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(scratchpadTasks.id, input.taskId))
      .run();
  }
}

function scheduleScratchpadTaskRun(input: LaunchScratchpadTaskRunInput) {
  setTimeout(() => {
    void defaultLaunchScratchpadTaskRun(input);
  }, 0);
}

export async function listScratchpad(params: {
  database?: Database;
  userId: string;
  workspaceId: string;
}): Promise<ScratchpadListResult> {
  const database = params.database ?? db;
  const scratchpad = await database.query.scratchpads.findFirst({
    where: and(
      eq(scratchpads.userId, params.userId),
      eq(scratchpads.workspaceId, params.workspaceId),
    ),
  });

  const tasks = scratchpad
    ? await database.query.scratchpadTasks.findMany({
        where: eq(scratchpadTasks.scratchpadId, scratchpad.id),
        orderBy: (table, { desc }) => [
          desc(table.sortOrder),
          desc(table.createdAt),
        ],
      })
    : [];

  const threadState = await loadDerivedThreadState({ database, tasks });
  await hydrateScratchpadThreadTitles({
    database,
    targetThreadIds: [...new Set(threadState.targetThreadIdByTaskId.values())],
    threadById: threadState.threadById,
  });

  const derivedTasks = tasks
    .map((task) => {
      const targetThreadId = threadState.targetThreadIdByTaskId.get(task.id);
      const targetThread =
        targetThreadId == null
          ? undefined
          : threadState.threadById.get(targetThreadId);
      const derived = deriveScratchpadTaskStatus({
        activeRunId: targetThread?.activeStreamId ?? null,
        messages:
          targetThreadId == null
            ? undefined
            : threadState.recentMessagesByThreadId.get(targetThreadId),
        pendingQuestion:
          targetThread != null &&
          threadState.pendingQuestionThreadIds.has(targetThread.id),
        persistedProgressText: task.progressText,
        status: task.status,
        threadStatus: targetThread?.status,
      });

      return {
        createdAt: task.createdAt,
        id: task.id,
        isClickable: Boolean(task.virtualThreadId || task.visibleThreadId),
        progressText: derived.progressText,
        status: derived.status,
        threadActiveRunId: targetThread?.activeStreamId ?? null,
        threadChatEngine: targetThread?.chatEngine ?? null,
        threadStatus: targetThread?.status ?? null,
        threadTitle: targetThread?.title ?? null,
        title: deriveScratchpadTaskTitle({
          taskTitle: task.title,
          threadTitle: targetThread?.title,
        }),
        updatedAt: task.updatedAt,
        virtualThreadId: task.virtualThreadId,
        visibleThreadId:
          task.virtualThreadId == null
            ? task.visibleThreadId
            : (threadState.visibleChildByVirtualThreadId.get(
                task.virtualThreadId,
              )?.id ?? task.visibleThreadId),
      } satisfies DerivedScratchpadTask;
    })
    .sort((a, b) => {
      const statusPriority = (status: ScratchpadTaskStatus) => {
        if (status === "running") return 0;
        if (status === "blocked") return 1;
        if (status === "failed") return 2;
        if (status === "pending") return 3;
        return 4;
      };

      return (
        statusPriority(a.status) - statusPriority(b.status) ||
        b.updatedAt.getTime() - a.updatedAt.getTime()
      );
    });

  return {
    hubThreadId: scratchpad?.hubThreadId ?? null,
    id: scratchpad?.id ?? null,
    tasks: derivedTasks,
    workspaceId: params.workspaceId,
  };
}

export async function createScratchpadTask(params: {
  database?: Database;
  engine?: ChatEngine;
  modelId?: string;
  permissionModeOverride?: PermissionMode;
  projectMode?: RepoProjectMode;
  reasoningEffort?: ReasoningEffort;
  scheduleTaskRun?: (input: LaunchScratchpadTaskRunInput) => void;
  title: string;
  userId: string;
  workspaceId: string;
}) {
  const database = params.database ?? db;
  const scratchpad = await ensureScratchpadRecord({
    database,
    userId: params.userId,
    workspaceId: params.workspaceId,
  });
  const latestTask = await database.query.scratchpadTasks.findFirst({
    where: eq(scratchpadTasks.scratchpadId, scratchpad.id),
    orderBy: (table, { desc }) => [desc(table.sortOrder)],
    columns: {
      sortOrder: true,
    },
  });

  const now = new Date();
  const taskId = createId();
  const virtualThreadId = crypto.randomUUID();
  const visibleThreadId = crypto.randomUUID();
  const permissionModeOverride = params.permissionModeOverride ?? "full";
  const projectMode = params.projectMode ?? "local";
  const threadState = await buildScratchpadThreadState({
    database,
    permissionModeOverride,
    projectMode,
    threadId: virtualThreadId,
    workspaceId: params.workspaceId,
  });

  database.transaction((tx) => {
    tx.insert(threads)
      .values({
        chatEngine: params.engine ?? SCRATCHPAD_ENGINE,
        ...(threadState ? { chatEngineState: threadState } : {}),
        ...(params.modelId ? { chatModelId: params.modelId } : {}),
        ...(params.reasoningEffort
          ? { chatReasoningEffort: params.reasoningEffort }
          : {}),
        id: virtualThreadId,
        mode: SCRATCHPAD_THREAD_MODE,
        parentThreadId: scratchpad.hubThreadId,
        title: `Scratchpad: ${params.title}`,
        userId: params.userId,
        virtualKey: `scratchpad-task:${taskId}`,
        visibility: "virtual",
        workspaceId: params.workspaceId,
      })
      .run();

    tx.insert(threads)
      .values({
        chatEngine: params.engine ?? SCRATCHPAD_ENGINE,
        ...(threadState ? { chatEngineState: threadState } : {}),
        ...(params.modelId ? { chatModelId: params.modelId } : {}),
        ...(params.reasoningEffort
          ? { chatReasoningEffort: params.reasoningEffort }
          : {}),
        id: visibleThreadId,
        mode: SCRATCHPAD_THREAD_MODE,
        parentThreadId: scratchpad.hubThreadId,
        sourceVirtualThreadId: virtualThreadId,
        // Keep the visible child in the same placeholder state as a fresh
        // thread so the normal runtime title generation path still runs.
        title: "New thread",
        userId: params.userId,
        visibility: "visible",
        workspaceId: params.workspaceId,
      })
      .run();

    tx.insert(scratchpadTasks)
      .values({
        createdAt: now,
        id: taskId,
        progressText: "Thinking",
        scratchpadId: scratchpad.id,
        sortOrder: (latestTask?.sortOrder ?? -1) + 1,
        status: "running",
        title: params.title,
        updatedAt: now,
        virtualThreadId,
        visibleThreadId,
      })
      .run();

    tx.update(scratchpads)
      .set({ updatedAt: now })
      .where(eq(scratchpads.id, scratchpad.id))
      .run();
  });

  (params.scheduleTaskRun ?? scheduleScratchpadTaskRun)({
    database,
    ...(params.engine ? { engine: params.engine } : {}),
    ...(params.modelId ? { modelId: params.modelId } : {}),
    ...(params.reasoningEffort
      ? { reasoningEffort: params.reasoningEffort }
      : {}),
    taskId,
    threadId: visibleThreadId,
    title: params.title,
    userId: params.userId,
    virtualThreadId,
    workspaceId: params.workspaceId,
  });

  return {
    createdAt: now,
    id: taskId,
    progressText: "Thinking",
    status: "running" as const,
    title: params.title,
    updatedAt: now,
    virtualThreadId,
    visibleThreadId,
  };
}

export async function deleteScratchpadTask(params: {
  database?: Database;
  taskId: string;
  userId: string;
}) {
  const database = params.database ?? db;
  const task = await findOwnedScratchpadTask({
    database,
    taskId: params.taskId,
    userId: params.userId,
  });

  if (!task || task.scratchpad.userId !== params.userId) {
    throw new Error("Scratchpad task not found.");
  }

  const threadIds = new Set<string>();
  if (task.virtualThreadId) {
    threadIds.add(task.virtualThreadId);
  }
  if (task.visibleThreadId) {
    threadIds.add(task.visibleThreadId);
  }

  if (task.virtualThreadId) {
    const visibleChildren = await database.query.threads.findMany({
      where: eq(threads.sourceVirtualThreadId, task.virtualThreadId),
      columns: { id: true },
    });

    for (const child of visibleChildren) {
      threadIds.add(child.id);
    }
  }

  for (const threadId of threadIds) {
    await disposeShellSession(threadId);
  }

  const archivedAt = new Date();
  database.transaction((tx) => {
    tx.delete(scratchpadTasks)
      .where(eq(scratchpadTasks.id, params.taskId))
      .run();

    if (threadIds.size > 0) {
      tx.update(threads)
        .set({ archivedAt, updatedAt: archivedAt })
        .where(inArray(threads.id, [...threadIds]))
        .run();
    }
  });

  return {
    archivedThreadIds: [...threadIds],
    id: params.taskId,
  };
}

export async function toggleScratchpadTaskComplete(params: {
  completed?: boolean;
  database?: Database;
  taskId: string;
  userId: string;
}) {
  const database = params.database ?? db;
  const task = await findOwnedScratchpadTask({
    database,
    taskId: params.taskId,
    userId: params.userId,
  });

  if (!task || task.scratchpad.userId !== params.userId) {
    throw new Error("Scratchpad task not found.");
  }

  const completed = params.completed ?? task.status !== "completed";
  const status: ScratchpadTaskStatus = completed ? "completed" : "pending";
  const progressText = completed ? (task.progressText ?? "Completed") : null;

  database
    .update(scratchpadTasks)
    .set({
      progressText,
      status,
      updatedAt: new Date(),
    })
    .where(eq(scratchpadTasks.id, params.taskId))
    .run();

  return {
    id: params.taskId,
    progressText,
    status,
  };
}

export async function resolveScratchpadTaskThread(params: {
  database?: Database;
  taskId: string;
  userId: string;
}) {
  const database = params.database ?? db;
  const task = await findOwnedScratchpadTask({
    database,
    taskId: params.taskId,
    userId: params.userId,
  });

  if (!task || task.scratchpad.userId !== params.userId) {
    throw new Error("Scratchpad task not found.");
  }

  if (!task.virtualThreadId && !task.visibleThreadId) {
    return {
      threadId: null,
      visibility: null,
    };
  }

  const visibleChild =
    task.virtualThreadId == null
      ? null
      : await database.query.threads.findFirst({
          where: eq(threads.sourceVirtualThreadId, task.virtualThreadId),
          orderBy: (table, { desc }) => [desc(table.updatedAt)],
          columns: {
            id: true,
            visibility: true,
          },
        });

  if (visibleChild?.id && visibleChild.id !== task.visibleThreadId) {
    database
      .update(scratchpadTasks)
      .set({
        updatedAt: new Date(),
        visibleThreadId: visibleChild.id,
      })
      .where(eq(scratchpadTasks.id, task.id))
      .run();
  }

  if (visibleChild) {
    return {
      threadId: visibleChild.id,
      visibility: visibleChild.visibility,
    };
  }

  return {
    threadId: task.visibleThreadId ?? task.virtualThreadId,
    visibility: task.visibleThreadId ? "visible" : "virtual",
  };
}
