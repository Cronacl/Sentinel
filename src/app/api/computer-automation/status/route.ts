import { NextResponse } from "next/server";

import {
  getComputerAutomationClientStatus,
  markComputerAutomationClientSeen,
} from "@/lib/computer/automation-server";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getLocalSession();
  markComputerAutomationClientSeen(session.user.id);
  return NextResponse.json(getComputerAutomationClientStatus(session.user.id));
}
