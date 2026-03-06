import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { env } from "@/env";
import { db } from "@/server/db";

export const auth = betterAuth({
	database: prismaAdapter(db, {
		provider: "postgresql",
	}),
	trustedOrigins: [env.NEXT_PUBLIC_URL, env.BETTER_AUTH_URL],
	plugins: [passkey()],
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
			redirectURI: env.GOOGLE_REDIRECT_URI,
			enabled: true,
		},
	},
});

export type Session = typeof auth.$Infer.Session;
