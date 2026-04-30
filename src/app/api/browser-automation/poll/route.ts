import { NextResponse } from "next/server";

import { pollBrowserAutomationCommand } from "@/lib/browser/automation-server";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getLocalSession();
  const command = await pollBrowserAutomationCommand({
    abortSignal: request.signal,
    userId: session.user.id,
  });

  return NextResponse.json({ command });
}
