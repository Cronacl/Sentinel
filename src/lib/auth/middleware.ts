import type { MiddlewareRule } from "next-middleware-toolkit";
import { MiddlewareBuilder, Rules } from "next-middleware-toolkit";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import type { MiddlewareUser } from "@/lib/auth/share-types";

export { MiddlewareBuilder, Rules };
export type { MiddlewareRule };

const redirect = (path: string) =>
	NextResponse.redirect(new URL(path, env.NEXT_PUBLIC_URL));

export const AppRules = {
	isLoggedIn: (): MiddlewareRule<MiddlewareUser> =>
		Rules.custom(({ data }) => {
			if (data) return null;
			return redirect("/login");
		}),

	isNotLoggedIn: (): MiddlewareRule<MiddlewareUser> =>
		Rules.custom(({ data }) => {
			if (!data) return NextResponse.next();
			return redirect("/");
		}),
};

export function createFetchUser() {
	return async (req: NextRequest): Promise<MiddlewareUser | null> => {
		try {
			const cookie = req.headers.get("cookie") || "";
			const res = await fetch(new URL("/api/middleware/get-user", req.url), {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					Cookie: cookie,
				},
				cache: "no-store",
			});

			if (!res.ok) {
				return null;
			}

			return (await res.json()) as MiddlewareUser | null;
		} catch (error) {
			console.error("[Middleware] Error fetching user:", error);
			return null;
		}
	};
}
