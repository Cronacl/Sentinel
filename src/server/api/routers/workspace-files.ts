import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { searchWorkspaceFiles } from "@/lib/workspace/file-search";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { getOwnedWorkspaceOrThrow } from "./workspace-thread-helpers";

export const workspaceFilesRouter = createTRPCRouter({
  search: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(15),
        query: z.string().max(200).default(""),
        workspaceId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const rootPath = workspace.rootPath?.trim();

      if (!rootPath) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Workspace has no root path configured.",
        });
      }

      const items = await searchWorkspaceFiles({
        limit: input.limit,
        query: input.query,
        rootPath,
      });

      return { items };
    }),
});
