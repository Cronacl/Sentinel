"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/server/better-auth";

export async function signInWithGoogle() {
	const response = await auth.api.signInSocial({
		body: {
			provider: "google",
			callbackURL: "/",
		},
	});

	if (!response.url) {
		throw new Error("Better Auth did not return a Google sign-in URL.");
	}

	redirect(response.url);
}

export async function signOut() {
	await auth.api.signOut({
		headers: await headers(),
	});

	redirect("/login");
}
