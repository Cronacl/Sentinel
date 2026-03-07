import { type NextRequest, NextResponse } from "next/server";

import type { MiddlewareUser } from "@/lib/auth/share-types";
import { db } from "@/server/db";
import { getOrCreateLocalProfile } from "@/server/local-profile";

export const runtime = "nodejs";

async function fetchUserById(userId: string): Promise<MiddlewareUser | null> {
  return db.user.findUnique({
    where: {
      id: userId,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const profile = await getOrCreateLocalProfile();
    const user = await fetchUserById(profile.id);
    return NextResponse.json(user);
  } catch (error) {
    console.error("[Middleware] get-user API error:", error);
    return NextResponse.json(null);
  }
}
