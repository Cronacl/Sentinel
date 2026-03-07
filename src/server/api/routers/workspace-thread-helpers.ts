import { TRPCError } from "@trpc/server";

import type { ThreadListInput } from "@/schemas/workspace-thread.schema";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";

import type { createTRPCContext } from "../trpc";

type BaseTRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
type ProtectedTRPCContext = BaseTRPCContext & {
  db: typeof db;
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
};

export async function getOwnedWorkspaceOrThrow(
  ctx: ProtectedTRPCContext,
  workspaceId: string,
) {
  const workspace = await ctx.db.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace || workspace.userId !== ctx.session.user.id) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Workspace not found.",
    });
  }

  return workspace;
}

export async function getOwnedThreadOrThrow(
  ctx: ProtectedTRPCContext,
  threadId: string,
) {
  const thread = await ctx.db.thread.findUnique({
    where: { id: threadId },
    include: {
      workspace: true,
    },
  });

  if (
    !thread ||
    thread.userId !== ctx.session.user.id ||
    thread.workspace.userId !== ctx.session.user.id
  ) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Thread not found.",
    });
  }

  return thread;
}

export function getThreadListSettings(
  user: {
    threadListOrganizeBy?: "workspace" | "chronological" | null;
    threadListSortBy?: "created" | "updated" | null;
  },
  input?: ThreadListInput,
) {
  return {
    organizeBy: input?.organizeBy ?? user.threadListOrganizeBy ?? "workspace",
    sortBy: input?.sortBy ?? user.threadListSortBy ?? "updated",
    workspaceId: input?.workspaceId,
  };
}
