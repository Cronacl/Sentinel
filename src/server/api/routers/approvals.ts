import { and, eq, inArray } from "drizzle-orm";

import {
  buildEffectiveToolApprovalPolicies,
  buildToolApprovalOverrideMap,
  getDefaultToolApproval,
  isToolApprovalToolName,
  TOOL_APPROVAL_GROUPS,
} from "@/lib/ai/chat/tools/policy";
import {
  approvalsUpdateSchema,
  type ToolApprovalUpdateInput,
} from "@/schemas/approvals.schema";
import { toolApprovalPolicies } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

function toUpdates(input: ToolApprovalUpdateInput) {
  if ("policies" in input)
    return { type: "batch" as const, policies: input.policies };
  if ("groupId" in input)
    return {
      type: "group" as const,
      groupId: input.groupId,
      requireApproval: input.requireApproval,
    };
  return {
    type: "single" as const,
    toolName: input.toolName,
    requireApproval: input.requireApproval,
  };
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
      const parsed = toUpdates(input);

      if (parsed.type === "group") {
        const group = TOOL_APPROVAL_GROUPS[parsed.groupId];
        if (!group)
          throw new Error(`Unknown approval group: ${parsed.groupId}`);

        ctx.db.transaction((tx) => {
          tx.delete(toolApprovalPolicies)
            .where(
              and(
                eq(toolApprovalPolicies.userId, userId),
                eq(toolApprovalPolicies.toolName, `group:${parsed.groupId}`),
              ),
            )
            .run();

          tx.insert(toolApprovalPolicies)
            .values({
              requireApproval: parsed.requireApproval,
              toolName: `group:${parsed.groupId}`,
              userId,
            })
            .run();

          for (const toolName of group.toolNames) {
            tx.delete(toolApprovalPolicies)
              .where(
                and(
                  eq(toolApprovalPolicies.userId, userId),
                  eq(toolApprovalPolicies.toolName, toolName),
                ),
              )
              .run();
          }
        });
      } else {
        const updates = parsed.type === "batch" ? parsed.policies : [parsed];

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
              isToolApprovalToolName(update.toolName) &&
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
      }

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
