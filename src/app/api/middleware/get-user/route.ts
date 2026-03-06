import { type NextRequest, NextResponse } from "next/server";

import type { MiddlewareUser } from "@/lib/auth/share-types";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";

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
		const session = await auth.api.getSession({
			headers: req.headers,
		});

		if (!session?.user?.id) {
			return NextResponse.json(null);
		}

		const user = await fetchUserById(session.user.id);
		return NextResponse.json(user);
	} catch (error) {
		console.error("[Middleware] get-user API error:", error);
		return NextResponse.json(null);
	}
}
