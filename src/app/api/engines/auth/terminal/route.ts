import { NextResponse } from "next/server";
import { z } from "zod";

import { ENGINE_AUTH_TICKET_PATTERN } from "@/lib/ai/chat/engines/contract";
import { getEngineAuthFlowStore } from "@/lib/ai/chat/engines/platform/auth/flow-store";
import {
  getConfiguredInternalToken,
  verifyInternalToken,
} from "@/server/http/internal-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Electron main redeems a sign-in flow's launch ticket here before it spawns
// the embedded terminal (desktop/main/terminal-commands.mjs): it runs the
// command the server answers with, never one the renderer describes. A
// ticket works once, for a few minutes, while its flow waits on that
// terminal. The packaged app passes its per-launch internal token too; a dev
// or web server has none, and the ticket (256 random bits, minted only for
// the user's own flow) is the credential.

const NO_STORE = { "Cache-Control": "no-store" };

const requestSchema = z.object({
  ticket: z.string().regex(ENGINE_AUTH_TICKET_PATTERN),
});

export async function POST(request: Request) {
  const expectedToken = getConfiguredInternalToken();
  if (expectedToken) {
    const decision = verifyInternalToken(request.headers, expectedToken);
    if (!decision.allowed) {
      return NextResponse.json(
        { error: "forbidden" },
        { headers: NO_STORE, status: 403 },
      );
    }
  }

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  const spec = body.success
    ? getEngineAuthFlowStore().redeemTerminalTicket(body.data.ticket)
    : null;
  if (!spec) {
    return NextResponse.json(
      { error: "not_found" },
      { headers: NO_STORE, status: 404 },
    );
  }

  return NextResponse.json(spec, { headers: NO_STORE });
}
