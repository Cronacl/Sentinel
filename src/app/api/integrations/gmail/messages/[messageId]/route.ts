import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getValidAccessToken } from "@/lib/integrations/oauth/token-manager";
import { GmailService } from "@/lib/integrations/providers/gmail/service";
import { db } from "@/server/db";
import { integrations } from "@/server/db/schema";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const session = await getLocalSession();

  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.userId, session.user.id),
      eq(integrations.provider, "gmail"),
      eq(integrations.isEnabled, true),
    ),
    columns: {
      id: true,
    },
  });

  if (!integration) {
    return NextResponse.json(
      { error: "Gmail is not connected or is disabled." },
      { status: 404 },
    );
  }

  try {
    const accessToken = await getValidAccessToken(integration.id);
    const service = new GmailService(accessToken);
    const email = await service.getEmail(messageId);

    return NextResponse.json({
      id: email.id,
      from: email.from,
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      body: email.body,
      date: email.date,
      attachmentCount: email.attachments.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch Gmail message.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
