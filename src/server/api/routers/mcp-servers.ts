import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { encrypt } from "@/lib/ai/providers/encrypt";
import { getMcpCatalogEntry } from "@/lib/mcp/catalog";
import { validateMcpServerConfig } from "@/lib/mcp/config";
import { parseStoredMcpServer } from "@/lib/mcp/runtime";
import {
  mcpServerDeleteSchema,
  mcpServerGetSchema,
  mcpServerToggleSchema,
  mcpServerUpsertSchema,
} from "@/schemas/mcp-server.schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { mcpServerConfigs } from "@/server/db/schema";

export const mcpServersRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.mcpServerConfigs.findMany({
      where: eq(mcpServerConfigs.userId, ctx.session.user.id),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    });

    return rows.map((row) => {
      try {
        parseStoredMcpServer(row);

        return {
          catalogId: row.catalogId,
          id: row.id,
          isEnabled: row.isEnabled,
          name: row.name,
          status: row.isEnabled ? ("active" as const) : ("disabled" as const),
          transport: row.transport,
        };
      } catch (error) {
        return {
          catalogId: row.catalogId,
          errorMessage:
            error instanceof Error
              ? error.message
              : "MCP server settings could not be read.",
          id: row.id,
          isEnabled: false,
          name: row.name,
          status: "invalid" as const,
          transport: row.transport,
        };
      }
    });
  }),

  get: protectedProcedure
    .input(mcpServerGetSchema)
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.mcpServerConfigs.findFirst({
        where: and(
          eq(mcpServerConfigs.id, input.id),
          eq(mcpServerConfigs.userId, ctx.session.user.id),
        ),
      });

      if (!row) {
        return null;
      }

      try {
        const parsed = parseStoredMcpServer(row);
        return {
          catalogId: row.catalogId,
          config: parsed.config,
          id: parsed.id,
          isEnabled: parsed.isEnabled,
          name: parsed.name,
          transport: parsed.transport,
        };
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "MCP server settings could not be read.",
        });
      }
    }),

  upsert: protectedProcedure
    .input(mcpServerUpsertSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const catalogEntry = input.catalogId
        ? getMcpCatalogEntry(input.catalogId)
        : undefined;

      if (input.catalogId && !catalogEntry) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unknown MCP catalog server.",
        });
      }

      if (catalogEntry && input.transport !== catalogEntry.transport) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Catalog MCP transport does not match the selected server.",
        });
      }

      const config = validateMcpServerConfig(
        catalogEntry?.transport ?? input.transport,
        input.config,
      );
      const encryptedConfig = encrypt(JSON.stringify(config));
      const name = catalogEntry?.name ?? input.name;
      const transport = catalogEntry?.transport ?? input.transport;
      const existingByCatalog = input.catalogId
        ? await ctx.db.query.mcpServerConfigs.findFirst({
            where: and(
              eq(mcpServerConfigs.catalogId, input.catalogId),
              eq(mcpServerConfigs.userId, userId),
            ),
            columns: { id: true },
          })
        : null;
      const targetId = input.id ?? existingByCatalog?.id;

      if (targetId) {
        const existing = await ctx.db.query.mcpServerConfigs.findFirst({
          where: and(
            eq(mcpServerConfigs.id, targetId),
            eq(mcpServerConfigs.userId, userId),
          ),
          columns: { id: true },
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "MCP server not found.",
          });
        }

        ctx.db
          .update(mcpServerConfigs)
          .set({
            catalogId: input.catalogId,
            encryptedConfig,
            isEnabled: input.isEnabled,
            name,
            transport,
          })
          .where(eq(mcpServerConfigs.id, existing.id))
          .run();

        return {
          catalogId: input.catalogId,
          config,
          id: existing.id,
          isEnabled: input.isEnabled,
          name,
          transport,
        };
      }

      const id = createId();
      ctx.db
        .insert(mcpServerConfigs)
        .values({
          catalogId: input.catalogId,
          encryptedConfig,
          id,
          isEnabled: input.isEnabled,
          name,
          transport,
          userId,
        })
        .run();

      return {
        catalogId: input.catalogId,
        config,
        id,
        isEnabled: input.isEnabled,
        name,
        transport,
      };
    }),

  delete: protectedProcedure
    .input(mcpServerDeleteSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.db
        .delete(mcpServerConfigs)
        .where(
          and(
            eq(mcpServerConfigs.id, input.id),
            eq(mcpServerConfigs.userId, ctx.session.user.id),
          ),
        )
        .run();

      return { success: true };
    }),

  toggle: protectedProcedure
    .input(mcpServerToggleSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.mcpServerConfigs.findFirst({
        where: and(
          eq(mcpServerConfigs.id, input.id),
          eq(mcpServerConfigs.userId, ctx.session.user.id),
        ),
        columns: { id: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "MCP server not found.",
        });
      }

      ctx.db
        .update(mcpServerConfigs)
        .set({ isEnabled: input.isEnabled })
        .where(eq(mcpServerConfigs.id, existing.id))
        .run();

      return {
        id: existing.id,
        isEnabled: input.isEnabled,
      };
    }),
});
