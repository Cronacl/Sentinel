import { NextResponse } from "next/server";

import { pollComputerAutomationCommand } from "@/lib/computer/automation-server";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getLocalSession();
  const command = await pollComputerAutomationCommand({
    abortSignal: request.signal,
    userId: session.user.id,
  });

  return NextResponse.json({ command });
}
