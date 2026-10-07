import { NextResponse } from "next/server";

import { shutdownAgentProcesses } from "@/lib/runtime/process/shutdown";
import {
  getConfiguredInternalToken,
  verifyInternalToken,
} from "@/server/http/internal-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Electron main calls this before it stops the local server, so agent
// processes end gracefully instead of being orphaned by the SIGKILL that
// follows a stalled shutdown. See src/lib/runtime/process/shutdown.ts.
export async function POST(request: Request) {
  const decision = verifyInternalToken(
    request.headers,
    getConfiguredInternalToken(),
  );
  if (!decision.allowed) {
    return NextResponse.json(
      { error: decision.status === 404 ? "not_found" : "forbidden" },
      { headers: { "Cache-Control": "no-store" }, status: decision.status },
    );
  }

  const summary = await shutdownAgentProcesses();
  return NextResponse.json(
    { ok: true, ...summary },
    { headers: { "Cache-Control": "no-store" } },
  );
}
