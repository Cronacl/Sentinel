import { NextResponse } from "next/server";

import {
  getBrowserAutomationClientStatus,
  markBrowserAutomationClientSeen,
} from "@/lib/browser/automation-server";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getLocalSession();
  markBrowserAutomationClientSeen(session.user.id);
  return NextResponse.json(getBrowserAutomationClientStatus(session.user.id));
}
