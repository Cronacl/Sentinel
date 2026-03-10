import { type NextRequest, NextResponse } from "next/server";

import { eq } from "drizzle-orm";

import type { MiddlewareUser } from "@/lib/auth/share-types";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { getOrCreateLocalProfile } from "@/server/local-profile";

export const runtime = "nodejs";

async function fetchUserById(userId: string): Promise<MiddlewareUser> {
  return (
    (await db.query.users.findFirst({
      where: eq(users.id, userId),
    })) ?? null
  );
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
