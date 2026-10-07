import { NextResponse } from "next/server";

import { disposeAllInstanceResources } from "@/lib/ai/chat/engines/platform/instance-resources";
import { shutdownAgentProcesses } from "@/lib/runtime/process/shutdown";
import { withTimeout } from "@/lib/runtime/process/with-timeout";
import {
  getConfiguredInternalToken,
  verifyInternalToken,
} from "@/server/http/internal-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Electron main calls this before it stops the local server, so agent
// processes end gracefully instead of being orphaned by the SIGKILL that
// follows a stalled shutdown. See src/lib/runtime/process/shutdown.ts.
const RUNTIME_DISPOSE_TIMEOUT_MS = 1_000;
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

  // Per-instance runtimes first (Copilot clients stop their SDK-managed
  // runtime politely, Codex app-servers end), then whatever is left in the
  // pid registry.
  await withTimeout(disposeAllInstanceResources(), RUNTIME_DISPOSE_TIMEOUT_MS, {
    nullOnError: true,
  });
  const summary = await shutdownAgentProcesses();
  return NextResponse.json(
    { ok: true, ...summary },
    { headers: { "Cache-Control": "no-store" } },
  );
}
