import { NextResponse } from "next/server";

import {
  browserAutomationResultEnvelopeSchema,
  type BrowserAutomationResultEnvelope,
} from "@/lib/browser/automation-types";
import { submitBrowserAutomationResult } from "@/lib/browser/automation-server";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getLocalSession();
  const json = await request.json();
  const parsed = browserAutomationResultEnvelopeSchema.parse(
    json,
  ) as BrowserAutomationResultEnvelope;
  const accepted = submitBrowserAutomationResult(session.user.id, parsed);

  return NextResponse.json({ accepted });
}
