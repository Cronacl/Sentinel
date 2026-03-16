import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getValidAccessToken } from "@/lib/integrations/oauth/token-manager";
import { GoogleDriveService } from "@/lib/integrations/providers/google-drive/service";
import { db } from "@/server/db";
import { integrations } from "@/server/db/schema";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId") ?? "root";
  const session = await getLocalSession();

  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.userId, session.user.id),
      eq(integrations.provider, "google_drive"),
      eq(integrations.isEnabled, true),
    ),
    columns: { id: true },
  });

  if (!integration) {
    return NextResponse.json(
      { error: "Google Drive is not connected or is disabled." },
      { status: 404 },
    );
  }

  try {
    const accessToken = await getValidAccessToken(integration.id);
    const service = new GoogleDriveService(accessToken);
    const result = await service.listFiles({
      folderId,
      maxResults: 100,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to list Google Drive files.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
