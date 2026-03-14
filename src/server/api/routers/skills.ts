import { z } from "zod";

import { getSkillSnapshot, loadSkillByName } from "@/lib/skills";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const skillsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return await getSkillSnapshot({
      workspaceRoot: ctx.workspace?.rootPath?.trim() || null,
    });
  }),
  get: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await loadSkillByName({
        name: input.name,
        workspaceRoot: ctx.workspace?.rootPath?.trim() || null,
      });
    }),
});
