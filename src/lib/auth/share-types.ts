import { db } from "@/server/db";

const q = db.user.findUnique({
	where: {
		id: "",
	},
});

export type MiddlewareUser = Awaited<typeof q>;
