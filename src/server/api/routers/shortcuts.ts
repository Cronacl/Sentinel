import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  findShortcutConflicts,
  listShortcutMetadata,
  mergeShortcutBindings,
} from "@/lib/shortcuts/registry";
import {
  normalizeShortcutOverrides,
  shortcutOverridesUpdateSchema,
  shortcutPlatformSchema,
} from "@/lib/shortcuts/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { users } from "@/server/db/schema";

export const shortcutsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(
      z
        .object({
          platform: shortcutPlatformSchema,
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const platform = input?.platform ?? "linux";
      const user = await ctx.db.query.users.findFirst({
        columns: {
          shortcutOverrides: true,
        },
        where: eq(users.id, ctx.session.user.id),
      });

      const overrides = (() => {
        try {
          return normalizeShortcutOverrides(user?.shortcutOverrides);
        } catch {
          return normalizeShortcutOverrides(null);
        }
      })();

      return {
        actions: listShortcutMetadata(),
        effectiveBindings: mergeShortcutBindings(platform, overrides),
        overrides,
        platform,
      };
    }),

  update: protectedProcedure
    .input(shortcutOverridesUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        columns: {
          shortcutOverrides: true,
        },
        where: eq(users.id, ctx.session.user.id),
      });

      let currentOverrides;
      let nextOverrides;

      try {
        currentOverrides = normalizeShortcutOverrides(
          currentUser?.shortcutOverrides,
        );
        nextOverrides = normalizeShortcutOverrides({
          bindings: {
            ...currentOverrides.bindings,
            ...input.bindings,
          },
          version: 1,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Invalid shortcut overrides.",
        });
      }

      const conflicts = findShortcutConflicts(nextOverrides);
      if (conflicts.length > 0) {
        const [firstConflict] = conflicts;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Shortcut conflict for ${firstConflict?.actionIds.join(", ")} on ${firstConflict?.platform}.`,
        });
      }

      ctx.db
        .update(users)
        .set({
          shortcutOverrides: nextOverrides,
        })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return nextOverrides;
    }),
});
