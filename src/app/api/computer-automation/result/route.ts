import { NextResponse } from "next/server";

import {
  computerAutomationResultEnvelopeSchema,
  type ComputerAutomationResultEnvelope,
} from "@/lib/computer/automation-types";
import { submitComputerAutomationResult } from "@/lib/computer/automation-server";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getLocalSession();
  const json = await request.json();
  const parsed = computerAutomationResultEnvelopeSchema.parse(
    json,
  ) as ComputerAutomationResultEnvelope;
  const accepted = submitComputerAutomationResult(session.user.id, parsed);

  return NextResponse.json({ accepted });
}
