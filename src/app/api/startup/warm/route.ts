import { NextResponse } from "next/server";

import { startDeferredStartupTasks } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  void startDeferredStartupTasks().catch(() => {});

  return NextResponse.json({
    ok: true,
  });
}
