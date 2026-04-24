import { and, eq, isNull } from "drizzle-orm";
import { generateId } from "ai";
import { createId } from "@paralleldrive/cuid2";

import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import { automationRuns, automations } from "@/server/db/schema";
import { runThreadChat } from "@/lib/ai/chat";
import type { ChatEngine } from "@/server/db/enums";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import { computeNextRunAt } from "./schedule-utils";

const log = createLogger("Automations");

function buildAutomationRunPatch(automation: {
  scheduleCron: string | null;
  scheduleDayOfWeek: number | null;
  scheduleTime: string | null;
  scheduleType: "hourly" | "daily" | "weekly" | "weekdays" | "custom";
  status: "active" | "paused";
}) {
  return {
    lastRanAt: new Date(),
    ...(automation.status === "active"
      ? {
          nextRunAt: computeNextRunAt({
            scheduleType: automation.scheduleType,
            scheduleDayOfWeek: automation.scheduleDayOfWeek,
            scheduleTime: automation.scheduleTime,
            scheduleCron: automation.scheduleCron,
          }),
        }
      : {}),
  };
}

function buildAutomationFailurePatch(automation: {
  scheduleCron: string | null;
  scheduleDayOfWeek: number | null;
  scheduleTime: string | null;
  scheduleType: "hourly" | "daily" | "weekly" | "weekdays" | "custom";
  status: "active" | "paused";
}) {
  return automation.status === "active"
    ? {
        lastRanAt: new Date(),
        nextRunAt: null,
        status: "paused" as const,
      }
    : buildAutomationRunPatch(automation);
}

function recordFailedAutomationRun(
  automation: {
    id: string;
    scheduleCron: string | null;
    scheduleDayOfWeek: number | null;
    scheduleTime: string | null;
    scheduleType: "hourly" | "daily" | "weekly" | "weekdays" | "custom";
    status: "active" | "paused";
  },
  params: {
    automationId: string;
    error: string;
    runId: string;
  },
) {
  db.insert(automationRuns)
    .values({
      id: params.runId,
      automationId: params.automationId,
      status: "failed",
      error: params.error,
      startedAt: new Date(),
      completedAt: new Date(),
    })
    .run();

  db.update(automations)
    .set(buildAutomationFailurePatch(automation))
    .where(eq(automations.id, automation.id))
    .run();
}

async function executeAutomationChat(params: {
  chatInput: {
    id: string;
    message: {
      content: string;
      createdAt: Date;
      id: string;
      parts: Array<{ text: string; type: "text" }>;
      role: "user";
    };
    modelId?: string;
    reasoningEffort?: ReasoningEffort;
    toolsEnabled?: boolean;
    trigger: "submit-user-message";
    workspaceId: string;
  };
  engine: ChatEngine;
  userId: string;
}) {
  const toolsEnabled =
    params.engine === "cursor" || params.engine === "opencode"
      ? false
      : params.chatInput.toolsEnabled;

  return runThreadChat(
    {
      ...params.chatInput,
      engine: params.engine,
      ...(toolsEnabled === undefined ? {} : { toolsEnabled }),
    },
    params.userId,
  );
}

export async function executeAutomationRun(
  automationId: string,
  options?: { allowPaused?: boolean },
) {
  const automation = await db.query.automations.findFirst({
    where: eq(automations.id, automationId),
    with: { workspace: true },
  });

  if (!automation) {
    log.error(`Cannot execute run: automation ${automationId} not found`);
    return;
  }

  if (automation.status !== "active" && !options?.allowPaused) {
    return;
  }

  const runId = createId();
  const workspaceId = automation.workspaceId ?? automation.workspace?.id;

  if (!workspaceId) {
    log.error(`Cannot execute "${automation.title}": no workspace configured`);

    recordFailedAutomationRun(automation, {
      automationId,
      error: "No workspace configured for this automation.",
      runId,
    });

    return;
  }

  if (!automation.workspace || automation.workspace.isArchived) {
    log.error(`Cannot execute "${automation.title}": workspace is archived`);

    recordFailedAutomationRun(automation, {
      automationId,
      error: "This automation's workspace is archived or unavailable.",
      runId,
    });

    return;
  }

  const startedRun = db.transaction((tx) => {
    const inFlightRun = tx
      .select({ id: automationRuns.id })
      .from(automationRuns)
      .where(
        and(
          eq(automationRuns.automationId, automationId),
          isNull(automationRuns.completedAt),
        ),
      )
      .get();

    if (inFlightRun) {
      return null;
    }

    const threadId = createId();

    tx.insert(automationRuns)
      .values({
        id: runId,
        automationId,
        threadId,
        status: "running",
        startedAt: new Date(),
      })
      .run();

    return { threadId };
  });

  if (!startedRun) {
    log.warn(
      `Skipping run for "${automation.title}": another run is already in progress`,
    );
    return;
  }

  try {
    const messageId = generateId();
    const chatInput = {
      id: startedRun.threadId,
      workspaceId,
      trigger: "submit-user-message" as const,
      message: {
        id: messageId,
        role: "user" as const,
        content: automation.prompt,
        parts: [{ type: "text" as const, text: automation.prompt }],
        createdAt: new Date(),
      },
      ...(automation.modelId ? { modelId: automation.modelId } : {}),
      ...(automation.reasoningEffort
        ? { reasoningEffort: automation.reasoningEffort }
        : {}),
    };
    const engine = automation.chatEngine ?? "sentinel";
    const response = await executeAutomationChat({
      chatInput,
      engine,
      userId: automation.userId,
    });

    if (response instanceof Response && response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    db.update(automationRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(automationRuns.id, runId))
      .run();

    db.update(automations)
      .set(buildAutomationRunPatch(automation))
      .where(eq(automations.id, automationId))
      .run();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    log.error(`Run failed for "${automation.title}": ${errorMessage}`);

    db.update(automationRuns)
      .set({
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
      })
      .where(eq(automationRuns.id, runId))
      .run();

    db.update(automations)
      .set(buildAutomationFailurePatch(automation))
      .where(eq(automations.id, automationId))
      .run();
  }
}
