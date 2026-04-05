import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import type { ThreadListInput } from "@/schemas/workspace-thread.schema";
import type { Database } from "@/server/db";
import { threads, workspaces } from "@/server/db/schema";
import type { LocalSession } from "@/server/local-profile";

import type { createTRPCContext } from "../trpc";

type BaseTRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
type ProtectedTRPCContext = BaseTRPCContext & {
  db: Database;
  session: LocalSession;
};

export async function getOwnedWorkspaceOrThrow(
  ctx: ProtectedTRPCContext,
  workspaceId: string,
) {
  const workspace = await ctx.db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
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
  const thread = await ctx.db.query.threads.findFirst({
    where: and(eq(threads.id, threadId), eq(threads.visibility, "visible")),
    with: {
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

export async function getOwnedSubagentThreadOrThrow(
  ctx: ProtectedTRPCContext,
  threadId: string,
) {
  const thread = await ctx.db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    with: {
      workspace: true,
    },
  });

  if (
    !thread ||
    thread.userId !== ctx.session.user.id ||
    thread.workspace.userId !== ctx.session.user.id ||
    (thread.visibility !== "virtual" && thread.sourceVirtualThreadId == null)
  ) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Sub-agent thread not found.",
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
