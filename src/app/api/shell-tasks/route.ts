import { NextRequest, NextResponse } from "next/server";

import {
  listBackgroundShellCommands,
  stopBackgroundShellCommandById,
} from "@/lib/ai/chat/tools/shell";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await getLocalSession();

  return NextResponse.json({
    tasks: listBackgroundShellCommands(),
  });
}

export async function DELETE(request: NextRequest) {
  await getLocalSession();

  const body = (await request.json().catch(() => null)) as {
    backgroundTaskId?: unknown;
  } | null;
  const backgroundTaskId =
    typeof body?.backgroundTaskId === "string"
      ? body.backgroundTaskId.trim()
      : "";

  if (!backgroundTaskId) {
    return NextResponse.json(
      { error: "backgroundTaskId is required." },
      { status: 400 },
    );
  }

  const task = await stopBackgroundShellCommandById(backgroundTaskId);
  return NextResponse.json({ task });
}
