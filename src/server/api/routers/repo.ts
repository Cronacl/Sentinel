import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  commitAllChanges,
  createAndCheckoutBranch,
  initializeRepository,
  pushCurrentBranch,
  resolveRepoContext,
} from "@/lib/git/repo";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { getOwnedWorkspaceOrThrow } from "./workspace-thread-helpers";

const workspaceInputSchema = z.object({
  workspaceId: z.string().min(1),
});

function assertWorkspaceRootPath(rootPath: string | null) {
  if (!rootPath?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This workspace does not have a root path.",
    });
  }

  return rootPath;
}

export const repoRouter = createTRPCRouter({
  getContext: protectedProcedure
    .input(workspaceInputSchema)
    .query(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await resolveRepoContext(workspace.rootPath);
    }),

  commit: protectedProcedure
    .input(
      workspaceInputSchema.extend({
        message: z.string().trim().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await commitAllChanges(
        assertWorkspaceRootPath(workspace.rootPath),
        input.message,
      );
    }),

  createBranch: protectedProcedure
    .input(
      workspaceInputSchema.extend({
        branchName: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await createAndCheckoutBranch(
        assertWorkspaceRootPath(workspace.rootPath),
        input.branchName,
      );
    }),

  init: protectedProcedure
    .input(workspaceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await initializeRepository(
        assertWorkspaceRootPath(workspace.rootPath),
      );
    }),

  push: protectedProcedure
    .input(workspaceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await pushCurrentBranch(
        assertWorkspaceRootPath(workspace.rootPath),
      );
    }),
});
