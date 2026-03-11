import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { workspaces } from "@/server/db/schema";

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
