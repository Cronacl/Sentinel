import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import {
  createAutomationSchema,
  updateAutomationSchema,
} from "@/schemas/automation.schema";
import { automationRuns, automations } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  scheduleAutomation,
  unscheduleAutomation,
  pauseAutomation as pauseScheduledJob,
} from "@/lib/automations/scheduler";
import { executeAutomationRun } from "@/lib/automations/runner";
import { computeNextRunAt } from "@/lib/automations/schedule-utils";
import { getOwnedWorkspaceOrThrow } from "./workspace-thread-helpers";

type AutomationWorkspaceContext = Parameters<
  typeof getOwnedWorkspaceOrThrow
>[0] & {
  user: {
    selectedWorkspaceId?: string | null;
  };
  workspace: {
    id: string;
  } | null;
};

async function resolveAutomationWorkspaceId(
  ctx: AutomationWorkspaceContext,
  workspaceId: string | null | undefined,
) {
  const resolvedWorkspaceId =
    workspaceId ?? ctx.user.selectedWorkspaceId ?? ctx.workspace?.id ?? null;

  if (!resolvedWorkspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Select a workspace before creating an automation.",
    });
  }

  const workspace = await getOwnedWorkspaceOrThrow(ctx, resolvedWorkspaceId);
  if (workspace.isArchived) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Archived workspaces cannot be used for automations.",
    });
  }

  return workspace.id;
}

function assertValidNextRunAt(
  schedule: {
    scheduleCron?: string | null | undefined;
    scheduleType: string;
  },
  nextRunAt: Date | null,
) {
  if (nextRunAt) {
    return;
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      schedule.scheduleType === "custom"
        ? "Cron expression is invalid."
        : "Schedule configuration is invalid.",
  });
}

export const automationsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.automations.findMany({
      where: eq(automations.userId, ctx.user.id),
      with: { workspace: { columns: { id: true, name: true } } },
      orderBy: [desc(automations.updatedAt)],
    });

    const active = rows.filter((r) => r.status === "active");
    const paused = rows.filter((r) => r.status === "paused");

    return { active, paused };
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().trim().min(1) }))
    .query(async ({ ctx, input }) => {
      const automation = await ctx.db.query.automations.findFirst({
        where: and(
          eq(automations.id, input.id),
          eq(automations.userId, ctx.user.id),
        ),
        with: {
          workspace: { columns: { id: true, name: true } },
          runs: {
            orderBy: [desc(automationRuns.startedAt)],
            limit: 20,
            with: {
              thread: {
                columns: {
                  id: true,
                  title: true,
                  summary: true,
                  archivedAt: true,
                },
              },
            },
          },
        },
      });

      if (!automation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Automation not found.",
        });
      }

      return automation;
    }),

  create: protectedProcedure
    .input(createAutomationSchema)
    .mutation(async ({ ctx, input }) => {
      const workspaceId = await resolveAutomationWorkspaceId(
        ctx,
        input.workspaceId ?? null,
      );
      const nextRunAt = computeNextRunAt({
        scheduleType: input.scheduleType,
        scheduleDayOfWeek: input.scheduleDayOfWeek ?? null,
        scheduleTime: input.scheduleTime ?? null,
        scheduleCron: input.scheduleCron ?? null,
      });
      assertValidNextRunAt(input, nextRunAt);

      const [row] = await ctx.db
        .insert(automations)
        .values({
          userId: ctx.user.id,
          title: input.title,
          prompt: input.prompt,
          workspaceId,
          scheduleType: input.scheduleType,
          scheduleDayOfWeek: input.scheduleDayOfWeek ?? null,
          scheduleTime: input.scheduleTime ?? null,
          scheduleCron: input.scheduleCron ?? null,
          modelId: input.modelId ?? null,
          reasoningEffort: input.reasoningEffort ?? null,
          status: "paused",
          nextRunAt,
        })
        .returning();

      return row!;
    }),

  update: protectedProcedure
    .input(updateAutomationSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.automations.findFirst({
        where: and(
          eq(automations.id, input.id),
          eq(automations.userId, ctx.user.id),
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Automation not found.",
        });
      }

      const scheduleChanged =
        input.scheduleType !== undefined ||
        input.scheduleDayOfWeek !== undefined ||
        input.scheduleTime !== undefined ||
        input.scheduleCron !== undefined;

      const merged = {
        title: input.title ?? existing.title,
        prompt: input.prompt ?? existing.prompt,
        workspaceId:
          input.workspaceId !== undefined
            ? await resolveAutomationWorkspaceId(ctx, input.workspaceId)
            : existing.workspaceId,
        scheduleType: input.scheduleType ?? existing.scheduleType,
        scheduleDayOfWeek:
          input.scheduleDayOfWeek !== undefined
            ? input.scheduleDayOfWeek
            : existing.scheduleDayOfWeek,
        scheduleTime:
          input.scheduleTime !== undefined
            ? input.scheduleTime
            : existing.scheduleTime,
        scheduleCron:
          input.scheduleCron !== undefined
            ? input.scheduleCron
            : existing.scheduleCron,
        modelId: input.modelId !== undefined ? input.modelId : existing.modelId,
        reasoningEffort:
          input.reasoningEffort !== undefined
            ? input.reasoningEffort
            : existing.reasoningEffort,
      };

      const validated = createAutomationSchema.safeParse(merged);
      if (!validated.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            validated.error.issues[0]?.message ??
            "Automation settings are invalid.",
        });
      }

      const normalizedSchedule = {
        scheduleType: validated.data.scheduleType,
        scheduleDayOfWeek: validated.data.scheduleDayOfWeek ?? null,
        scheduleTime: validated.data.scheduleTime ?? null,
        scheduleCron: validated.data.scheduleCron ?? null,
      };
      const nextRunAt = scheduleChanged
        ? computeNextRunAt(normalizedSchedule)
        : undefined;
      if (scheduleChanged) {
        assertValidNextRunAt(validated.data, nextRunAt ?? null);
      }

      const { id: _id, ...updateFields } = input;
      const updateData: Record<string, unknown> = {};
      if (updateFields.title !== undefined)
        updateData.title = updateFields.title;
      if (updateFields.prompt !== undefined)
        updateData.prompt = updateFields.prompt;
      if (updateFields.workspaceId !== undefined)
        updateData.workspaceId = merged.workspaceId;
      if (updateFields.scheduleType !== undefined)
        updateData.scheduleType = updateFields.scheduleType;
      if (updateFields.scheduleDayOfWeek !== undefined)
        updateData.scheduleDayOfWeek = updateFields.scheduleDayOfWeek;
      if (updateFields.scheduleTime !== undefined)
        updateData.scheduleTime = updateFields.scheduleTime;
      if (updateFields.scheduleCron !== undefined)
        updateData.scheduleCron = updateFields.scheduleCron;
      if (updateFields.modelId !== undefined)
        updateData.modelId = updateFields.modelId;
      if (updateFields.reasoningEffort !== undefined)
        updateData.reasoningEffort = updateFields.reasoningEffort;
      if (nextRunAt !== undefined) updateData.nextRunAt = nextRunAt;

      const [updated] = await ctx.db
        .update(automations)
        .set(updateData)
        .where(
          and(
            eq(automations.id, input.id),
            eq(automations.userId, ctx.user.id),
          ),
        )
        .returning();

      if (updated && updated.status === "active" && scheduleChanged) {
        scheduleAutomation(updated);
      }

      return updated!;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.automations.findFirst({
        where: and(
          eq(automations.id, input.id),
          eq(automations.userId, ctx.user.id),
        ),
        columns: { id: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Automation not found.",
        });
      }

      unscheduleAutomation(input.id);

      await ctx.db
        .delete(automationRuns)
        .where(eq(automationRuns.automationId, input.id));

      await ctx.db
        .delete(automations)
        .where(
          and(
            eq(automations.id, input.id),
            eq(automations.userId, ctx.user.id),
          ),
        );

      return { success: true };
    }),

  toggleStatus: protectedProcedure
    .input(z.object({ id: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.automations.findFirst({
        where: and(
          eq(automations.id, input.id),
          eq(automations.userId, ctx.user.id),
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Automation not found.",
        });
      }

      const newStatus = existing.status === "active" ? "paused" : "active";
      const nextRunAt =
        newStatus === "active" ? computeNextRunAt(existing) : null;

      const [updated] = await ctx.db
        .update(automations)
        .set({ status: newStatus, nextRunAt })
        .where(
          and(
            eq(automations.id, input.id),
            eq(automations.userId, ctx.user.id),
          ),
        )
        .returning();

      if (newStatus === "active") {
        scheduleAutomation(updated!);
      } else {
        pauseScheduledJob(input.id);
      }

      return updated!;
    }),

  runNow: protectedProcedure
    .input(z.object({ id: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.automations.findFirst({
        where: and(
          eq(automations.id, input.id),
          eq(automations.userId, ctx.user.id),
        ),
        columns: { id: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Automation not found.",
        });
      }

      executeAutomationRun(input.id, { allowPaused: true }).catch((error) => {
        createLogger("Automations").error(
          `Manual run failed for ${input.id}: ${error instanceof Error ? error.message : error}`,
        );
      });

      return { triggered: true };
    }),

  listRuns: protectedProcedure
    .input(
      z.object({
        automationId: z.string().trim().min(1),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const existing = await ctx.db.query.automations.findFirst({
        where: and(
          eq(automations.id, input.automationId),
          eq(automations.userId, ctx.user.id),
        ),
        columns: { id: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Automation not found.",
        });
      }

      const runs = await ctx.db.query.automationRuns.findMany({
        where: eq(automationRuns.automationId, input.automationId),
        orderBy: [desc(automationRuns.startedAt)],
        limit: input.limit + 1,
        with: {
          thread: { columns: { id: true, title: true, summary: true } },
        },
      });

      const hasMore = runs.length > input.limit;
      const items = hasMore ? runs.slice(0, input.limit) : runs;
      const nextCursor = hasMore ? items.at(-1)?.id : undefined;

      return { items, nextCursor };
    }),
});
