import { TRPCError } from "@trpc/server";

import {
  createScratchpadTask,
  deleteScratchpadTask,
  listScratchpad,
  resolveScratchpadTaskThread,
  toggleScratchpadTaskComplete,
} from "@/lib/scratchpad/service";
import {
  scratchpadCreateTaskSchema,
  scratchpadTaskActionSchema,
  scratchpadToggleTaskCompleteSchema,
} from "@/schemas/scratchpad.schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { assertEngineInstanceSelection } from "./engines/selection";
import { getOwnedWorkspaceOrThrow } from "./workspace-thread-helpers";

type ScratchpadWorkspaceContext = Parameters<
  typeof getOwnedWorkspaceOrThrow
>[0] & {
  user: {
    selectedWorkspaceId?: string | null;
  };
  workspace: {
    id: string;
    isArchived?: boolean;
  } | null;
};

async function resolveScratchpadWorkspaceId(ctx: ScratchpadWorkspaceContext) {
  const workspaceId = ctx.user.selectedWorkspaceId ?? ctx.workspace?.id ?? null;

  if (!workspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Select a workspace before using Scratchpad.",
    });
  }

  const workspace = await getOwnedWorkspaceOrThrow(ctx, workspaceId);
  if (workspace.isArchived) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Archived workspaces cannot use Scratchpad.",
    });
  }

  return workspace.id;
}

export const scratchpadRouter = createTRPCRouter({
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const workspaceId = await resolveScratchpadWorkspaceId(ctx);
    return listScratchpad({
      database: ctx.db,
      userId: ctx.user.id,
      workspaceId,
    });
  }),

  createTask: protectedProcedure
    .input(scratchpadCreateTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const workspaceId = await resolveScratchpadWorkspaceId(ctx);
      if (input.engine) {
        await assertEngineInstanceSelection(
          ctx.user.id,
          input.engine,
          input.engineInstanceId,
        );
      }
      return createScratchpadTask({
        database: ctx.db,
        ...(input.engine ? { engine: input.engine } : {}),
        ...(input.engine && input.engineInstanceId
          ? { engineInstanceId: input.engineInstanceId }
          : {}),
        ...(input.modelId ? { modelId: input.modelId } : {}),
        ...(input.permissionModeOverride
          ? { permissionModeOverride: input.permissionModeOverride }
          : {}),
        ...(input.projectMode ? { projectMode: input.projectMode } : {}),
        ...(input.reasoningEffort
          ? { reasoningEffort: input.reasoningEffort }
          : {}),
        title: input.title,
        userId: ctx.user.id,
        workspaceId,
      });
    }),

  toggleTaskComplete: protectedProcedure
    .input(scratchpadToggleTaskCompleteSchema)
    .mutation(async ({ ctx, input }) => {
      return toggleScratchpadTaskComplete({
        completed: input.completed,
        database: ctx.db,
        taskId: input.taskId,
        userId: ctx.user.id,
      });
    }),

  deleteTask: protectedProcedure
    .input(scratchpadTaskActionSchema)
    .mutation(async ({ ctx, input }) => {
      return deleteScratchpadTask({
        database: ctx.db,
        taskId: input.taskId,
        userId: ctx.user.id,
      });
    }),

  resolveTaskThread: protectedProcedure
    .input(scratchpadTaskActionSchema)
    .query(async ({ ctx, input }) => {
      return resolveScratchpadTaskThread({
        database: ctx.db,
        taskId: input.taskId,
        userId: ctx.user.id,
      });
    }),
});
