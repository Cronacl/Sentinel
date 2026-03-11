import { and, eq } from "drizzle-orm";

import type { PermissionMode } from "@/server/db/enums";
import { db } from "@/server/db";
import { users, workspaces } from "@/server/db/schema";

export async function getWorkspaceRootPath(workspaceId: string, userId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(
      eq(workspaces.id, workspaceId),
      eq(workspaces.userId, userId),
      eq(workspaces.isArchived, false),
    ),
    columns: { rootPath: true },
  });

  return workspace?.rootPath?.trim() || null;
}

export async function getToolPermissionMode(userId: string): Promise<PermissionMode> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { permissionMode: true },
  });

  return user?.permissionMode ?? "default";
}
