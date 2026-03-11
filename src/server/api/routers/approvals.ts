import { and, eq } from "drizzle-orm";

import {
  buildEffectiveToolApprovalPolicies,
  buildToolApprovalOverrideMap,
  getDefaultToolApproval,
} from "@/lib/ai/chat/tool-approval-policy";
import {
  approvalsUpdateSchema,
  type ToolApprovalUpdateInput,
} from "@/schemas/approvals.schema";
import { toolApprovalPolicies } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

function toUpdates(input: ToolApprovalUpdateInput) {
  return "policies" in input ? input.policies : [input];
}

export const approvalsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.toolApprovalPolicies.findMany({
      where: eq(toolApprovalPolicies.userId, ctx.session.user.id),
      columns: {
        requireApproval: true,
        toolName: true,
      },
    });

    return buildEffectiveToolApprovalPolicies(
      buildToolApprovalOverrideMap(rows),
    );
  }),

  update: protectedProcedure
    .input(approvalsUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const updates = toUpdates(input);

      ctx.db.transaction((tx) => {
        for (const update of updates) {
          tx.delete(toolApprovalPolicies)
            .where(
              and(
                eq(toolApprovalPolicies.userId, userId),
                eq(toolApprovalPolicies.toolName, update.toolName),
              ),
            )
            .run();

          if (
            update.requireApproval === getDefaultToolApproval(update.toolName)
          ) {
            continue;
          }

          tx.insert(toolApprovalPolicies)
            .values({
              requireApproval: update.requireApproval,
              toolName: update.toolName,
              userId,
            })
            .run();
        }
      });

      const rows = await ctx.db.query.toolApprovalPolicies.findMany({
        where: eq(toolApprovalPolicies.userId, userId),
        columns: {
          requireApproval: true,
          toolName: true,
        },
      });

      return buildEffectiveToolApprovalPolicies(
        buildToolApprovalOverrideMap(rows),
      );
    }),
});
