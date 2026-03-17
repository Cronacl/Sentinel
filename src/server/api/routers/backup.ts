import { z } from "zod";

import {
  createBackup,
  deleteBackup,
  listBackups,
} from "@/server/db/backup";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const backupRouter = createTRPCRouter({
  list: protectedProcedure.query(() => {
    return listBackups();
  }),

  create: protectedProcedure
    .input(z.object({ label: z.string().optional() }).optional())
    .mutation(async ({ input }) => {
      return createBackup(input?.label);
    }),

  delete: protectedProcedure
    .input(z.object({ filename: z.string() }))
    .mutation(({ input }) => {
      deleteBackup(input.filename);
      return { success: true };
    }),
});
